// routes/payments.js

const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const db = require("../db");
const admin = require("../firebaseAdmin");

const {
  requireAuth,
  requireRole,
} = require("../middleware/auth");

const router = express.Router();

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error:
      "Too many payment attempts. Please try again later.",
  },
});

// ------------------------------------------------------------
// FIRESTORE
// ------------------------------------------------------------

const firestore =
  admin.firestore();

const bookingsCollection =
  firestore.collection("bookings");

// ------------------------------------------------------------
// GET BOOKING
// ------------------------------------------------------------

router.get(
  "/booking/:bookingId",
  requireAuth,
  async (req, res) => {
    const bookingId =
      String(req.params.bookingId || "").trim();

    if (
      !bookingId ||
      bookingId.length > 150
    ) {
      return res.status(400).json({
        error: "Invalid booking ID.",
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

      const ownerUid =
        getBookingUserId(booking.data);

      const isOwner =
        ownerUid === req.user.uid;

      const isStaff =
        req.user.role === "admin" ||
        req.user.role === "manager";

      if (!isOwner && !isStaff) {
        return res.status(403).json({
          error:
            "You do not have permission to view this booking.",
        });
      }

      const amount =
        getBookingAmount(booking.data);

      if (amount === null) {
        return res.status(500).json({
          error:
            "Booking does not contain a valid payable amount.",
        });
      }

      const existingPayment =
        db.prepare(`
          SELECT *
          FROM payments
          WHERE booking_id = ?
          ORDER BY id DESC
          LIMIT 1
        `).get(booking.id);

      return res.json({
        success: true,

        booking: {
          id: booking.id,

          vehicleName:
            getVehicleName(booking.data),

          vehicleMeta:
            getVehicleMeta(booking.data),

          pickup:
            getFirstValue(
              booking.data,
              [
                "pickup",
                "pickupDate",
                "startDate",
                "pickup_datetime",
                "pickupDateTime",
              ]
            ),

          drop:
            getFirstValue(
              booking.data,
              [
                "drop",
                "dropDate",
                "endDate",
                "returnDate",
                "drop_datetime",
                "dropDateTime",
              ]
            ),

          duration:
            getFirstValue(
              booking.data,
              [
                "duration",
                "durationText",
                "days",
                "rentalDays",
              ]
            ),

          amount,

          currency: "INR",

          status:
            booking.data.status ||
            "pending",

          paymentStatus:
            booking.data.paymentStatus ||
            null,
        },

        payment: existingPayment
          ? sanitizePayment(existingPayment)
          : null,
      });
    } catch (error) {
      console.error(
        "[get booking]",
        error
      );

      res.status(500).json({
        error:
          "Unable to load booking.",
      });
    }
  }
);

// ------------------------------------------------------------
// SUBMIT PAYMENT
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

    if (
      !bookingId ||
      bookingId.length > 150
    ) {
      return res.status(400).json({
        error: "Invalid booking ID.",
      });
    }

    if (
      !utr ||
      utr.length < 6 ||
      utr.length > 100
    ) {
      return res.status(400).json({
        error:
          "Enter a valid UTR / transaction reference.",
      });
    }

    if (
      !Number.isInteger(screenshotMediaId) ||
      screenshotMediaId <= 0
    ) {
      return res.status(400).json({
        error:
          "Payment screenshot is required.",
      });
    }

    try {
      // ------------------------------------------------------
      // FIND BOOKING
      // ------------------------------------------------------

      const booking =
        await findBooking(bookingId);

      if (!booking) {
        return res.status(404).json({
          error: "Booking not found.",
        });
      }

      const bookingData =
        booking.data;

      // ------------------------------------------------------
      // OWNERSHIP
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // AMOUNT FROM DATABASE
      // ------------------------------------------------------

      const amount =
        getBookingAmount(bookingData);

      if (
        amount === null ||
        amount <= 0
      ) {
        return res.status(400).json({
          error:
            "Booking amount is invalid.",
        });
      }

      // ------------------------------------------------------
      // BOOKING STATUS
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // VERIFY SCREENSHOT OWNERSHIP
      // ------------------------------------------------------

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
        media.user_id !== req.user.uid
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

      // ------------------------------------------------------
      // DUPLICATE UTR
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // EXISTING BOOKING PAYMENT
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // INSERT PAYMENT
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // UPDATE FIRESTORE BOOKING
      // ------------------------------------------------------

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

        // Compensation if Firestore update failed.
        db.prepare(`
          DELETE FROM payments
          WHERE id = ?
        `).run(insertedPayment.id);

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
// ADMIN — VERIFY
// ------------------------------------------------------------

router.post(
  "/admin/:id/verify",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const paymentId =
      Number(req.params.id);

    if (
      !Number.isInteger(paymentId)
    ) {
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

      return res.json({
        success: true,

        message:
          "Payment verified and booking confirmed.",
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

    if (
      !Number.isInteger(paymentId)
    ) {
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
  // First: normal Firestore document ID.
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

  // Fallback for systems where booking IDs are stored
  // inside a field rather than used as document IDs.
  const possibleFields = [
    "bookingId",
    "booking_id",
    "reference",
    "reservationId",
  ];

  for (const field of possibleFields) {
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
      return Math.round(number * 100) / 100;
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
    return String(data.vehicle.name);
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

  return combined || "Rental vehicle";
}

function getVehicleMeta(data) {
  const parts = [];

  if (data.year) {
    parts.push(String(data.year));
  }

  if (data.fuel) {
    parts.push(String(data.fuel));
  }

  if (data.transmission) {
    parts.push(String(data.transmission));
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

    bookingId:
      row.booking_id,

    userId:
      row.user_id,

    amount:
      row.amount,

    currency:
      row.currency,

    method:
      row.method,

    utr:
      row.utr,

    screenshotMediaId:
      row.screenshot_media_id,

    status:
      row.status,

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
