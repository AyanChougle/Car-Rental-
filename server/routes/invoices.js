/**
 * server/routes/invoices.js
 *
 * Invoice API for Kruizly / CarRentPe.
 *
 * Endpoints:
 *   POST /api/invoices/payment-approved/:bookingId
 *   GET  /api/invoices/:invoiceId
 *   PUT  /api/invoices/:invoiceId
 *   POST /api/invoices/:invoiceId/send
 *   GET  /api/invoices/:invoiceId/pdf
 *
 * Firebase bootstrap expected by this project:
 *   server/firebaseAdmin.js
 *   module.exports = admin;
 *
 * IMPORTANT:
 * payment-approved must be called only after the Razorpay payment has
 * been verified server-side by the payment flow.
 */

const express = require("express");
const nodemailer = require("nodemailer");

const admin = require("../firebaseAdmin");
const { generateInvoicePdf } = require("../services/invoicePdfService");

const router = express.Router();
const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;

const COLLECTIONS = {
  invoices: process.env.FIRESTORE_INVOICES_COLLECTION || "invoices",
  bookings: process.env.FIRESTORE_BOOKINGS_COLLECTION || "bookings",
  users: process.env.FIRESTORE_USERS_COLLECTION || "users",
  fleets: process.env.FIRESTORE_FLEETS_COLLECTION || "fleets",
};

function now() {
  return Timestamp.now();
}

function firstDefined(...values) {
  return values.find(
    (v) => v !== undefined && v !== null && v !== ""
  );
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function plain(value) {
  if (value == null) return value;

  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(plain);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, plain(val)])
    );
  }

  return value;
}

function safeFilename(value) {
  return String(value || "invoice")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

async function getById(collection, id) {
  if (!id) return null;

  const snap = await db.collection(collection).doc(String(id)).get();

  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...plain(snap.data()),
  };
}

async function queryFirst(collection, fields, value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  for (const field of fields) {
    try {
      const snap = await db
        .collection(collection)
        .where(field, "==", value)
        .limit(1)
        .get();

      if (!snap.empty) {
        const doc = snap.docs[0];

        return {
          id: doc.id,
          ...plain(doc.data()),
        };
      }
    } catch (error) {
      // Continue with the next possible schema field.
    }
  }

  return null;
}

async function findBooking(bookingId) {
  if (!bookingId) return null;
  const rawId = String(bookingId).trim();
  const cleanId = rawId.replace(/^#/, "");

  return (
    (await getById(COLLECTIONS.bookings, rawId)) ||
    (await getById(COLLECTIONS.bookings, cleanId)) ||
    (await queryFirst(
      COLLECTIONS.bookings,
      ["bookingId", "id", "bookingID", "reservationId", "bookingNumber", "bookingRef", "bookingNo"],
      rawId
    )) ||
    (await queryFirst(
      COLLECTIONS.bookings,
      ["bookingId", "id", "bookingID", "reservationId", "bookingNumber", "bookingRef", "bookingNo"],
      cleanId
    ))
  );
}

async function findUser(booking) {
  const userId = firstDefined(
    booking.userId,
    booking.uid,
    booking.customerId,
    booking.userID
  );

  if (!userId) return null;

  return (
    (await getById(COLLECTIONS.users, userId)) ||
    (await queryFirst(
      COLLECTIONS.users,
      ["uid", "userId", "id", "email"],
      userId
    ))
  );
}

async function findFleet(booking) {
  const fleetId = firstDefined(
    booking.fleetId,
    booking.vehicleId,
    booking.carId,
    booking.vehicleID,
    booking.carID,
    booking.regNumber,
    booking.regNo
  );

  if (!fleetId) return null;

  return (
    (await getById("vehicles", fleetId)) ||
    (await getById(COLLECTIONS.fleets, fleetId)) ||
    (await queryFirst(
      "vehicles",
      ["regNo", "registration", "vehicleId", "id", "fleetId"],
      fleetId
    )) ||
    (await queryFirst(
      COLLECTIONS.fleets,
      ["fleetId", "vehicleId", "carId", "id", "regNo"],
      fleetId
    ))
  );
}

async function findExistingInvoice(bookingId, paymentId, orderId) {
  const invoiceByBooking = await queryFirst(
    COLLECTIONS.invoices,
    ["bookingId"],
    String(bookingId)
  );

  if (invoiceByBooking) return invoiceByBooking;

  if (paymentId) {
    const invoiceByPayment = await queryFirst(
      COLLECTIONS.invoices,
      ["paymentId", "razorpayPaymentId"],
      paymentId
    );

    if (invoiceByPayment) return invoiceByPayment;
  }

  if (orderId) {
    const invoiceByOrder = await queryFirst(
      COLLECTIONS.invoices,
      ["orderId", "razorpayOrderId"],
      orderId
    );

    if (invoiceByOrder) return invoiceByOrder;
  }

  return null;
}

async function generateInvoiceNumber() {
  const counterRef = db.collection("_counters").doc("invoices");

  let sequence;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(counterRef);

    const current = snap.exists
      ? num(snap.data().value, 0)
      : 0;

    sequence = current + 1;

    transaction.set(
      counterRef,
      {
        value: sequence,
        updatedAt: now(),
      },
      { merge: true }
    );
  });

  const prefix = process.env.INVOICE_PREFIX || "KRZ-INV";

  return `${prefix}-${String(sequence).padStart(6, "0")}`;
}

