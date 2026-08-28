"use strict";

const nodemailer = require("nodemailer");
let transporter = null;

const env = (name, fallback="") => String(process.env[name] || fallback).trim();

function isSmtpConfigured() {
  return Boolean(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS"));
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isSmtpConfigured()) return null;

  transporter = nodemailer.createTransport({
    host:env("SMTP_HOST"),
    port:Number(env("SMTP_PORT","587")),
    secure:env("SMTP_SECURE","false").toLowerCase() === "true",
    auth:{ user:env("SMTP_USER"), pass:env("SMTP_PASS") },
    connectionTimeout:15000,
    greetingTimeout:15000,
    socketTimeout:20000
  });
  return transporter;
}

const esc = (v) => String(v ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
  .replace(/'/g,"&#039;");

function emailHtml(invoice) {
  const name = invoice.customer?.name || "Kruizly Customer";
  const no = invoice.invoiceNumber || invoice.invoiceId || "Kruizly Invoice";
  const total = Number(invoice.total ?? 0);
  return `<!doctype html><html><body style="margin:0;background:#f3f7fc;font-family:Arial,sans-serif;color:#172033">
  <div style="max-width:600px;margin:30px auto;background:#fff;border-radius:18px;overflow:hidden">
  <div style="padding:30px;background:#0b6cff;color:#fff"><b style="font-size:26px">KRUIZLY</b><div>Premium Self Drive Rentals</div></div>
  <div style="padding:35px"><h2>Invoice Ready</h2><p>Hi ${esc(name)},</p>
  <p>Thank you for choosing Kruizly. Your invoice is attached as a PDF.</p>
  <div style="padding:18px;background:#f6f9fd;border-radius:12px"><b>${esc(no)}</b><span style="float:right">₹${Number.isFinite(total)?total.toFixed(2):"0.00"}</span></div>
  <p style="color:#68758a">Please keep the attached invoice for your records.</p></div>
  <div style="padding:20px;background:#f7f9fc;color:#7b8798;font-size:12px">Automated email from Kruizly.</div>
  </div></body></html>`;
}

async function sendInvoiceEmail({ invoice, pdfBuffer, recipient }) {
  if (!invoice) throw Object.assign(new Error("Invoice data is required."),{statusCode:400});

  const email = String(recipient || invoice.customer?.email || invoice.email?.recipient || "").trim();
  if (!email) throw Object.assign(new Error("Customer email address is missing."),{code:"CUSTOMER_EMAIL_MISSING",statusCode:400});

  if (!Buffer.isBuffer(pdfBuffer)) throw Object.assign(new Error("Invoice PDF buffer is missing."),{code:"INVOICE_PDF_MISSING",statusCode:400});

  const mailer = getTransporter();
  if (!mailer) throw Object.assign(new Error("SMTP email is not configured. Add SMTP_HOST, SMTP_USER and SMTP_PASS to .env."),{code:"SMTP_NOT_CONFIGURED",statusCode:503});

  const invoiceNumber = invoice.invoiceNumber || invoice.invoiceId || "Kruizly-Invoice";

  try {
    const result = await mailer.sendMail({
      from:{ name:"Kruizly", address:env("SMTP_FROM",env("SMTP_USER")) },
      to:email,
      subject:`Kruizly Invoice ${invoiceNumber}`,
      html:emailHtml(invoice),
      attachments:[{ filename:`${invoiceNumber}.pdf`, content:pdfBuffer, contentType:"application/pdf" }]
    });

    return { success:true, messageId:result.messageId || null, response:result.response || null, recipient:email, invoiceNumber };
  } catch (error) {
    console.error("[INVOICE MAIL] SMTP SEND FAILED:",error);
    throw Object.assign(new Error(`Could not send invoice email: ${error.message}`),{code:"SMTP_SEND_FAILED",originalError:error,statusCode:502});
  }
}

async function verifyEmailConfiguration() {
  const mailer = getTransporter();
  if (!mailer) return {configured:false,verified:false,message:"SMTP is not configured."};
  try {
    await mailer.verify();
    return {configured:true,verified:true,message:"SMTP connection verified successfully."};
  } catch (error) {
    return {configured:true,verified:false,message:error.message};
  }
}

module.exports = { sendInvoiceEmail, verifyEmailConfiguration, isSmtpConfigured };
