// server/routes/payments.js
//
// Preserves the existing manual UPI payment flow and adds Razorpay:
//
//   POST /api/payments/razorpay/order
//   POST /api/payments/razorpay/verify
//
// Razorpay verify flow:
//   1. Create order from the amount stored in Firestore.
//   2. Frontend completes Razorpay Checkout.
//   3. Frontend sends order_id/payment_id/signature.
//   4. Server verifies the signature AND confirms the Razorpay payment.
//   5. Booking is marked paid/confirmed.
//   6. Invoice creation is triggered automatically.
//
// IMPORTANT:
// The invoice route generated for this project must be mounted at
// /api/invoices and expose:
//   POST /api/invoices/payment-approved/:bookingId
//
// Do NOT trust a frontend "success" flag. The verify endpoint below
// validates the Razorpay signature using RAZORPAY_KEY_SECRET and then
// fetches the payment from Razorpay to confirm order, amount and capture state.

const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const db = require("../db");
const admin = require("../firebaseAdmin");

const {
  requireAuth,
  requireRole,
} = require("../middleware/auth");

const {
  createInvoiceFromVerifiedPayment,
} = require("./invoices");

const router = express.Router();

const firestore = admin.firestore();
const bookingsCollection = firestore.collection("bookings");

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many payment attempts. Please try again later.",
  },
});

const razorpayLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many Razorpay payment attempts. Please try again later.",
  },
});

let Razorpay;
try {
  Razorpay = require("razorpay");
} catch (_) {
  Razorpay = null;
}