function getCustomer(booking, user) {
  const source =
    booking.customer ||
    booking.customerDetails ||
    {};

  return {
    name: firstDefined(
      source.name,
      source.fullName,
      booking.customerName,
      user && user.name,
      user && user.fullName,
      "Customer"
    ),

    email: firstDefined(
      source.email,
      booking.customerEmail,
      user && user.email
    ),

    phone: firstDefined(
      source.phone,
      source.mobile,
      booking.customerPhone,
      user && user.phone,
      user && user.mobile
    ),

    address: firstDefined(
      source.address,
      booking.customerAddress,
      user && user.address
    ),
  };
}

function getVehicle(booking, fleet) {
  const source =
    booking.vehicle ||
    booking.car ||
    booking.fleet ||
    {};

  const fleetName = fleet
    ? [fleet.brand, fleet.model]
        .filter(Boolean)
        .join(" ")
    : "";

  return {
    name: firstDefined(
      source.name,
      source.title,
      source.modelName,
      [source.brand, source.model]
        .filter(Boolean)
        .join(" "),
      booking.vehicleName,
      booking.carName,
      fleet && fleet.name,
      fleetName,
      "Rental Vehicle"
    ),

    registration: firstDefined(
      source.registration,
      source.registrationNumber,
      source.numberPlate,
      source.licensePlate,
      booking.registrationNumber,
      fleet && fleet.registration,
      fleet && fleet.registrationNumber
    ),

    category: firstDefined(
      source.category,
      source.type,
      fleet && fleet.category,
      fleet && fleet.type
    ),
  };
}

function getRental(booking) {
  const source = booking.rental || {};

  return {
    pickupDate: firstDefined(
      source.pickupDate,
      source.pickupAt,
      booking.pickupDate,
      booking.pickupDateTime,
      booking.startDate,
      booking.startAt
    ),

    returnDate: firstDefined(
      source.returnDate,
      source.returnAt,
      booking.returnDate,
      booking.returnDateTime,
      booking.endDate,
      booking.endAt
    ),

    duration: firstDefined(
      source.duration,
      booking.duration,
      booking.rentalDuration,
      ""
    ),
  };
}

function getCharges(booking) {
  const source =
    booking.charges ||
    booking.amountBreakdown ||
    {};

  return {
    rental: num(firstDefined(
      source.rental,
      source.rentalAmount,
      booking.rentalAmount,
      booking.baseAmount,
      booking.price
    )),

    driver: num(firstDefined(
      source.driver,
      source.driverCharge
    )),

    delivery: num(firstDefined(
      source.delivery,
      source.deliveryCharge,
      booking.deliveryCharge
    )),

    protection: num(firstDefined(
      source.protection,
      source.protectionCharge
    )),

    extraKm: num(firstDefined(
      source.extraKm,
      source.extraKM
    )),

    lateFee: num(firstDefined(
      source.lateFee,
      source.lateFees
    )),

    fuel: num(source.fuel),
    cleaning: num(source.cleaning),
    damage: num(source.damage),

    toll: num(firstDefined(
      source.toll,
      source.tollParking
    )),

    other: num(source.other),

    discount: num(firstDefined(
      source.discount,
      booking.discount
    )),
  };
}

