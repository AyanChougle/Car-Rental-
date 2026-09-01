// server/routes/invoice.js
"use strict";

const express = require("express");
const path = require("path");
const db = require("../config/database");
const { createBookingInvoice, getInvoice, totals } = require("../services/invoiceService");
const { generateInvoicePdf, readInvoicePdf } = require("../services/invoicePdfService");
const { sendInvoiceEmail } = require("../services/invoiceMailService");
const { requireAuth, requireRole } = require("../middleware/auth");

const r = express.Router();
const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const STAFF_ROLES = ["admin", "manager"];

function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

const requireOwnerOrStaff = a(async (req, res, next) => {
  const invoice = await getInvoice(req.params.invoiceId);

  if (!isStaff(req.user.role) && invoice.firebaseUid !== req.user.firebaseUid) {
    return res.status(403).json({ success: false, error: "You don't have permission to view this invoice." });
  }

  req.invoice = invoice;
  next();
});

r.get("/payment-approved/:bookingId", (req, res) => {
  res.status(405).json({
    success: false,
    message: "Method Not Allowed. Creating an invoice on payment approval requires a POST request.",
    hint: "This endpoint is automatically called by the Admin / Manager dashboard when payment is approved."
  });
});

/**
 * POST /api/invoices/payment-approved/:bookingId
 * Generate booking invoice on payment approval & deliver via SMTP
 */
r.post("/payment-approved/:bookingId", requireAuth, requireRole(...STAFF_ROLES), a(async (req, res) => {
  const invoice = await createBookingInvoice(req.params.bookingId);
  let pdfBuffer;

  if (invoice.pdf?.filePath) {
    try {
      pdfBuffer = await readInvoicePdf(invoice.pdf.filePath);
    } catch (_) {}
  }

  if (!pdfBuffer) {
    const generated = await generateInvoicePdf(invoice);
    pdfBuffer = await readInvoicePdf(generated.filePath);
    invoice.pdf = { fileName: generated.fileName, filePath: generated.filePath, generatedAt: new Date().toISOString() };
    await db.query(
      "UPDATE invoices SET pdf_filename = ?, pdf_path = ?, pdf_generated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?",
      [generated.fileName, generated.filePath, invoice.invoiceId]
    );
  }

  const recipient = req.body?.email || invoice.customer?.email || invoice.emailRecipient || "";
  let emailSent = false;
  let mailResult = null;

  if (recipient) {
    try {
      mailResult = await sendInvoiceEmail({ invoice, pdfBuffer, recipient });
      emailSent = true;
      await db.query(
        `UPDATE invoices SET
          email_recipient = ?,
          email_status = 'SENT',
          email_message_id = ?,
          email_sent_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
         WHERE invoice_id = ?`,
        [recipient, mailResult?.messageId || null, invoice.invoiceId]
      );
    } catch (mailErr) {
      console.warn("[invoice payment-approved] Email delivery skipped/notice:", mailErr.message);
      await db.query(
        `UPDATE invoices SET
          email_recipient = ?,
          email_status = 'EMAIL_FAILED',
          email_error = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE invoice_id = ?`,
        [recipient, mailErr.message, invoice.invoiceId]
      );
    }
  }

  res.json({
    success: true,
    message: emailSent
      ? "Invoice generated and sent to customer email successfully."
      : "Invoice PDF generated successfully.",
    invoice,
    emailSent,
    recipient: recipient || null,
    messageId: mailResult?.messageId || null
  });
}));

/**
 * GET /api/invoices/:invoiceId
 */
r.get("/:invoiceId", requireAuth, requireOwnerOrStaff, a(async (req, res) => {
  res.json({ success: true, invoice: req.invoice });
}));

/**
 * GET /api/invoices/:invoiceId/pdf
 * Download invoice PDF
 */
r.get("/:invoiceId/pdf", requireAuth, requireOwnerOrStaff, a(async (req, res) => {
  let invoice = req.invoice;
  let pdfBuffer;

  if (invoice.pdf?.filePath) {
    try {
      pdfBuffer = await readInvoicePdf(invoice.pdf.filePath);
    } catch (_) {}
  }

  if (!pdfBuffer) {
    const generated = await generateInvoicePdf(invoice);
    pdfBuffer = await readInvoicePdf(generated.filePath);
    await db.query(
      "UPDATE invoices SET pdf_filename = ?, pdf_path = ?, pdf_generated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?",
      [generated.fileName, generated.filePath, invoice.invoiceId]
    );
  }

  const filename = invoice.pdf?.fileName || `${invoice.invoiceNumber || invoice.invoiceId}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-cache");
  res.send(pdfBuffer);
}));

/**
 * POST /api/invoices/:invoiceId/send-email
 * Resend invoice PDF to email
 */
r.post("/:invoiceId/send-email", requireAuth, requireRole(...STAFF_ROLES), a(async (req, res) => {
  const invoice = await getInvoice(req.params.invoiceId);
  const recipient = req.body?.recipient || invoice.customer?.email || invoice.emailRecipient;

  if (!recipient) {
    return res.status(400).json({ success: false, error: "Recipient email is required." });
  }

  let pdfBuffer;
  if (invoice.pdf?.filePath) {
    try { pdfBuffer = await readInvoicePdf(invoice.pdf.filePath); } catch (_) {}
  }
  if (!pdfBuffer) {
    const gen = await generateInvoicePdf(invoice);
    pdfBuffer = await readInvoicePdf(gen.filePath);
  }

  const mailResult = await sendInvoiceEmail({ invoice, pdfBuffer, recipient });
  await db.query(
    `UPDATE invoices SET
      email_recipient = ?,
      email_status = 'SENT',
      email_message_id = ?,
      email_sent_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
     WHERE invoice_id = ?`,
    [recipient, mailResult?.messageId || null, invoice.invoiceId]
  );

  res.json({
    success: true,
    message: `Invoice successfully sent to ${recipient}`,
    messageId: mailResult?.messageId
  });
}));

module.exports = r;