function getRazorpay() {
  if (!Razorpay) {
    throw new Error(
      "Razorpay package is not installed. Run: npm install razorpay"
    );
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are missing from .env."
    );
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// ------------------------------------------------------------
// GET BOOKING
// ------------------------------------------------------------

router.get(
  "/booking/:bookingId",
  requireAuth,
  async (req, res) => {
    const bookingId = String(req.params.bookingId || "").trim();

    if (!bookingId || bookingId.length > 150) {
      return res.status(400).json({
        error: "Invalid booking ID.",
      });
    }

    try {
      const booking = await findBooking(bookingId);

      if (!booking) {
        return res.status(404).json({
          error: "Booking not found.",
        });
      }

      const ownerUid = getBookingUserId(booking.data);
      const isOwner = ownerUid === req.user.uid;
      const isStaff =
        req.user.role === "admin" ||
        req.user.role === "manager";

      if (!isOwner && !isStaff) {
        return res.status(403).json({
          error: "You do not have permission to view this booking.",
        });
      }

      const amount = getBookingAmount(booking.data);

      if (amount === null) {
        return res.status(500).json({
          error: "Booking does not contain a valid payable amount.",
        });
      }

      const existingPayment = db
        .prepare(`
          SELECT *
          FROM payments
          WHERE booking_id = ?
          ORDER BY id DESC
          LIMIT 1
        `)
        .get(booking.id);

      return res.json({
        success: true,
        booking: {
          id: booking.id,
          vehicleName: getVehicleName(booking.data),
          vehicleMeta: getVehicleMeta(booking.data),
          pickup: getFirstValue(booking.data, [
            "pickup",
            "pickupDate",
            "startDate",
            "pickup_datetime",
            "pickupDateTime",
          ]),
          drop: getFirstValue(booking.data, [
            "drop",
            "dropDate",
            "endDate",
            "returnDate",
            "drop_datetime",
            "dropDateTime",
          ]),
          duration: getFirstValue(booking.data, [
            "duration",
            "durationText",
            "days",
            "rentalDays",
          ]),
          amount,
          currency: "INR",
          status: booking.data.status || "pending",
          paymentStatus: booking.data.paymentStatus || null,
          razorpayOrderId: booking.data.razorpayOrderId || null,
        },
        payment: existingPayment
          ? sanitizePayment(existingPayment)
          : null,
      });
    } catch (error) {
      console.error("[get booking]", error);

      return res.status(500).json({
        error: "Unable to load booking.",
      });
    }
  }
);

// ------------------------------------------------------------
// RAZORPAY — CREATE ORDER
// ------------------------------------------------------------

router.post(
  "/razorpay/order",
  requireAuth,
  razorpayLimiter,
  async (req, res) => {
    const bookingId =
      typeof req.body?.bookingId === "string"
        ? req.body.bookingId.trim()
        : "";

    if (!bookingId || bookingId.length > 150) {
      return res.status(400).json({
        error: "Invalid booking ID.",
      });
    }

    try {
      const booking = await findBooking(bookingId);

      if (!booking) {
        return res.status(404).json({
          error: "Booking not found.",
        });
      }

      const bookingData = booking.data;
      const ownerUid = getBookingUserId(bookingData);

      if (!ownerUid || ownerUid !== req.user.uid) {
        return res.status(403).json({
          error: "This booking does not belong to your account.",
        });
      }

      const amount = getBookingAmount(bookingData);

      if (amount === null || amount <= 0) {
        return res.status(400).json({
          error: "Booking amount is invalid.",
        });
      }

      const bookingStatus =
        String(bookingData.status || "").toLowerCase();

      if (
        ["cancelled", "canceled", "completed", "rejected"].includes(
          bookingStatus
        )
      ) {
        return res.status(409).json({
          error: "This booking cannot accept a payment.",
        });
      }

      if (
        String(bookingData.paymentStatus || "").toLowerCase() ===
        "verified"
      ) {
        return res.status(409).json({
          error: "This booking has already been paid.",
        });
      }

      const razorpay = getRazorpay();

      // Reuse an existing open order when possible.
      const existingOrderId = bookingData.razorpayOrderId;

      if (existingOrderId) {
        try {
          const existingOrder =
            await razorpay.orders.fetch(existingOrderId);

          if (
            existingOrder &&
            existingOrder.status === "created" &&
            Number(existingOrder.amount) === Math.round(amount * 100)
          ) {
            return res.json({
              success: true,
              reused: true,
              keyId: process.env.RAZORPAY_KEY_ID,
              order: {
                id: existingOrder.id,
                amount: existingOrder.amount,
                currency: existingOrder.currency,
                status: existingOrder.status,
              },
            });
          }
        } catch (_) {
          // Stale/invalid order; create a fresh one below.
        }
      }

      const receipt =
        `KRZ-${String(booking.id).replace(/[^a-zA-Z0-9_-]/g, "")}-${Date.now()}`
          .slice(0, 40);

      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt,
        notes: {
          bookingId: String(booking.id),
          userId: String(req.user.uid),
        },
      });

      await bookingsCollection.doc(booking.id).update({
        razorpayOrderId: order.id,
        razorpayOrderAmount: order.amount,
        razorpayOrderCurrency: order.currency,
        paymentStatus: "created",
        paymentMethod: "razorpay",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(201).json({
        success: true,
        reused: false,
        keyId: process.env.RAZORPAY_KEY_ID,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          status: order.status,
        },
      });
    } catch (error) {
      console.error("[razorpay create order]", error);

      return res.status(500).json({
        error: error.message || "Unable to create Razorpay order.",
      });
    }
  }
);

// ------------------------------------------------------------
// RAZORPAY — VERIFY PAYMENT + AUTO CREATE INVOICE
// ------------------------------------------------------------