function getAmounts(booking, charges) {
  const calculatedSubtotal =
    charges.rental +
    charges.driver +
    charges.delivery +
    charges.protection +
    charges.extraKm +
    charges.lateFee +
    charges.fuel +
    charges.cleaning +
    charges.damage +
    charges.toll +
    charges.other -
    charges.discount;

  const subtotal = num(
    firstDefined(
      booking.subtotal,
      booking.amounts && booking.amounts.subtotal
    ),
    calculatedSubtotal
  );

  const tax = num(firstDefined(
    booking.tax,
    booking.taxAmount,
    booking.gst,
    booking.amounts && booking.amounts.tax
  ));

  const total = num(
    firstDefined(
      booking.total,
      booking.totalAmount,
      booking.grandTotal,
      booking.amount,
      booking.amounts && booking.amounts.total
    ),
    subtotal + tax
  );

  const amountPaid = num(
    firstDefined(
      booking.amountPaid,
      booking.paidAmount,
      booking.paymentAmount,
      booking.amounts && booking.amounts.paid
    ),
    total
  );

  return {
    subtotal,
    tax,
    total,
    amountPaid,
    balanceDue: Math.max(total - amountPaid, 0),
  };
}

function getSecurityDeposit(booking) {
  const source =
    booking.securityDeposit ||
    booking.deposit ||
    {};

  return {
    collected: num(firstDefined(
      source.collected,
      booking.securityDepositAmount,
      booking.depositAmount
    )),

    deducted: num(firstDefined(
      source.deducted,
      booking.depositDeducted
    )),

    refunded: num(firstDefined(
      source.refunded,
      booking.depositRefunded
    )),
  };
}

function getPayment(booking, suppliedPayment) {
  const source =
    suppliedPayment ||
    booking.payment ||
    {};

  return {
    status: "PAID",

    method: firstDefined(
      source.method,
      booking.paymentMethod,
      "Razorpay"
    ),

    razorpayOrderId: firstDefined(
      source.razorpayOrderId,
      source.orderId,
      booking.razorpayOrderId,
      booking.razorpay_order_id
    ),

    razorpayPaymentId: firstDefined(
      source.razorpayPaymentId,
      source.paymentId,
      booking.razorpayPaymentId,
      booking.razorpay_payment_id
    ),

    paidAt: firstDefined(
      source.paidAt,
      source.createdAt,
      booking.paidAt,
      booking.paymentDate,
      new Date().toISOString()
    ),
  };
}

function buildInvoice({
  booking,
  user,
  fleet,
  bookingId,
  invoiceNumber,
  suppliedPayment,
}) {
  const charges = getCharges(booking);
  const amounts = getAmounts(booking, charges);

  return {
    bookingId: String(bookingId),

    invoiceNumber,

    type: "INVOICE",

    status: "PAID",

    invoiceDate: new Date().toISOString(),

    customer: getCustomer(booking, user),

    vehicle: getVehicle(booking, fleet),

    rental: getRental(booking),

    charges,

    ...amounts,

    payment: getPayment(
      booking,
      suppliedPayment
    ),

    securityDeposit: getSecurityDeposit(booking),

    notes: firstDefined(
      booking.invoiceNotes,
      booking.notes,
      "Thank you for choosing Kruizly."
    ),

    createdAt: now(),

    updatedAt: now(),
  };
}

async function createInvoice(invoice) {
  const ref = db
    .collection(COLLECTIONS.invoices)
    .doc();

  await ref.set(invoice);

  return {
    id: ref.id,
    ...plain(invoice),
  };
}

async function getInvoice(invoiceId) {
  return getById(
    COLLECTIONS.invoices,
    invoiceId
  );
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in .env."
    );
  }

  const port = num(
    process.env.SMTP_PORT,
    587
  );

  return nodemailer.createTransport({
    host,
    port,

    secure:
      String(process.env.SMTP_SECURE)
        .toLowerCase() === "true" ||
      port === 465,

    auth: {
      user,
      pass,
    },
  });
}

