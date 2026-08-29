"use strict";

const crypto = require("crypto");
const { FieldValue } = require("firebase-admin/firestore");
const { resolveDb } = require("./firebaseAdapter");
const { generateInvoicePdf } = require("./invoicePdfService");

const db = resolveDb();

const numberValue = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

function totals(charges = {}, taxRate = 0) {
  const base = ["rental","driver","delivery","protection","extraKm","lateFee","fuel","cleaning","damage","toll","other"]
    .reduce((sum, key) => sum + numberValue(charges[key]), 0);
  const subtotal = Math.max(0, base - numberValue(charges.discount));
  const tax = Math.round(subtotal * numberValue(taxRate) * 100) / 100;
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

async function nextInvoiceNumber(type = "BOOKING") {
  const ref = db.collection("counters").doc(`invoice_${type.toLowerCase()}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const value = (snap.exists ? numberValue(snap.data().value) : 0) + 1;
    tx.set(ref, { value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return `KRZ-${type === "FINAL" ? "FINV" : "INV"}-${new Date().getFullYear()}-${String(value).padStart(6, "0")}`;
  });
}

function customer(b) {
  return {
    name: b.customer?.name || b.userName || b.customerName || "",
    email: b.customer?.email || b.userEmail || b.customerEmail || b.email || "",
    phone: b.customer?.phone || b.userPhone || b.customerPhone || b.phone || "",
    address: b.customer?.address || ""
  };
}

function vehicle(b) {
  let reg = b.vehicle?.registration || b.vehicleReg || b.registration || "";
  if (typeof reg === "string" && (reg.toUpperCase().startsWith("ZIP") || reg.toUpperCase() === "ZIP001")) {
    reg = "";
  }
  return {
    vehicleId: b.vehicleId || b.carId || "",
    name: b.vehicle?.name || b.vehicleName || b.carName || "Rental Vehicle",
    registration: reg,
    category: b.vehicle?.category || b.vehicleCategory || ""
  };
}

function shortBookingId(rawId, b = {}) {
  if (b.bookingNumber) return String(b.bookingNumber);
  const str = String(rawId || b.id || "");
  if (/^\d{6,10}$/.test(str)) return str;
  return str.length > 8 ? str.slice(-8).toUpperCase() : str;
}

async function createBookingInvoice(bookingId) {
  const value = String(bookingId || "").trim();
  if (!value) throw Object.assign(new Error("Booking ID is required"), { statusCode: 400 });

  const bookingSnap = await db.collection("bookings").doc(value).get();
  if (!bookingSnap.exists) throw Object.assign(new Error(`Booking not found: ${value}`), { statusCode: 404 });

  const booking = bookingSnap.data();
  const existing = await db.collection("invoices")
    .where("bookingId", "in", [value, shortBookingId(value, booking)]).where("type", "==", "BOOKING").limit(1).get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    return { ...doc.data(), invoiceId: doc.data().invoiceId || doc.id };
  }

  const returnInspection = booking.returnInspection || {};
  const rawItems = Array.isArray(returnInspection.items)
    ? returnInspection.items
    : Array.isArray(returnInspection.deductions)
      ? returnInspection.deductions
      : [];
  const deductionItems = rawItems
    .filter((item) => Number(item?.amount || item?.cost || 0) > 0)
    .map((item) => ({
      name: item.name || item.title || item.label || "Inspection Deduction",
      amount: Number(item.amount || item.cost || 0),
      reason: item.description || item.reason || item.notes || "Assessed on Return Inspection"
    }));

  const totalDeduct = deductionItems.reduce((sum, x) => sum + x.amount, 0) || Number(returnInspection.totalDeductions || returnInspection.deductions || 0);
  const secDeposit = numberValue(booking.securityDeposit);
  const refundAmount = Math.max(0, secDeposit - totalDeduct);

  const charges = {
    rental: numberValue(booking.rentalTotal ?? booking.baseAmount ?? booking.pricing?.rental ?? booking.rentalAmount ?? booking.totalAmount),
    driver: numberValue(booking.driverTotal),
    delivery: numberValue(booking.deliveryFee),
    protection: numberValue(booking.insuranceFee),
    discount: numberValue(booking.couponDiscount ?? booking.discount),
    extraKm: 0, lateFee: 0, fuel: 0, cleaning: 0, damage: totalDeduct, toll: 0, other: 0
  };
  const taxRate = numberValue(booking.taxRate ?? process.env.INVOICE_TAX_RATE ?? 0);
  const summary = totals(charges, taxRate);
  const isAdvance = booking.paymentPlan === "advance" && booking.paymentStatus !== "paid" && !booking.pickupPaymentCollected;
  const isFullPaid = (booking.paymentStatus === "paid" || booking.paymentPlan === "full" || Boolean(booking.pickupPaymentCollected));
  const amountPaid = isFullPaid
    ? summary.total
    : numberValue(booking.paymentAmountPaid ?? booking.paymentAmount ?? booking.amountPaid ?? booking.payment?.amountPaid ?? booking.advanceAmount ?? 0);
  const invoiceId = crypto.randomUUID();

  const invoice = {
    invoiceId,
    invoiceNumber: await nextInvoiceNumber("BOOKING"),
    bookingId: shortBookingId(value, booking),
    rawBookingId: value,
    userId: booking.userId || booking.customerId || null,
    type: "BOOKING",
    status: isAdvance ? "PARTIALLY_PAID" : "PAID",
    currency: "INR",
    invoiceDate: new Date().toISOString(),
    customer: customer(booking),
    vehicle: vehicle(booking),
    rental: {
      pickupDate: booking.pickupDate || booking.rental?.pickupDate,
      returnDate: booking.dropDate || booking.rental?.returnDate,
      duration: booking.duration || (booking.days ? `${booking.days} Day${booking.days > 1 ? "s" : ""}` : `${booking.hours || 24} hours`)
    },
    charges, taxRate, ...summary, amountPaid,
    balanceDue: Math.max(0, summary.total - amountPaid),
    payment: {
      status: isAdvance ? "ADVANCE PAID" : "PAID IN FULL",
      plan: isAdvance ? "advance" : "full",
      mode: booking.paymentMode || "UPI",
      reference: booking.paymentRef || booking.paymentReference || (booking.pickupPaymentCollected ? `Collected at Pickup by ${booking.pickupPaymentCollectedBy || "Executive"}` : "")
    },
    securityDeposit: {
      collected: secDeposit,
      deducted: totalDeduct,
      refunded: refundAmount,
      status: totalDeduct > 0 ? "PARTIALLY_REFUNDED" : "HELD",
      deductions: deductionItems,
      inspectionNotes: returnInspection.notes || returnInspection.invoiceNotes || ""
    },
    email: { status: "PENDING", sentAt: null, recipient: customer(booking).email || null, messageId: null },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  const pdf = await generateInvoicePdf(invoice);
  invoice.pdf = { fileName: pdf.fileName, filePath: pdf.filePath, generatedAt: new Date().toISOString() };
  await db.collection("invoices").doc(invoiceId).set(invoice);
  return invoice;
}

async function getInvoice(id) {
  if (!id) throw Object.assign(new Error("Invoice ID is required"), { statusCode: 400 });
  const value = String(id).trim();

  const snap = await db.collection("invoices").doc(value).get();
  if (snap.exists) {
    const data = snap.data();
    return { ...data, invoiceId: data.invoiceId || snap.id };
  }

  const byBooking = await db.collection("invoices").where("bookingId", "==", value).limit(1).get();
  if (!byBooking.empty) {
    const doc = byBooking.docs[0];
    const data = doc.data();
    return { ...data, invoiceId: data.invoiceId || doc.id };
  }

  throw Object.assign(new Error(`Invoice not found for ID or booking ID: ${value}`), { statusCode: 404 });
}

module.exports = { createBookingInvoice, getInvoice, totals };