router.post(
  "/razorpay/verify",
  requireAuth,
  razorpayLimiter,
  async (req, res) => {
    const bookingId =
      typeof req.body?.bookingId === "string"
        ? req.body.bookingId.trim()
        : "";

    const razorpayOrderId =
      typeof req.body?.razorpay_order_id === "string"
        ? req.body.razorpay_order_id.trim()
        : "";

    const razorpayPaymentId =
      typeof req.body?.razorpay_payment_id === "string"
        ? req.body.razorpay_payment_id.trim()
        : "";

    const razorpaySignature =
      typeof req.body?.razorpay_signature === "string"
        ? req.body.razorpay_signature.trim()
        : "";

    if (
      !bookingId ||
      !razorpayOrderId ||
      !razorpayPaymentId ||
      !razorpaySignature
    ) {
      return res.status(400).json({
        error:
          "bookingId, razorpay_order_id, razorpay_payment_id and razorpay_signature are required.",
      });
    }

    try {
      const booking = await findBooking(bookingId);

      if (!booking) {
        return res.status(404).json({
          error: "Booking not found.",
        });
      }

      const bookingData = booking.data;
      const ownerUid = getBookingUserId(bookingData);

      if (!ownerUid || ownerUid !== req.user.uid) {
        return res.status(403).json({
          error: "This booking does not belong to your account.",
        });
      }

      const amount = getBookingAmount(bookingData);

      if (amount === null || amount <= 0) {
        return res.status(400).json({
          error: "Booking amount is invalid.",
        });
      }

      // ------------------------------------------------------
      // 1. VERIFY RAZORPAY SIGNATURE
      // ------------------------------------------------------

      if (!process.env.RAZORPAY_KEY_SECRET) {
        throw new Error(
          "RAZORPAY_KEY_SECRET is missing from .env."
        );
      }

      const generatedSignature = crypto
        .createHmac(
          "sha256",
          process.env.RAZORPAY_KEY_SECRET
        )
        .update(
          `${razorpayOrderId}|${razorpayPaymentId}`
        )
        .digest("hex");

      const suppliedBuffer = Buffer.from(
        razorpaySignature,
        "utf8"
      );

      const generatedBuffer = Buffer.from(
        generatedSignature,
        "utf8"
      );

      if (
        suppliedBuffer.length !== generatedBuffer.length ||
        !crypto.timingSafeEqual(
          suppliedBuffer,
          generatedBuffer
        )
      ) {
        return res.status(400).json({
          error: "Invalid Razorpay payment signature.",
        });
      }

      // ------------------------------------------------------
      // 2. VERIFY ORDER ID + PAYMENT AMOUNT WITH RAZORPAY
      // ------------------------------------------------------

      const razorpay = getRazorpay();

      const payment =
        await razorpay.payments.fetch(
          razorpayPaymentId
        );

      if (
        payment.order_id !== razorpayOrderId
      ) {
        return res.status(400).json({
          error:
            "Razorpay payment does not belong to the supplied order.",
        });
      }

      const expectedPaise =
        Math.round(amount * 100);

      if (
        Number(payment.amount) !== expectedPaise
      ) {
        return res.status(400).json({
          error:
            "Razorpay payment amount does not match the booking amount.",
        });
      }

      if (
        String(payment.currency || "")
          .toUpperCase() !== "INR"
      ) {
        return res.status(400).json({
          error:
            "Unsupported payment currency.",
        });
      }

      // Razorpay can expose "captured", "authorized", etc.
      // Invoice creation is allowed only after capture.
      if (
        String(payment.status || "").toLowerCase() !==
        "captured"
      ) {
        return res.status(409).json({
          error:
            `Payment is not captured yet. Current Razorpay status: ${payment.status}.`,
        });
      }

      // ------------------------------------------------------
      // 3. IDEMPOTENCY
      // ------------------------------------------------------

      if (
        String(bookingData.paymentStatus || "").toLowerCase() ===
          "verified" &&
        bookingData.razorpayPaymentId ===
          razorpayPaymentId
      ) {
        const invoiceResult =
          await createInvoiceFromVerifiedPayment({
            bookingId,
            razorpayOrderId,
            razorpayPaymentId,
            paymentMethod: "razorpay",
          });

        return res.json({
          success: true,
          alreadyVerified: true,
          message:
            "Payment was already verified.",
          payment: {
            orderId: razorpayOrderId,
            paymentId: razorpayPaymentId,
            amount,
            currency: "INR",
            status: "captured",
          },
          invoice: invoiceResult,
        });
      }

      // ------------------------------------------------------
      // 4. RECORD PAYMENT
      // ------------------------------------------------------

      let localPaymentId = null;

      try {
        const existing = db
          .prepare(`
            SELECT *
            FROM payments
            WHERE booking_id = ?
            AND status = 'verified'
            LIMIT 1
          `)
          .get(booking.id);

        if (existing) {
          localPaymentId = existing.id;
        } else {
          const result = db
            .prepare(`
              INSERT INTO payments (
                booking_id,
                user_id,
                amount,
                currency,
                method,
                utr,
                screenshot_media_id,
                status
              )
              VALUES (?, ?, ?, 'INR', 'razorpay', ?, NULL, 'verified')
            `)
            .run(
              booking.id,
              req.user.uid,
              amount,
              razorpayPaymentId
            );

          localPaymentId = result.lastInsertRowid;

          db.prepare(`
            UPDATE payments
            SET
              verified_at = datetime('now'),
              verified_by = ?
            WHERE id = ?
          `).run(
            req.user.uid,
            localPaymentId
          );
        }
      } catch (sqliteError) {
        console.error(
          "[razorpay sqlite payment record]",
          sqliteError
        );

        // The Firestore booking is the source of truth for the invoice
        // flow, so do not reject an otherwise verified Razorpay payment
        // solely because the local reporting table failed.
      }

      // ------------------------------------------------------
      // 5. MARK FIRESTORE BOOKING PAID
      // ------------------------------------------------------

      await bookingsCollection
        .doc(booking.id)
        .update({
          paymentStatus: "verified",
          paymentVerifiedAt:
            admin.firestore.FieldValue.serverTimestamp(),
          paymentVerifiedBy: req.user.uid,
          paymentMethod: "razorpay",
          paymentAmount: amount,
          paymentId:
            localPaymentId
              ? `PAY-${localPaymentId}`
              : razorpayPaymentId,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          razorpayPaymentStatus: "captured",
          status: "confirmed",
          updatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        });

      // ------------------------------------------------------
      // 6. AUTOMATIC INVOICE CREATION
      // ------------------------------------------------------

      const invoiceResult =
        await createInvoiceFromVerifiedPayment({
          bookingId,
          razorpayOrderId,
          razorpayPaymentId,
          paymentMethod: "razorpay",
        });

      return res.json({
        success: true,

        message:
          "Payment verified, booking confirmed and invoice created.",

        payment: {
          orderId: razorpayOrderId,
          paymentId: razorpayPaymentId,
          amount,
          amountPaise: expectedPaise,
          currency: "INR",
          status: "captured",
        },

        invoice: invoiceResult,
      });
    } catch (error) {
      console.error(
        "[razorpay verify]",
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          "Unable to verify Razorpay payment.",
      });
    }
  }
);

