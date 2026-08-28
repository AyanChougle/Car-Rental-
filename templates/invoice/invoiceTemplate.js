const fs = require("fs");
const path = require("path");

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[c]);

const money = (v) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(v || 0));

const dt = (v) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "-";

const cssPath = path.join(__dirname, "invoice.css");
const css = fs.readFileSync(cssPath, "utf8");

function buildInvoiceHtml(i = {}) {
  const c = i.customer || {};
  const v = i.vehicle || {};
  const r = i.rental || {};
  const ch = i.charges || {};
  const d = i.securityDeposit || {};
  const p = i.payment || {};

  const items = [
    ["Rental", ch.rental],
    ["Driver", ch.driver],
    ["Delivery", ch.delivery],
    ["Protection", ch.protection],
    ["Extra KM", ch.extraKm],
    ["Late fee", ch.lateFee],
    ["Fuel", ch.fuel],
    ["Cleaning", ch.cleaning],
    ["Damage", ch.damage],
    ["Toll / parking", ch.toll],
    ["Other", ch.other],
    ["Discount", -Number(ch.discount || 0)],
  ].filter(([, value]) => Number(value || 0));

  const companyName =
    process.env.COMPANY_LEGAL_NAME || "Premium Self-Drive Rentals";
  const companyAddress =
    process.env.COMPANY_ADDRESS || "Mumbai, Maharashtra, India";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(i.invoiceNumber || "Kruizly Invoice")}</title>
  <style>${css}</style>
</head>
<body>
  <main class="invoice">

    <header class="invoice-header">
      <div class="brand-block">
        <div class="brand">KRUIZLY<span class="accent">.</span></div>
        <div class="company-name">${esc(companyName)}</div>
      </div>

      <div class="invoice-heading">
        <div class="invoice-type">
          ${i.type === "FINAL" ? "FINAL INVOICE" : "INVOICE"}
        </div>
        <div class="invoice-number">${esc(i.invoiceNumber || "-")}</div>
        <span class="status-badge">${esc(i.status || "ISSUED")}</span>
      </div>
    </header>

    <section class="info-grid">
      <article class="info-card">
        <div class="label">Bill To</div>
        <div class="primary">${esc(c.name || "-")}</div>
        ${c.email ? `<div>${esc(c.email)}</div>` : ""}
        ${c.phone ? `<div>${esc(c.phone)}</div>` : ""}
        ${c.address ? `<div>${esc(c.address)}</div>` : ""}
      </article>

      <article class="info-card">
        <div class="label">Booking</div>
        <div class="primary">${esc(i.bookingId || "-")}</div>
        <div>Invoice date: ${dt(i.invoiceDate)}</div>
        <div>Payment: ${esc(p.status || "-")}</div>
      </article>

      <article class="info-card">
        <div class="label">Vehicle</div>
        <div class="primary">${esc(v.name || "-")}</div>
        ${v.registration ? `<div>${esc(v.registration)}</div>` : ""}
        ${v.category ? `<div>${esc(v.category)}</div>` : ""}
      </article>

      <article class="info-card">
        <div class="label">Rental</div>
        <div>Pickup: ${dt(r.pickupDate)}</div>
        <div>Return: ${dt(r.returnDate)}</div>
        ${r.duration ? `<div>${esc(r.duration)}</div>` : ""}
      </article>
    </section>

    <section class="section">
      <div class="section-title">Charges</div>
      <table class="charges-table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${
            items.length
              ? items
                  .map(
                    ([name, amount]) => `
            <tr>
              <td>${esc(name)}</td>
              <td class="right">${money(amount)}</td>
            </tr>`
                  )
                  .join("")
              : `<tr><td colspan="2" class="empty-row">No additional charges</td></tr>`
          }
        </tbody>
      </table>
    </section>

    <section class="summary-wrap">
      <table class="summary-table">
        <tr>
          <td>Subtotal</td>
          <td class="right">${money(i.subtotal)}</td>
        </tr>
        <tr>
          <td>Tax</td>
          <td class="right">${money(i.tax)}</td>
        </tr>
        <tr class="grand-total">
          <td>Total</td>
          <td class="right">${money(i.total)}</td>
        </tr>
        <tr>
          <td>Paid</td>
          <td class="right">${money(i.amountPaid)}</td>
        </tr>
        <tr>
          <td>Balance</td>
          <td class="right">${money(i.balanceDue)}</td>
        </tr>
      </table>
    </section>

    <section class="payment-card">
      <div class="section-title">Payment Details</div>
      <div class="payment-grid">
        <div>
          <div class="label">Status</div>
          <div class="primary">${esc(p.status || "-")}</div>
        </div>
        <div>
          <div class="label">Method</div>
          <div>${esc(p.method || "Razorpay")}</div>
        </div>
        <div>
          <div class="label">Razorpay Order ID</div>
          <div class="mono">${esc(p.razorpayOrderId || "-")}</div>
        </div>
        <div>
          <div class="label">Razorpay Payment ID</div>
          <div class="mono">${esc(p.razorpayPaymentId || "-")}</div>
        </div>
        <div>
          <div class="label">Paid On</div>
          <div>${dt(p.paidAt)}</div>
        </div>
      </div>
    </section>

    <section class="deposit-card">
      <div class="section-title">Security Deposit</div>
      <div class="deposit-grid">
        <div><span>Collected</span><strong>${money(d.collected)}</strong></div>
        <div><span>Deducted</span><strong>${money(d.deducted)}</strong></div>
        <div><span>Refund</span><strong>${money(d.refunded)}</strong></div>
      </div>
    </section>

    ${
      i.notes
        ? `<section class="notes">
      <div class="label">Notes</div>
      <div>${esc(i.notes)}</div>
    </section>`
        : ""
    }

    <footer class="invoice-footer">
      <div>${esc(companyAddress)}</div>
      <div>Electronic invoice generated by Kruizly.</div>
    </footer>

  </main>
</body>
</html>`;
}

module.exports = { buildInvoiceHtml };
