import { checkAuth, getCurrentUser } from "./auth.js?v=20260917-v1";
import { api } from "./kruizly-api.js?v=20260917-v1";
import "./nav-helper.js";

import {
  calculateDuration,
  formatCurrency,
  formatHumanDateTime,
  parseDateTime
} from "./booking-calculator.js";

function formatDate(val) {
  return formatHumanDateTime(val);
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const STATUS_COPY = {
  pending_payment: { label: "Payment Pending", className: "pending" },
  confirmed: { label: "Confirmed", className: "verified" },
  completed: { label: "Completed", className: "" },
  cancelled: { label: "Cancelled", className: "rejected" },
};

function paymentStatusLabel(booking) {
  const adv = Number(booking.advanceAmount || booking.paymentAmountPaid || booking.paymentAmount || 500);
  const rem = Number(booking.remainingBalance !== undefined && booking.remainingBalance !== null ? booking.remainingBalance : 0);
  switch (booking.paymentStatus) {
    case "paid":
      return `Fully Paid • ${booking.paymentRef || "Verified"}`;
    case "advance_paid":
      return `₹${formatCurrency(adv)} token paid • ${rem > 0 ? `₹${formatCurrency(rem)} balance remaining` : "Fully Settled"}`;
    case "pay_at_pickup":
      return "Pay at pickup";
    case "pending_verification":
      return `Verifying payment • ${booking.paymentRef || "Under review"}`;
    case "refunded":
      return `Refunded • Booking cancelled`;
    case "rejected":
      return `Payment rejected${booking.paymentRejectionReason ? ` • ${booking.paymentRejectionReason}` : ""}. Please resubmit.`;
    default:
      return "Unpaid";
  }
}

const liveEl = document.getElementById("liveBookings");
const pastEl = document.getElementById("pastBookings");

function bookingCard(b, isLive) {
  const statusInfo = STATUS_COPY[b.status] || {
    label: b.status,
    className: "",
  };

  const vehicleName = b.vehicleName || "KRUIZLY Rental Vehicle";
  const vehicleCategory = b.vehicleCategory || "Sedan";

  const pickupFormatted = formatHumanDateTime(b.pickupDate);
  const dropFormatted = formatHumanDateTime(b.dropDate);
  const dur = calculateDuration(b.pickupDate, b.dropDate);
  const durationFormatted = dur.valid ? dur.daysAndHoursText : (b.duration || "—");

  const totalAmount = Number(b.totalAmount ?? b.finalAmount ?? b.amount ?? 0);
  const advAmount = Number(b.advanceAmount ?? (b.paymentPlan === "advance" ? 500 : 0));
  const remBalance = Number(
    b.remainingBalance !== undefined && b.remainingBalance !== null
      ? b.remainingBalance
      : (b.paymentPlan === "advance" ? Math.max(0, totalAmount - (advAmount > 0 ? advAmount : 500)) : 0)
  );

  const isFullPlan = b.paymentPlan === "full";
  const isAdvancePlan = b.paymentPlan === "advance";
  const isPaid = b.paymentStatus === "paid" || (isFullPlan && (b.paymentStatus === "verified" || b.paymentStatus === "confirmed"));
  const isFullyPaid = isPaid || (b.paymentStatus === "advance_paid" && remBalance <= 0);
  const isPendingVerification = b.paymentStatus === "pending_verification";

  let amountDue = totalAmount;
  if ((b.paymentStatus === "advance_paid" || advAmount > 0) && remBalance > 0) {
    amountDue = remBalance;
  } else if (remBalance > 0) {
    amountDue = remBalance;
  }

  const bId = b.bookingNumber || b.bookingId || b.id || "";

  const waText = encodeURIComponent(
    `🎉 *KRUIZLY BOOKING CONFIRMATION*\n\n` +
    `Booking ID: #${bId}\n` +
    `Vehicle: ${vehicleName} (${vehicleCategory})\n` +
    `Pickup Date & Time: ${pickupFormatted}\n` +
    `Drop Date & Time: ${dropFormatted}\n` +
    `Duration: ${durationFormatted}\n` +
    `Total Amount: ₹${formatCurrency(totalAmount)}\n` +
    `Status: ${statusInfo.label}\n\n` +
    `Kindly confirm my booking schedule. Thank you!`
  );
  const waUrl = `https://wa.me/919167164547?text=${waText}`;

  const whatsappBtnHtml = `
    <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="border-color:#25d366;color:#25d366;display:inline-flex;align-items:center;gap:6px;font-size:0.85rem;padding:8px 14px;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
      WhatsApp Confirmation
    </a>
  `;

  let payBtnHtml = "";
  if (isPendingVerification) {
    payBtnHtml = `
      <span class="status-pill pending" style="padding:7px 14px;border-radius:8px;font-size:0.85rem;font-weight:700;background:rgba(250,204,21,0.15);color:#facc15;border:1px solid rgba(250,204,21,0.3);display:inline-flex;align-items:center;gap:6px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        Payment Under Review
      </span>
    `;
  } else if (isFullyPaid) {
    payBtnHtml = `
      <span class="status-pill verified" style="padding:7px 14px;border-radius:8px;font-size:0.85rem;font-weight:700;background:rgba(6,214,160,0.15);color:#06d6a0;border:1px solid rgba(6,214,160,0.3);display:inline-flex;align-items:center;gap:6px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        ✓ 100% Fully Paid
      </span>
    `;
  } else if (b.status !== "cancelled" && b.status !== "rejected" && b.status !== "completed") {
    const isBalancePayment = (b.paymentStatus === "advance_paid" || advAmount > 0) && remBalance > 0;
    const btnLabel = b.paymentStatus === "rejected"
      ? `Resubmit Payment (₹${formatCurrency(amountDue)})`
      : (isBalancePayment
          ? `Pay Remaining Balance (₹${formatCurrency(amountDue)})`
          : `Pay Full Amount (₹${formatCurrency(amountDue)})`);

    payBtnHtml = `
      <a href="payment.html?booking=${encodeURIComponent(bId)}&plan=full" class="btn btn-primary" style="background:linear-gradient(135deg, #00d2ff, #0055ff);color:#fff;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 14px rgba(0,122,255,0.35);">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
        ${btnLabel}
      </a>
    `;
  }

  let actionsHtml = "";
  if (b.status !== "cancelled" && b.status !== "rejected" && b.status !== "completed") {
    actionsHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center;">
        ${payBtnHtml}
        <button class="btn btn-outline booking-cancel-btn" data-id="${escapeHtml(bId)}" style="border-color:#ef476f;color:#ef476f;">Cancel Booking</button>
        ${whatsappBtnHtml}
      </div>
    `;
  } else {
    actionsHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center;">
        ${whatsappBtnHtml}
      </div>
    `;
  }

  return `
    <div class="booking-item-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div>
          <span style="font-size:0.8rem;color:var(--kz-sub,#7b8798);text-transform:uppercase;letter-spacing:1px;font-weight:700;">Booking #${escapeHtml(bId)}</span>
          <h3 style="margin:4px 0 0;font-size:1.2rem;color:#fff;">${escapeHtml(vehicleName)} <span style="font-size:0.85rem;color:var(--kz-cyan,#4fd7ff);font-weight:normal;">(${escapeHtml(vehicleCategory)})</span></h3>
        </div>
        <span class="status-pill ${statusInfo.className}">${escapeHtml(statusInfo.label)}</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;margin-bottom:12px;font-size:0.9rem;">
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">PICKUP DATE &amp; TIME</strong> ${escapeHtml(pickupFormatted)}</div>
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">DROP DATE &amp; TIME</strong> ${escapeHtml(dropFormatted)}</div>
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">RENTAL DURATION</strong> <span style="color:#facc15;font-weight:700;">${escapeHtml(durationFormatted)}</span></div>
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">TOTAL AMOUNT</strong> ₹${formatCurrency(totalAmount)}</div>
        ${
          isAdvancePlan
            ? `
              <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">TOKEN PAID</strong> <span style="color:#06d6a0;font-weight:700;">₹${formatCurrency(advAmount || 500)}</span></div>
              <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">REMAINING DUE</strong> <span style="color:${remBalance > 0 ? '#ef476f' : '#06d6a0'};font-weight:700;">${remBalance > 0 ? `₹${formatCurrency(remBalance)}` : '₹0 (Fully Paid)'}</span></div>
            `
            : ""
        }
        <div style="grid-column: 1 / -1;"><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">PAYMENT STATUS</strong> ${paymentStatusLabel(b)}</div>
      </div>

      ${actionsHtml}
    </div>
  `;
}

function render(liveList, pastList) {
  liveEl.innerHTML = liveList.length
    ? liveList.map((b) => bookingCard(b, true)).join("")
    : `<div class="fleet-empty-state">
        <div class="fleet-empty-state__icon" aria-hidden="true">KR</div>
        <h2>No active bookings</h2>
        <p>You don't have any live or upcoming rides right now.</p>
        <a href="fleet.html" class="btn btn-light">Browse Fleet</a>
      </div>`;

  pastEl.innerHTML = pastList.length
    ? pastList.map((b) => bookingCard(b, false)).join("")
    : `<div class="fleet-empty-state">
        <div class="fleet-empty-state__icon" aria-hidden="true">KR</div>
        <h2>No past bookings yet</h2>
        <p>Your completed rides will show up here.</p>
      </div>`;
}

async function loadBookings(uid) {
  try {
    const res = await api.get("/bookings/my-bookings");
    const bookings = Array.isArray(res.bookings) ? res.bookings : [];
    bookings.sort((a, b) => (a.pickupDate < b.pickupDate ? 1 : -1));

    const todayISO = new Date().toISOString().slice(0, 10);
    const live = [];
    const past = [];

    bookings.forEach((b) => {
      const isOngoingOrUpcoming =
        b.status !== "cancelled" &&
        b.status !== "completed" &&
        b.dropDate >= todayISO;
      if (isOngoingOrUpcoming) {
        live.push(b);
      } else {
        past.push(b);
      }
    });

    render(live, past);
    wireActions(bookings);
  } catch (err) {
    console.error("Failed to load user bookings:", err);
  }
}

function wireActions(bookings) {
  document.querySelectorAll(".booking-pay-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `payment.html?booking=${encodeURIComponent(btn.dataset.id)}`;
    });
  });

  document.querySelectorAll(".booking-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!window.confirm("Cancel this booking? This will restore vehicle availability and process applicable refunds.")) return;
      btn.disabled = true;
      btn.textContent = "Cancelling...";
      try {
        await api.post(`/bookings/${btn.dataset.id}/cancel`);
        const uid = auth.currentUser && auth.currentUser.uid;
        if (uid) loadBookings(uid);
      } catch (error) {
        alert("Could not cancel booking: " + error.message);
        btn.disabled = false;
        btn.textContent = "Cancel Booking";
      }
    });
  });
}

async function initBookingsAuth() {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    window.location.href = `index.html?next=${encodeURIComponent("bookings.html")}`;
    return;
  }
  const user = getCurrentUser();
  loadBookings(user.id || user.uid);
}

initBookingsAuth();
