"use strict";

const nodemailer = require("nodemailer");
let transporter = null;

const env = (name, fallback = "") =>
  String(process.env[name] || fallback).trim();

function isSmtpConfigured() {
  return Boolean(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS"));
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isSmtpConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT", "587")),
    secure: env("SMTP_SECURE", "false").toLowerCase() === "true",
    auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return transporter;
}

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function emailHtml(invoice) {
  const name = invoice.customer?.name || "Kruizly Customer";
  const no = invoice.invoiceNumber || invoice.invoiceId || "Kruizly Invoice";
  const vehicle = invoice.vehicle?.name || "Rental Vehicle";
  const total = Number(invoice.total ?? 0);
  const paid = Number(invoice.amountPaid ?? total);
  const balance = Number(invoice.balanceDue ?? 0);
  const isFullPaid = balance === 0;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; background: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    .email-wrap { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
    .email-head { padding: 32px 30px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; border-bottom: 3px solid #0284c7; }
    .brand-name { font-size: 26px; font-weight: 900; letter-spacing: 0.1em; }
    .brand-name span { color: #38bdf8; }
    .brand-tag { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
    .email-body { padding: 35px 30px; }
    .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 20px 0; }
    .card-row { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px solid #edf2f7; }
    .card-row:last-child { border-bottom: none; }
    .status-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: ${isFullPaid ? "#dcfce7" : "#fef3c7"}; color: ${isFullPaid ? "#166534" : "#92400e"}; }
    .email-foot { padding: 20px 30px; background: #f1f5f9; color: #64748b; font-size: 11px; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="email-wrap">
    <div class="email-head">
      <div class="brand-name">KRUIZLY<span>.</span></div>
      <div class="brand-tag">Premium Self Drive Rentals</div>
    </div>
    <div class="email-body">
      <div class="greeting">Tax Invoice Ready</div>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Hi <b>${esc(name)}</b>,<br>
        Thank you for choosing Kruizly. Your official digital tax invoice has been generated and is attached to this email as a PDF document.
      </p>

      <div class="summary-card">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;">Invoice Number:</td>
            <td style="padding:6px 0;text-align:right;font-weight:700;color:#0284c7;">${esc(no)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;">Vehicle:</td>
            <td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;">${esc(vehicle)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;">Total Amount:</td>
            <td style="padding:6px 0;text-align:right;font-weight:800;color:#0f172a;">₹${Number.isFinite(total) ? total.toLocaleString("en-IN") : "0"}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;">Amount Paid:</td>
            <td style="padding:6px 0;text-align:right;font-weight:700;color:#166534;">₹${Number.isFinite(paid) ? paid.toLocaleString("en-IN") : "0"}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;">Payment Status:</td>
            <td style="padding:6px 0;text-align:right;"><span class="status-badge">${isFullPaid ? "PAID IN FULL" : "ADVANCE PAID"}</span></td>
          </tr>
        </table>
      </div>

      <p style="color:#64748b;font-size:12.5px;line-height:1.5;">
        📎 <b>Attachment:</b> Please find the complete PDF invoice attached with itemized breakdown and security deposit information.
      </p>
    </div>
    <div class="email-foot">
      © 2026 Gavson Business Park, Ghansoli, Navi Mumbai<br>
      This is an automated invoice dispatch. For support, reply to this email or contact support@kruizly.in.
    </div>
  </div>
</body>
</html>`;
}

async function sendInvoiceEmail({ invoice, pdfBuffer, recipient }) {
  if (!invoice)
    throw Object.assign(new Error("Invoice data is required."), {
      statusCode: 400,
    });

  const email = String(
    recipient || invoice.customer?.email || invoice.email?.recipient || "",
  ).trim();
  if (!email)
    throw Object.assign(new Error("Customer email address is missing."), {
      code: "CUSTOMER_EMAIL_MISSING",
      statusCode: 400,
    });

  if (!Buffer.isBuffer(pdfBuffer))
    throw Object.assign(new Error("Invoice PDF buffer is missing."), {
      code: "INVOICE_PDF_MISSING",
      statusCode: 400,
    });

  const mailer = getTransporter();
  if (!mailer)
    throw Object.assign(
      new Error(
        "SMTP email is not configured. Add SMTP_HOST, SMTP_USER and SMTP_PASS to .env.",
      ),
      { code: "SMTP_NOT_CONFIGURED", statusCode: 503 },
    );

  const invoiceNumber =
    invoice.invoiceNumber || invoice.invoiceId || "Kruizly-Invoice";

  try {
    const result = await mailer.sendMail({
      from: { name: "Kruizly", address: env("SMTP_FROM", env("SMTP_USER")) },
      to: email,
      subject: `Kruizly Invoice ${invoiceNumber}`,
      html: emailHtml(invoice),
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return {
      success: true,
      messageId: result.messageId || null,
      response: result.response || null,
      recipient: email,
      invoiceNumber,
    };
  } catch (error) {
    console.error("[INVOICE MAIL] SMTP SEND FAILED:", error);
    throw Object.assign(
      new Error(`Could not send invoice email: ${error.message}`),
      { code: "SMTP_SEND_FAILED", originalError: error, statusCode: 502 },
    );
  }
}

async function verifyEmailConfiguration() {
  const mailer = getTransporter();
  if (!mailer)
    return {
      configured: false,
      verified: false,
      message: "SMTP is not configured.",
    };
  try {
    await mailer.verify();
    return {
      configured: true,
      verified: true,
      message: "SMTP connection verified successfully.",
    };
  } catch (error) {
    return { configured: true, verified: false, message: error.message };
  }
}

module.exports = {
  sendInvoiceEmail,
  verifyEmailConfiguration,
  isSmtpConfigured,
};
