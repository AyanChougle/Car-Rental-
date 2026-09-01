// server/services/invoiceService.js
"use strict";

const crypto = require("crypto");
const db = require("../config/database");
const { generateInvoicePdf } = require("./invoicePdfService");

const numberValue = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function totals(charges = {}, taxRate = 0) {
  const base = [
    "rental",
    "driver",
    "delivery",
    "protection",
    "extraKm",
    "lateFee",
    "fuel",
    "cleaning",
    "damage",
    "toll",
    "other",
  ].reduce((sum, key) => sum + numberValue(charges[key]), 0);

  const subtotal = Math.max(0, base - numberValue(charges.discount));
  const tax = Math.round(subtotal * numberValue(taxRate) * 100) / 100;
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

async function nextInvoiceNumber(type = "BOOKING") {
  const year = new Date().getFullYear();
  const [rows] = await db.query(
    "SELECT COUNT(*) as count FROM invoices WHERE type = ?",
    [type],
  );
  const count = (rows[0]?.count || 0) + 1;
  return `KRZ-${type === "FINAL" ? "FINV" : "INV"}-${year}-${String(count).padStart(6, "0")}`;
}

function customer(b) {
  return {
    name: b.user_name || b.userName || b.customerName || "Customer",
    email: b.user_email || b.userEmail || b.customerEmail || "",
    phone: b.user_phone || b.userPhone || b.customerPhone || "",
    address: b.pickup_location || "",
  };
}

function vehicle(b) {
  let reg = b.vehicle_reg || b.vehicleReg || b.registration || "";
  if (typeof reg === "string" && reg.toUpperCase().startsWith("ZIP00")) {
    reg = "";
  }
  return {
    vehicleId: b.car_id || b.vehicle_reg || "",
    name: b.vehicle_name || b.vehicleName || "KRUIZLY Vehicle",
    registration: reg,
    category: b.vehicle_category || b.vehicleCategory || "",
  };
}

function shortBookingId(rawId, b = {}) {
  if (b.booking_number || b.bookingNumber)
    return String(b.booking_number || b.bookingNumber);
  const str = String(rawId || b.id || "");
  if (/^\d{6,10}$/.test(str)) return str;
  return str.length > 8 ? str.slice(-8).toUpperCase() : str;
}

async function createBookingInvoice(bookingId) {
  const value = String(bookingId || "").trim();
  if (!value) {
    throw Object.assign(new Error("Booking ID is required"), {
      statusCode: 400,
    });
  }

  // 1. Fetch booking from MySQL
  const [bookingRows] = await db.query(
    "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
    [value, value],
  );

  if (!bookingRows.length) {
    throw Object.assign(new Error(`Booking not found: ${value}`), {
      statusCode: 404,
    });
  }

  const booking = bookingRows[0];

  // 2. Check if invoice already exists
  const [existing] = await db.query(
    "SELECT * FROM invoices WHERE booking_id = ? OR raw_booking_id = ? LIMIT 1",
    [booking.booking_id, value],
  );

  if (existing.length > 0) {
    const inv = existing[0];
    return {
      ...inv,
      invoiceId: inv.invoice_id,
      invoiceNumber: inv.invoice_number,
      customer:
        typeof inv.customer === "string"
          ? JSON.parse(inv.customer)
          : inv.customer,
      vehicle:
        typeof inv.vehicle === "string" ? JSON.parse(inv.vehicle) : inv.vehicle,
      rental:
        typeof inv.rental === "string" ? JSON.parse(inv.rental) : inv.rental,
      charges:
        typeof inv.charges === "string" ? JSON.parse(inv.charges) : inv.charges,
      securityDeposit:
        typeof inv.security_deposit === "string"
          ? JSON.parse(inv.security_deposit)
          : inv.security_deposit,
      pdf: { fileName: inv.pdf_filename, filePath: inv.pdf_path },
      email: { recipient: inv.email_recipient, status: inv.email_status },
    };
  }

  // 3. Build charges & totals
  let returnInspection = {};
  try {
    returnInspection =
      typeof booking.return_inspection === "string"
        ? JSON.parse(booking.return_inspection)
        : booking.return_inspection || {};
  } catch (_) {}

  const rawItems = Array.isArray(returnInspection.items)
    ? returnInspection.items
    : Array.isArray(returnInspection.deductions)
      ? returnInspection.deductions
      : [];

  const deductionItems = rawItems
    .filter((item) => Number(item?.amount || item?.cost || 0) > 0)
    .map((item) => ({
      name: item.name || item.title || "Inspection Deduction",
      amount: Number(item.amount || item.cost || 0),
      reason: item.description || item.reason || "Assessed on Return",
    }));

  const totalDeduct =
    deductionItems.reduce((sum, x) => sum + x.amount, 0) ||
    Number(returnInspection.totalDeductions || 0);
  const secDeposit = numberValue(booking.security_deposit);
  const refundAmount = Math.max(0, secDeposit - totalDeduct);

  const charges = {
    rental: numberValue(booking.total_amount || booking.base_amount),
    driver: numberValue(booking.driver_rate),
    delivery: numberValue(booking.delivery_fee),
    protection: numberValue(booking.insurance_fee),
    discount: numberValue(booking.coupon_discount),
    extraKm: 0,
    lateFee: 0,
    fuel: 0,
    cleaning: 0,
    damage: totalDeduct,
    toll: 0,
    other: 0,
  };

  const taxRate = 0;
  const summary = totals(charges, taxRate);
  const isAdvance =
    booking.payment_plan === "advance" &&
    booking.payment_status !== "paid" &&
    !booking.pickup_payment_collected;
  const amountPaid = isAdvance
    ? numberValue(booking.advance_amount || booking.payment_amount_paid)
    : summary.total;
  const balanceDue = Math.max(0, summary.total - amountPaid);

  const invoiceId = crypto.randomUUID();
  const invoiceNumber = await nextInvoiceNumber("BOOKING");

  const invoiceObj = {
    invoiceId,
    invoiceNumber,
    bookingId: booking.booking_id,
    rawBookingId: value,
    userId: booking.user_id,
    firebaseUid: booking.firebase_uid,
    type: "BOOKING",
    status: isAdvance ? "PARTIALLY_PAID" : "PAID",
    currency: "INR",
    invoiceDate: new Date().toISOString(),
    customer: customer(booking),
    vehicle: vehicle(booking),
    rental: {
      pickupDate: booking.pickup_date,
      returnDate: booking.drop_date,
      duration: booking.duration || `${booking.days || 1} Day(s)`,
    },
    charges,
    taxRate,
    ...summary,
    amountPaid,
    balanceDue,
    paymentPlan: booking.payment_plan || "full",
    paymentStatus: isAdvance ? "advance_paid" : "paid",
    paymentMode: booking.payment_mode || "UPI",
    paymentRef: booking.payment_ref || "",
    securityDeposit: {
      collected: secDeposit,
      deducted: totalDeduct,
      refunded: refundAmount,
      status: totalDeduct > 0 ? "PARTIALLY_REFUNDED" : "HELD",
      deductions: deductionItems,
    },
    notes: "",
    emailRecipient: customer(booking).email || null,
    emailStatus: "PENDING",
  };

  // 4. Generate PDF
  const pdf = await generateInvoicePdf(invoiceObj);
  invoiceObj.pdf = {
    fileName: pdf.fileName,
    filePath: pdf.filePath,
    generatedAt: new Date().toISOString(),
  };

  // 5. Save to MySQL
  await db.query(
    `INSERT INTO invoices (
      invoice_id, invoice_number, booking_id, raw_booking_id, user_id, firebase_uid,
      type, status, currency, customer, vehicle, rental, charges, tax_rate,
      subtotal, tax, total, amount_paid, balance_due, payment_plan, payment_status,
      payment_mode, payment_ref, security_deposit, notes, pdf_filename, pdf_path,
      pdf_generated_at, email_recipient, email_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoiceId,
      invoiceNumber,
      booking.booking_id,
      value,
      booking.user_id,
      booking.firebase_uid,
      "BOOKING",
      invoiceObj.status,
      "INR",
      JSON.stringify(invoiceObj.customer),
      JSON.stringify(invoiceObj.vehicle),
      JSON.stringify(invoiceObj.rental),
      JSON.stringify(charges),
      taxRate,
      summary.subtotal,
      summary.tax,
      summary.total,
      amountPaid,
      balanceDue,
      invoiceObj.paymentPlan,
      invoiceObj.paymentStatus,
      invoiceObj.paymentMode,
      invoiceObj.paymentRef,
      JSON.stringify(invoiceObj.securityDeposit),
      "",
      pdf.fileName,
      pdf.filePath,
      new Date().toISOString().slice(0, 19).replace("T", " "),
      invoiceObj.emailRecipient,
      "PENDING",
    ],
  );

  return invoiceObj;
}

async function getInvoice(id) {
  if (!id)
    throw Object.assign(new Error("Invoice ID is required"), {
      statusCode: 400,
    });
  const value = String(id).trim();

  const [rows] = await db.query(
    "SELECT * FROM invoices WHERE invoice_id = ? OR invoice_number = ? OR booking_id = ? LIMIT 1",
    [value, value, value],
  );

  if (!rows.length) {
    throw Object.assign(new Error(`Invoice not found for ID: ${value}`), {
      statusCode: 404,
    });
  }

  const inv = rows[0];
  return {
    ...inv,
    invoiceId: inv.invoice_id,
    invoiceNumber: inv.invoice_number,
    userId: inv.firebase_uid,
    firebaseUid: inv.firebase_uid,
    customer:
      typeof inv.customer === "string"
        ? JSON.parse(inv.customer)
        : inv.customer,
    vehicle:
      typeof inv.vehicle === "string" ? JSON.parse(inv.vehicle) : inv.vehicle,
    rental:
      typeof inv.rental === "string" ? JSON.parse(inv.rental) : inv.rental,
    charges:
      typeof inv.charges === "string" ? JSON.parse(inv.charges) : inv.charges,
    securityDeposit:
      typeof inv.security_deposit === "string"
        ? JSON.parse(inv.security_deposit)
        : inv.security_deposit,
    pdf: {
      fileName: inv.pdf_filename,
      filePath: inv.pdf_path,
      generatedAt: inv.pdf_generated_at,
    },
    email: {
      recipient: inv.email_recipient,
      status: inv.email_status,
      messageId: inv.email_message_id,
      sentAt: inv.email_sent_at,
    },
  };
}

module.exports = { createBookingInvoice, getInvoice, totals };
