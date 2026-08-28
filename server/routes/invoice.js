"use strict";

const express = require("express");
const path = require("path");
const { FieldValue } = require("firebase-admin/firestore");
const { resolveDb } = require("../services/firebaseAdapter");
const { createBookingInvoice, getInvoice, totals } = require("../services/invoiceService");
const { generateInvoicePdf, readInvoicePdf } = require("../services/invoicePdfService");
const { sendInvoiceEmail } = require("../services/invoiceMailService");
const { requireAuth, requireRole } = require("../middleware/auth");

const db = resolveDb();
const r = express.Router();
const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Every invoice route requires a signed-in user. Generating, editing, and
// (re)sending an invoice is staff-only — a customer has no business
// rewriting the charges on their own bill or re-sending it to anyone.
// Reading an invoice/PDF is allowed for the invoice's own customer too,
// enforced per-route below via requireOwnerOrStaff (invoices don't have a
// static role gate the way /admin or /manager pages do).
const STAFF_ROLES = ["admin", "manager"];

function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

// Loads the invoice first, then checks the caller is either staff or the
// customer it belongs to (invoice.userId, set when the invoice is created).
const requireOwnerOrStaff = a(async (req, res, next) => {
  const invoice = await getInvoice(req.params.invoiceId);

  if (!isStaff(req.user.role) && invoice.userId !== req.user.uid) {
    return res.status(403).json({ error: "You don't have permission to view this invoice." });
  }

  req.invoice = invoice; // avoid re-fetching in the handler below
  next();
});

r.post("/payment-approved/:bookingId", requireAuth, requireRole(...STAFF_ROLES), a(async (req, res) => {
  const invoice = await createBookingInvoice(req.params.bookingId);
  let pdfBuffer;

  if (invoice.pdf?.filePath) {
    try { pdfBuffer = await readInvoicePdf(invoice.pdf.filePath); } catch (_) {}
  }

  if (!pdfBuffer) {
    const generated = await generateInvoicePdf(invoice);
    pdfBuffer = await readInvoicePdf(generated.filePath);
    invoice.pdf = { fileName: generated.fileName, filePath: generated.filePath, generatedAt: new Date().toISOString() };
    await db.collection("invoices").doc(invoice.invoiceId).set({ pdf: invoice.pdf, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  const recipient = req.body?.email || invoice.customer?.email || invoice.email?.recipient || "";
  if (!recipient) return res.status(400).json({ success:false, message:"Invoice created, but customer email address was not found.", invoiceId: invoice.invoiceId });

  const mailResult = await sendInvoiceEmail({ invoice, pdfBuffer, recipient });

  await db.collection("invoices").doc(invoice.invoiceId).set({
    email: { status:"SENT", sentAt:new Date().toISOString(), recipient, messageId:mailResult?.messageId || null },
    updatedAt:FieldValue.serverTimestamp()
  }, { merge:true });

  res.json({ success:true, message:"Invoice generated and sent successfully.", invoice, emailSent:true, recipient, messageId:mailResult?.messageId || null });
}));

r.get("/:invoiceId", requireAuth, requireOwnerOrStaff, a(async (req,res) => {
  res.json({ success:true, invoice: req.invoice });
}));

r.put("/:invoiceId", requireAuth, requireRole(...STAFF_ROLES), a(async (req,res) => {
  const old = await getInvoice(req.params.invoiceId);
  const p = req.body || {};
  const charges = { ...(old.charges || {}), ...(p.charges || {}) };
  const taxRate = Number(p.taxRate ?? old.taxRate ?? 0);
  const t = totals(charges, taxRate);
  const amountPaid = Number(p.amountPaid ?? old.amountPaid ?? 0);

  const invoice = {
    ...old, ...p, invoiceId:old.invoiceId, charges, taxRate, ...t, amountPaid,
    balanceDue:Math.max(0, t.total - amountPaid),
    updatedAt:FieldValue.serverTimestamp()
  };

  const generated = await generateInvoicePdf(invoice);
  invoice.pdf = { fileName:generated.fileName, filePath:generated.filePath, generatedAt:new Date().toISOString() };
  await db.collection("invoices").doc(invoice.invoiceId).set(invoice, { merge:true });
  res.json({ success:true, invoice });
}));

r.post("/:invoiceId/send", requireAuth, requireRole(...STAFF_ROLES), a(async (req,res) => {
  const invoice = await getInvoice(req.params.invoiceId);
  let pdfBuffer;

  if (invoice.pdf?.filePath) {
    try { pdfBuffer = await readInvoicePdf(invoice.pdf.filePath); } catch (_) {}
  }

  if (!pdfBuffer) {
    const generated = await generateInvoicePdf(invoice);
    pdfBuffer = await readInvoicePdf(generated.filePath);
    invoice.pdf = { fileName:generated.fileName, filePath:generated.filePath, generatedAt:new Date().toISOString() };
    await db.collection("invoices").doc(invoice.invoiceId).set({ pdf:invoice.pdf, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
  }

  const recipient = req.body?.email || invoice.customer?.email || invoice.email?.recipient || "";
  if (!recipient) return res.status(400).json({ success:false, message:"Customer email address not found." });

  const mailResult = await sendInvoiceEmail({ invoice, pdfBuffer, recipient });
  await db.collection("invoices").doc(invoice.invoiceId).set({
    email:{ status:"SENT", sentAt:new Date().toISOString(), recipient, messageId:mailResult?.messageId || null },
    updatedAt:FieldValue.serverTimestamp()
  }, { merge:true });

  res.json({ success:true, message:"Invoice sent successfully.", emailSent:true, recipient, messageId:mailResult?.messageId || null });
}));

r.get("/:invoiceId/pdf", requireAuth, requireOwnerOrStaff, a(async (req,res) => {
  const invoice = req.invoice;
  let buffer, pdfInfo;

  if (invoice.pdf?.filePath) {
    try { buffer = await readInvoicePdf(invoice.pdf.filePath); pdfInfo = invoice.pdf; } catch (_) {}
  }

  if (!buffer) {
    const generated = await generateInvoicePdf(invoice);
    buffer = await readInvoicePdf(generated.filePath);
    pdfInfo = { fileName:generated.fileName, filePath:generated.filePath, generatedAt:new Date().toISOString() };
    await db.collection("invoices").doc(invoice.invoiceId).set({ pdf:pdfInfo, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
  }

  res.setHeader("Content-Type","application/pdf");
  res.setHeader("Content-Disposition",`inline; filename="${path.basename(pdfInfo?.fileName || invoice.invoiceNumber + ".pdf")}"`);
  res.setHeader("Content-Length",buffer.length);
  res.send(buffer);
}));

module.exports = r;