async function emailInvoice(invoice, pdfBuffer) {
  const email =
    invoice.customer &&
    invoice.customer.email;

  if (!email) {
    throw new Error(
      "Customer email is missing."
    );
  }

  const transporter =
    createTransporter();

  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER;

  await transporter.sendMail({
    from,

    to: email,

    subject:
      process.env.INVOICE_EMAIL_SUBJECT ||
      `Kruizly Invoice ${invoice.invoiceNumber}`,

    text:
      `Hello ${invoice.customer.name || "Customer"},\n\n` +
      `Your Kruizly invoice ${invoice.invoiceNumber} is attached.\n\n` +
      `Booking ID: ${invoice.bookingId}\n` +
      `Amount Paid: ₹${num(invoice.amountPaid).toFixed(2)}\n\n` +
      `Regards,\nKruizly`,

    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>Kruizly<span style="color:#18b9f0">.</span></h2>

        <p>
          Hello ${invoice.customer.name || "Customer"},
        </p>

        <p>
          Your invoice
          <strong>${invoice.invoiceNumber}</strong>
          is attached.
        </p>

        <p>
          Booking ID:
          <strong>${invoice.bookingId}</strong>
          <br>
          Amount Paid:
          <strong>₹${num(invoice.amountPaid).toFixed(2)}</strong>
        </p>

        <p>
          Regards,<br>
          Kruizly
        </p>
      </div>
    `,

    attachments: [
      {
        filename:
          `${safeFilename(invoice.invoiceNumber)}.pdf`,

        content: pdfBuffer,

        contentType:
          "application/pdf",
      },
    ],
  });
}

/**
 * Direct internal service used by payments.js after a payment has been
 * verified. This avoids making an HTTP request from the server back to
 * itself.
 */
async function createInvoiceFromVerifiedPayment({
  bookingId,
  razorpayOrderId,
  razorpayPaymentId,
  paymentMethod = "razorpay",
  paymentId,
}) {
  const booking = await findBooking(bookingId);

  if (!booking) {
    throw new Error("Booking not found.");
  }

  const existing = await findExistingInvoice(
    bookingId,
    razorpayPaymentId || paymentId,
    razorpayOrderId
  );

  if (existing) {
    return {
      alreadyExists: true,
      invoice: existing,
    };
  }

  const user = await findUser(booking);
  const fleet = await findFleet(booking);
  const invoiceNumber = await generateInvoiceNumber();

  const invoice = buildInvoice({
    booking,
    user,
    fleet,
    bookingId,
    invoiceNumber,
    suppliedPayment: {
      status: "PAID",
      method: paymentMethod,
      razorpayOrderId,
      razorpayPaymentId: razorpayPaymentId || paymentId,
      paidAt: new Date().toISOString(),
    },
  });

  const created = await createInvoice(invoice);

  return {
    alreadyExists: false,
    invoice: created,
  };
}

/**
 * POST /payment-approved/:bookingId
 *
 * This endpoint must be invoked only after Razorpay verification has
 * already succeeded in your server-side payment flow.
 */
router.post(
  "/payment-approved/:bookingId",
  async (req, res) => {
    try {
      const { bookingId } = req.params;

      const suppliedPayment =
        req.body &&
        req.body.payment
          ? req.body.payment
          : req.body || {};

      const paymentStatus =
        String(suppliedPayment.status || "PAID").toUpperCase();

      if (
        ["FAILED", "PENDING", "CANCELLED", "CANCELED"]
          .includes(paymentStatus)
      ) {
        return res.status(409).json({
          success: false,
          error: `Payment is not approved. Current status: ${paymentStatus}.`,
        });
      }

      const result = await createInvoiceFromVerifiedPayment({
        bookingId,
        razorpayOrderId: firstDefined(
          suppliedPayment.razorpayOrderId,
          suppliedPayment.orderId
        ),
        razorpayPaymentId: firstDefined(
          suppliedPayment.razorpayPaymentId,
          suppliedPayment.paymentId
        ),
        paymentMethod: firstDefined(
          suppliedPayment.method,
          "Razorpay"
        ),
        paymentId: suppliedPayment.paymentId,
      });

      return res.status(result.alreadyExists ? 200 : 201).json({
        success: true,
        alreadyExists: result.alreadyExists,
        invoice: result.invoice,
      });
    } catch (error) {
      console.error(
        "[invoice] payment-approved:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Failed to create invoice.",
      });
    }
  }
);

/**
 * GET /:invoiceId
 */
router.get(
  "/:invoiceId",
  async (req, res) => {
    try {
      const invoice =
        await getInvoice(
          req.params.invoiceId
        );

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: "Invoice not found.",
        });
      }

      return res.json({
        success: true,
        invoice,
      });
    } catch (error) {
      console.error(
        "[invoice] get:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to load invoice.",
      });
    }
  }
);

/**
 * PUT /:invoiceId
 *
 * Editable invoice fields.
 * Razorpay/payment identity and invoice identity are protected.
 */
router.put(
  "/:invoiceId",
  async (req, res) => {
    try {
      const invoice =
        await getInvoice(
          req.params.invoiceId
        );

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: "Invoice not found.",
        });
      }

      const allowed = [
        "customer",
        "vehicle",
        "rental",
        "charges",
        "subtotal",
        "tax",
        "total",
        "amountPaid",
        "balanceDue",
        "securityDeposit",
        "notes",
        "type",
      ];

      const updates = {};

      for (const field of allowed) {
        if (
          Object.prototype.hasOwnProperty.call(
            req.body || {},
            field
          )
        ) {
          updates[field] =
            req.body[field];
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(
          updates,
          "total"
        ) ||
        Object.prototype.hasOwnProperty.call(
          updates,
          "amountPaid"
        )
      ) {
        const total =
          Object.prototype.hasOwnProperty.call(
            updates,
            "total"
          )
            ? num(updates.total)
            : num(invoice.total);

        const amountPaid =
          Object.prototype.hasOwnProperty.call(
            updates,
            "amountPaid"
          )
            ? num(updates.amountPaid)
            : num(invoice.amountPaid);

        updates.balanceDue =
          Math.max(
            total - amountPaid,
            0
          );
      }

      if (
        Object.keys(updates).length === 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            "No editable invoice fields supplied.",
        });
      }

      updates.updatedAt = now();

      await db
        .collection(COLLECTIONS.invoices)
        .doc(req.params.invoiceId)
        .update(updates);

      const updated =
        await getInvoice(
          req.params.invoiceId
        );

      return res.json({
        success: true,
        invoice: updated,
      });
    } catch (error) {
      console.error(
        "[invoice] update:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Failed to update invoice.",
      });
    }
  }
);

/**
 * GET /:invoiceId/pdf
 */
router.get(
  "/:invoiceId/pdf",
  async (req, res) => {
    try {
      const invoice =
        await getInvoice(
          req.params.invoiceId
        );

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: "Invoice not found.",
        });
      }

      const pdfBuffer =
        await generateInvoicePdf(
          invoice
        );

      const filename =
        `${safeFilename(
          invoice.invoiceNumber ||
          invoice.id
        )}.pdf`;

      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `${
          req.query.download === "1"
            ? "attachment"
            : "inline"
        }; filename="${filename}"`
      );

      res.setHeader(
        "Content-Length",
        pdfBuffer.length
      );

      return res.end(pdfBuffer);
    } catch (error) {
      console.error(
        "[invoice] pdf:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Failed to generate invoice PDF.",
      });
    }
  }
);

/**
 * POST /:invoiceId/send
 */
router.post(
  "/:invoiceId/send",
  async (req, res) => {
    try {
      const invoice =
        await getInvoice(
          req.params.invoiceId
        );

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: "Invoice not found.",
        });
      }

      if (
        !invoice.customer ||
        !invoice.customer.email
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Customer email is missing.",
        });
      }

      const pdfBuffer =
        await generateInvoicePdf(
          invoice
        );

      await emailInvoice(
        invoice,
        pdfBuffer
      );

      await db
        .collection(COLLECTIONS.invoices)
        .doc(req.params.invoiceId)
        .update({
          status: "SENT",
          sentAt: now(),
          updatedAt: now(),
        });

      const updated =
        await getInvoice(
          req.params.invoiceId
        );

      return res.json({
        success: true,
        message:
          "Invoice sent successfully.",
        invoice: updated,
      });
    } catch (error) {
      console.error(
        "[invoice] send:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Failed to send invoice.",
      });
    }
  }
);

module.exports = router;
module.exports.createInvoiceFromVerifiedPayment = createInvoiceFromVerifiedPayment;
