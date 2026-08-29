const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
const money = (v) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    Number(v || 0),
  );
const dt = (v) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "-";
function buildInvoiceHtml(i) {
  const c = i.customer || {},
    v = i.vehicle || {},
    r = i.rental || {},
    ch = i.charges || {},
    d = i.securityDeposit || {},
    p = i.payment || {};

  const cleanReg = v.registration && !String(v.registration).toUpperCase().startsWith("ZIP") ? v.registration : "";
  const shortId = String(i.bookingId || "").length > 10 ? String(i.bookingId).slice(-8).toUpperCase() : String(i.bookingId || "-");
  const payMode = p.mode || i.paymentMode || "UPI / Online";
  const payRef = p.reference || i.paymentRef || "-";
  const isFullPaid = Number(i.balanceDue || 0) === 0;
  const payStatus = p.status || (isFullPaid ? "PAID IN FULL" : "ADVANCE PAID");

  const items = [
    ["Base Rental Charges", ch.rental, "Base vehicle hire for scheduled period"],
    ["Chauffeur / Driver Fee", ch.driver, "Professional chauffeur charges"],
    ["Doorstep Delivery & Pickup", ch.delivery, "Vehicle drop & pickup service"],
    ["Comprehensive Protection", ch.protection, "Standard damage & roadside coverage"],
    ["Extra Kilometers", ch.extraKm, "Overage distance charges"],
    ["Late Return Fee", ch.lateFee, "Post-schedule return fee"],
    ["Fuel Adjustment", ch.fuel, "Refueling charge / level difference"],
    ["Deep Cleaning / Detailing", ch.cleaning, "Interior / exterior detailing charge"],
    ["Damage / Repair Charges", ch.damage, "Assessed vehicle damage deduction"],
    ["Tolls, Parking & FASTag", ch.toll, "Highway tolls and parking transit"],
    ["Other Miscellaneous", ch.other, "Additional verified incidentals"],
    ["Applied Discount / Promo", -Number(ch.discount || 0), "Promotional concession applied"],
  ].filter((x) => Number(x[1] || 0));

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kruizly Invoice ${esc(i.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 12mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      font-size: 11.5px;
      line-height: 1.45;
    }
    .invoice-container {
      max-width: 100%;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 14px;
      border-bottom: 2px solid #0f172a;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 900;
      letter-spacing: 0.08em;
      color: #0f172a;
    }
    .brand-title span { color: #0284c7; }
    .brand-sub {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
      margin-top: 2px;
    }
    .invoice-badge-wrap {
      text-align: right;
    }
    .invoice-type {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: #0f172a;
    }
    .invoice-number {
      font-size: 13px;
      font-weight: 700;
      color: #0284c7;
      margin: 2px 0 4px;
    }
    .status-pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: ${isFullPaid ? "#dcfce7" : "#fef3c7"};
      color: ${isFullPaid ? "#166534" : "#92400e"};
      border: 1px solid ${isFullPaid ? "#bbf7d0" : "#fde68a"};
    }
    .grid-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 14px 0;
    }
    .info-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .card-label {
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      margin-bottom: 4px;
    }
    .info-card strong {
      font-size: 12px;
      color: #0f172a;
    }
    .info-card p {
      font-size: 10.5px;
      color: #475569;
      margin-top: 2px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    .items-table th {
      background: #0f172a;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 8px 10px;
      text-align: left;
    }
    .items-table th.right { text-align: right; }
    .items-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 10.5px;
      vertical-align: middle;
    }
    .item-desc { font-weight: 600; color: #1e293b; }
    .item-sub { font-size: 9px; color: #64748b; }
    .items-table td.right { text-align: right; font-weight: 600; }
    
    .settlement-wrap {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      margin-top: 10px;
    }
    .payment-summary-box {
      flex: 1.1;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f1f5f9;
    }
    .payment-summary-box .card-label {
      color: #334155;
      margin-bottom: 6px;
      font-size: 9px;
    }
    .pay-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      padding: 2px 0;
      color: #334155;
    }
    .pay-row b { color: #0f172a; }

    .totals-table {
      flex: 0.9;
      width: 100%;
      border-collapse: collapse;
    }
    .totals-table td {
      padding: 4px 8px;
      font-size: 10.5px;
      color: #334155;
    }
    .totals-table td.right {
      text-align: right;
      font-weight: 600;
      color: #0f172a;
    }
    .totals-table tr.grand-row td {
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      font-size: 12.5px;
      font-weight: 800;
      color: #0284c7;
      padding: 6px 8px;
    }
    .totals-table tr.paid-row td {
      color: #166534;
      font-weight: 700;
    }
    .totals-table tr.due-row td {
      color: ${isFullPaid ? "#64748b" : "#b91c1c"};
      font-weight: 800;
    }

    .deposit-strip {
      margin-top: 10px;
      padding: 7px 12px;
      border-radius: 6px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      font-size: 9.5px;
      color: #475569;
      display: flex;
      justify-content: space-between;
    }
    .deductions-box {
      margin-top: 10px;
      padding: 9px 12px;
      background: #fff8f8;
      border: 1px solid #fecaca;
      border-radius: 6px;
    }
    .deductions-heading {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #991b1b;
      margin-bottom: 5px;
      display: flex;
      justify-content: space-between;
    }
    .deductions-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }
    .deductions-table td {
      padding: 3px 0;
      border-bottom: 1px dashed #fee2e2;
    }
    .deductions-table td.amount {
      text-align: right;
      font-weight: 700;
      color: #dc2626;
    }
    .terms-box {
      margin-top: 10px;
      padding: 7px 12px;
      background: #fafafa;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }
    .terms-heading {
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #475569;
      margin-bottom: 4px;
    }
    .terms-list {
      margin: 0;
      padding-left: 14px;
      font-size: 8px;
      color: #64748b;
      line-height: 1.35;
    }
    .terms-list li {
      margin-bottom: 2px;
    }
    .terms-list li b {
      color: #334155;
    }
    .terms-applied-line {
      margin-top: 10px;
      text-align: center;
      font-size: 9px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .footer-note {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px dashed #cbd5e1;
      text-align: center;
      font-size: 8px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div>
        <div class="brand-title">KRUIZLY<span>.</span></div>
        <div class="brand-sub">${esc(process.env.COMPANY_LEGAL_NAME || "Premium Self-Drive Car Rentals")}</div>
      </div>
      <div class="invoice-badge-wrap">
        <div class="invoice-type">${i.type === "FINAL" ? "FINAL TAX INVOICE" : "TAX INVOICE"}</div>
        <div class="invoice-number">${esc(i.invoiceNumber)}</div>
        <div class="status-pill">${esc(payStatus)}</div>
      </div>
    </div>

    <div class="grid-info">
      <div class="info-card">
        <div class="card-label">Customer / Billed To</div>
        <strong>${esc(c.name || "Customer")}</strong>
        <p>${esc(c.email || "")}</p>
        <p>${esc(c.phone || "")}</p>
      </div>
      <div class="info-card">
        <div class="card-label">Booking Reference</div>
        <strong>Booking #${esc(shortId)}</strong>
        <p>Invoice Date: ${dt(i.invoiceDate)}</p>
        <p>Rental Status: ${esc(i.status || "CONFIRMED")}</p>
      </div>
      <div class="info-card">
        <div class="card-label">Vehicle Hired</div>
        <strong>${esc(v.name || "Rental Vehicle")}</strong>
        <p>Category: ${esc(v.category || "Car")}${cleanReg ? ` &nbsp;|&nbsp; Reg: <b>${esc(cleanReg)}</b>` : ""}</p>
      </div>
      <div class="info-card">
        <div class="card-label">Hire Duration</div>
        <strong>${esc(r.duration || "Standard Hire")}</strong>
        <p>Pickup: ${dt(r.pickupDate)}</p>
        <p>Return: ${dt(r.returnDate)}</p>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Item / Charge Description</th>
          <th class="right">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((x) => `
          <tr>
            <td>
              <div class="item-desc">${esc(x[0])}</div>
              <div class="item-sub">${esc(x[2] || "")}</div>
            </td>
            <td class="right">${money(x[1])}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <div class="settlement-wrap">
      <div class="payment-summary-box">
        <div class="card-label">Payment &amp; Settlement Details</div>
        <div class="pay-row"><span>Payment Method:</span><b>${esc(payMode)}</b></div>
        <div class="pay-row"><span>Payment Status:</span><b>${esc(payStatus)}</b></div>
        <div class="pay-row"><span>Transaction / Ref ID:</span><b>${esc(payRef)}</b></div>
        <div class="pay-row"><span>Amount Received:</span><b>${money(i.amountPaid)}</b></div>
        <div class="pay-row"><span>Outstanding Balance:</span><b>${money(i.balanceDue)}</b></div>
      </div>

      <table class="totals-table">
        <tr>
          <td>Subtotal</td>
          <td class="right">${money(i.subtotal)}</td>
        </tr>
        <tr>
          <td>GST / Tax (${Number(i.taxRate || 0)}%)</td>
          <td class="right">${money(i.tax)}</td>
        </tr>
        <tr class="grand-row">
          <td>Grand Total</td>
          <td class="right">${money(i.total)}</td>
        </tr>
        <tr class="paid-row">
          <td>Total Paid</td>
          <td class="right">${money(i.amountPaid)}</td>
        </tr>
        <tr class="due-row">
          <td>Balance Due</td>
          <td class="right">${money(i.balanceDue)}</td>
        </tr>
      </table>
    </div>

    <div class="deposit-strip">
      <span><b>Security Deposit:</b> Collected: ${money(d.collected)}</span>
      <span>Deductions: ${money(d.deducted)}</span>
      <span><b>Refund / Status:</b> ${money(d.refunded || d.collected)} (${esc(d.status || "HELD")})</span>
    </div>

    ${Array.isArray(d.deductions) && d.deductions.length > 0 ? `
    <div class="deductions-box">
      <div class="deductions-heading">
        <span>Return Inspection Deductions &amp; Assessment Explanation</span>
        <span>Total Deductions: -${money(d.deducted)}</span>
      </div>
      <table class="deductions-table">
        ${d.deductions.map((ded) => `
          <tr>
            <td>
              <b>${esc(ded.name)}</b>
              ${ded.reason ? `<div style="font-size:8.5px;color:#7f1d1d;">Explanation: ${esc(ded.reason)}</div>` : ""}
            </td>
            <td class="amount">-${money(ded.amount)}</td>
          </tr>
        `).join("")}
      </table>
      ${d.inspectionNotes ? `<div style="font-size:8.5px;color:#7f1d1d;margin-top:4px;border-top:1px dashed #fecaca;padding-top:3px;"><b>Inspection Remarks:</b> ${esc(d.inspectionNotes)}</div>` : ""}
    </div>
    ` : ""}

    <div class="terms-box">
      <div class="terms-heading">Terms &amp; Conditions Applied</div>
      <ol class="terms-list">
        <li><b>Vehicle Operation &amp; Speed:</b> Vehicle is strictly for authorized self-drive passenger use. Statutory speed limits must be respected (max 80–100 km/h). Commercial racing or subleasing is prohibited.</li>
        <li><b>Fuel &amp; FASTag:</b> Vehicle must be returned with the same fuel level as recorded at pickup. Fuel shortages, tolls, and FASTag transit are adjusted against the deposit.</li>
        <li><b>Security Deposit:</b> Refundable deposits are settled within 24–48 banking hours after return inspection subject to zero outstanding challans, damages, or dues.</li>
        <li><b>Damage &amp; Incidents:</b> Any collision or breakdown must be reported to Kruizly immediately. Standard insurance deductibles and terms apply.</li>
        <li><b>Traffic Fines:</b> Any e-challans or parking penalties incurred during the rental tenure are the sole liability of the renter.</li>
      </ol>
    </div>

    <div class="terms-applied-line">
      * Terms &amp; Conditions Applied. Subject to Kruizly Standard Self-Drive Rental Agreement.
    </div>

    <div class="footer-note">
      ${esc(i.notes || "Thank you for choosing Kruizly Self Drive Rentals.")}<br>
      Gavson Business Park, Ghansoli, Navi Mumbai
    </div>
  </div>
</body>
</html>`;
}
module.exports = { buildInvoiceHtml };