// ------------------------------------------------------------
// EXISTING MANUAL UPI — SUBMIT
// ------------------------------------------------------------

router.post(
  "/submit",
  requireAuth,
  paymentLimiter,
  async (req, res) => {
    const bookingId =
      typeof req.body.bookingId === "string"
        ? req.body.bookingId.trim()
        : "";

    const utr =
      typeof req.body.utr === "string"
        ? req.body.utr.trim()
        : "";

    const screenshotMediaId =
      Number(req.body.screenshotMediaId);

    if (!bookingId || bookingId.length > 150) {
      return res.status(400).json({
        error: "Invalid booking ID.",
      });
    }

    if (!utr || utr.length < 6 || utr.length > 100) {
      return res.status(400).json({
        error: "Enter a valid UTR / transaction reference.",
      });
    }

    if (
      !Number.isInteger(screenshotMediaId) ||
      screenshotMediaId <= 0
    ) {
      return res.status(400).json({
        error: "Payment screenshot is required.",
      });
    }

    try {
      const booking =
        await findBooking(bookingId);

      if (!booking) {
        return res.status(404).json({
          error: "Booking not found.",
        });
      }

      const bookingData =
        booking.data;

      const ownerUid =
        getBookingUserId(bookingData);

      if (
        ownerUid &&
        ownerUid !== req.user.uid
      ) {
        return res.status(403).json({
          error:
            "This booking does not belong to your account.",
        });
      }

      if (!ownerUid) {
        return res.status(500).json({
          error:
            "Booking owner could not be verified.",
        });
      }

      const amount =
        getBookingAmount(bookingData);

      if (amount === null || amount <= 0) {
        return res.status(400).json({
          error:
            "Booking amount is invalid.",
        });
      }

      const bookingStatus =
        String(
          bookingData.status || ""
        ).toLowerCase();

      if (
        [
          "cancelled",
          "canceled",
          "completed",
          "rejected",
        ].includes(bookingStatus)
      ) {
        return res.status(409).json({
          error:
            "This booking cannot accept a payment.",
        });
      }

      const media =
        db.prepare(`
          SELECT *
          FROM media
          WHERE id = ?
          AND deleted_at IS NULL
        `).get(screenshotMediaId);

      if (!media) {
        return res.status(404).json({
          error:
            "Payment screenshot not found.",
        });
      }

      if (
        media.user_id !==
        req.user.uid
      ) {
        return res.status(403).json({
          error:
            "Payment screenshot does not belong to your account.",
        });
      }

      if (
        media.category !==
        "payment_screenshot"
      ) {
        return res.status(400).json({
          error:
            "Invalid payment screenshot.",
        });
      }

      const duplicateUtr =
        db.prepare(`
          SELECT *
          FROM payments
          WHERE LOWER(utr) = LOWER(?)
          LIMIT 1
        `).get(utr);

      if (duplicateUtr) {
        return res.status(409).json({
          error:
            "This transaction reference has already been submitted.",
        });
      }

      const existingPayment =
        db.prepare(`
          SELECT *
          FROM payments
          WHERE booking_id = ?
          AND status IN (
            'pending_verification',
            'verified'
          )
          LIMIT 1
        `).get(booking.id);

      if (existingPayment) {
        return res.status(409).json({
          error:
            "A payment has already been submitted for this booking.",
        });
      }

      const paymentId =
        `PAY-${Date.now()}-${crypto
          .randomBytes(4)
          .toString("hex")
          .toUpperCase()}`;

      let insertedPayment;

      try {
        const transaction =
          db.transaction(() => {
            db.prepare(`
              INSERT INTO payments (
                booking_id,
                user_id,
                amount,
                currency,
                method,
                utr,
                screenshot_media_id,
                status
              )
              VALUES (?, ?, ?, 'INR', 'upi', ?, ?, 'pending_verification')
            `).run(
              booking.id,
              req.user.uid,
              amount,
              utr,
              screenshotMediaId
            );
          });

        transaction();

        insertedPayment =
          db.prepare(`
            SELECT *
            FROM payments
            WHERE booking_id = ?
            AND utr = ?
            ORDER BY id DESC
            LIMIT 1
          `).get(
            booking.id,
            utr
          );
      } catch (insertError) {
        if (
          String(insertError.message)
            .toLowerCase()
            .includes("unique")
        ) {
          return res.status(409).json({
            error:
              "This transaction reference has already been submitted.",
          });
        }

        throw insertError;
      }

      try {
        await bookingsCollection
          .doc(booking.id)
          .update({
            paymentStatus:
              "pending_verification",

            paymentSubmittedAt:
              admin.firestore.FieldValue.serverTimestamp(),

            paymentId,

            paymentMethod:
              "upi",

            paymentAmount:
              amount,

            paymentReference:
              utr,

            paymentScreenshotMediaId:
              screenshotMediaId,

            updatedAt:
              admin.firestore.FieldValue.serverTimestamp(),
          });
      } catch (firestoreError) {
        console.error(
          "[payment firestore update]",
          firestoreError
        );

        db.prepare(`
          DELETE FROM payments
          WHERE id = ?
        `).run(
          insertedPayment.id
        );

        return res.status(500).json({
          error:
            "Payment could not be registered. Please try again.",
        });
      }

      return res.status(201).json({
        success: true,

        payment: {
          id: paymentId,
          bookingId: booking.id,
          amount,
          currency: "INR",
          method: "upi",
          status:
            "pending_verification",
          submittedAt:
            insertedPayment.submitted_at,
        },

        message:
          "Payment submitted successfully. Your booking is pending verification.",
      });
    } catch (error) {
      console.error(
        "[payment submit]",
        error
      );

      return res.status(500).json({
        error:
          "Unable to submit payment.",
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN — PAYMENT QUEUE
// ------------------------------------------------------------

router.get(
  "/admin/pending",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const rows =
        db.prepare(`
          SELECT *
          FROM payments
          WHERE status = 'pending_verification'
          ORDER BY submitted_at ASC
        `).all();

      res.json({
        success: true,
        payments:
          rows.map(sanitizePayment),
      });
    } catch (error) {
      console.error(
        "[payment admin queue]",
        error
      );

      res.status(500).json({
        error:
          "Unable to load payment queue.",
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN — VERIFY MANUAL UPI
// ------------------------------------------------------------

router.post(
  "/admin/:id/verify",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const paymentId =
      Number(req.params.id);

    if (!Number.isInteger(paymentId)) {
      return res.status(400).json({
        error: "Invalid payment ID.",
      });
    }

    const payment =
      db.prepare(`
        SELECT *
        FROM payments
        WHERE id = ?
      `).get(paymentId);

    if (!payment) {
      return res.status(404).json({
        error: "Payment not found.",
      });
    }

    if (
      payment.status !==
      "pending_verification"
    ) {
      return res.status(409).json({
        error:
          "This payment has already been processed.",
      });
    }

    try {
      const booking =
        await findBooking(
          payment.booking_id
        );

      if (!booking) {
        return res.status(404).json({
          error:
            "Booking associated with payment was not found.",
        });
      }

      const batch =
        firestore.batch();

      batch.update(
        bookingsCollection.doc(
          booking.id
        ),
        {
          paymentStatus:
            "verified",

          paymentVerifiedAt:
            admin.firestore.FieldValue.serverTimestamp(),

          paymentVerifiedBy:
            req.user.uid,

          status:
            "confirmed",

          updatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        }
      );

      await batch.commit();

      db.prepare(`
        UPDATE payments
        SET
          status = 'verified',
          verified_at = datetime('now'),
          verified_by = ?
        WHERE id = ?
      `).run(
        req.user.uid,
        paymentId
      );

      // Manual UPI is also allowed to create an invoice after
      // admin verification. Razorpay auto-creation is handled
      // separately by /razorpay/verify.
      let invoice = null;

      try {
        invoice =
          await createInvoiceFromVerifiedPayment({
            bookingId: booking.id,
            paymentMethod: "upi",
            paymentId: String(paymentId),
          });
      } catch (invoiceError) {
        console.error(
          "[manual UPI invoice creation]",
          invoiceError
        );
      }

      return res.json({
        success: true,

        message:
          "Payment verified and booking confirmed.",

        invoice,
      });
    } catch (error) {
      console.error(
        "[payment verify]",
        error
      );

      return res.status(500).json({
        error:
          "Unable to verify payment.",
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN — REJECT
// ------------------------------------------------------------

router.post(
  "/admin/:id/reject",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const paymentId =
      Number(req.params.id);

    const reason =
      typeof req.body.reason === "string"
        ? req.body.reason.trim().slice(0, 500)
        : "Payment could not be verified.";

    if (!Number.isInteger(paymentId)) {
      return res.status(400).json({
        error: "Invalid payment ID.",
      });
    }

    const payment =
      db.prepare(`
        SELECT *
        FROM payments
        WHERE id = ?
      `).get(paymentId);

    if (!payment) {
      return res.status(404).json({
        error: "Payment not found.",
      });
    }

    if (
      payment.status !==
      "pending_verification"
    ) {
      return res.status(409).json({
        error:
          "This payment has already been processed.",
      });
    }

    try {
      const booking =
        await findBooking(
          payment.booking_id
        );

      if (!booking) {
        return res.status(404).json({
          error:
            "Booking associated with payment was not found.",
        });
      }

      await bookingsCollection
        .doc(booking.id)
        .update({
          paymentStatus:
            "rejected",

          paymentRejectedAt:
            admin.firestore.FieldValue.serverTimestamp(),

          paymentRejectedBy:
            req.user.uid,

          paymentRejectionReason:
            reason,

          updatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        });

      db.prepare(`
        UPDATE payments
        SET
          status = 'rejected',
          verified_at = datetime('now'),
          verified_by = ?,
          rejection_reason = ?
        WHERE id = ?
      `).run(
        req.user.uid,
        reason,
        paymentId
      );

      return res.json({
        success: true,
        message:
          "Payment rejected.",
      });
    } catch (error) {
      console.error(
        "[payment reject]",
        error
      );

      return res.status(500).json({
        error:
          "Unable to reject payment.",
      });
    }
  }
);

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

async function findBooking(bookingId) {
  const direct =
    await bookingsCollection
      .doc(bookingId)
      .get();

  if (direct.exists) {
    return {
      id: direct.id,
      data: direct.data(),
    };
  }

  const possibleFields = [
    "bookingId",
    "booking_id",
    "reference",
    "reservationId",
  ];

  for (const field of possibleFields) {
    try {
      const snapshot =
        await bookingsCollection
          .where(field, "==", bookingId)
          .limit(1)
          .get();

      if (!snapshot.empty) {
        const doc =
          snapshot.docs[0];

        return {
          id: doc.id,
          data: doc.data(),
        };
      }
    } catch (_) {
      // Continue with the next schema field.
    }
  }

  return null;
}

function getBookingUserId(data) {
  return (
    data.userId ||
    data.user_id ||
    data.uid ||
    data.customerId ||
    data.customer_id ||
    data.user?.uid ||
    null
  );
}

function getBookingAmount(data) {
  const candidates = [
    data.totalAmount,
    data.total,
    data.amountToPay,
    data.amount,
    data.finalAmount,
    data.payableAmount,
    data.grandTotal,
  ];

  for (const value of candidates) {
    const number =
      typeof value === "string"
        ? Number(
            value.replace(/[₹,\s]/g, "")
          )
        : Number(value);

    if (
      Number.isFinite(number) &&
      number > 0
    ) {
      return Math.round(
        number * 100
      ) / 100;
    }
  }

  return null;
}

function getVehicleName(data) {
  if (typeof data.vehicleName === "string") {
    return data.vehicleName;
  }

  if (typeof data.carName === "string") {
    return data.carName;
  }

  if (typeof data.vehicle === "string") {
    return data.vehicle;
  }

  if (data.vehicle?.name) {
    return String(
      data.vehicle.name
    );
  }

  const brand =
    data.brand ||
    data.carBrand ||
    "";

  const model =
    data.model ||
    data.carModel ||
    "";

  const combined =
    `${brand} ${model}`.trim();

  return combined ||
    "Rental vehicle";
}

function getVehicleMeta(data) {
  const parts = [];

  if (data.year) {
    parts.push(
      String(data.year)
    );
  }

  if (data.fuel) {
    parts.push(
      String(data.fuel)
    );
  }

  if (data.transmission) {
    parts.push(
      String(data.transmission)
    );
  }

  return parts.join(" · ");
}

function getFirstValue(data, keys) {
  for (const key of keys) {
    if (
      data[key] !== undefined &&
      data[key] !== null &&
      String(data[key]).trim() !== ""
    ) {
      return String(data[key]);
    }
  }

  return "—";
}

function sanitizePayment(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    userId: row.user_id,
    amount: row.amount,
    currency: row.currency,
    method: row.method,
    utr: row.utr,
    screenshotMediaId:
      row.screenshot_media_id,
    status: row.status,
    submittedAt:
      row.submitted_at,
    verifiedAt:
      row.verified_at,
    verifiedBy:
      row.verified_by,
    rejectionReason:
      row.rejection_reason,
  };
}


module.exports = router;
