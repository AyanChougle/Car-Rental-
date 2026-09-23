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
  switch (booking.paymentStatus) {
    case "paid":
      return `Paid � ${booking.paymentRef || ""}`;
    case "advance_paid":
      return `?${formatCurrency(booking.paymentAmountPaid || booking.paymentAmount || 500)} token paid � ?${formatCurrency(booking.remainingBalance || 0)} due at pickup`;
    case "pay_at_pickup":
      return "Pay at pickup";
    case "pending_verification":
      return `Verifying payment � ${booking.paymentRef || ""}`;
    case "refunded":
      return `Refunded � Booking cancelled`;
    case "rejected":
      return `Payment rejected${booking.paymentRejectionReason ? ` � ${booking.paymentRejectionReason}` : ""}. Please resubmit.`;
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

  const isPending = b.status === "pending_payment";
  const vehicleName = b.vehicleName || "KRUIZLY Rental Vehicle";
  const vehicleCategory = b.vehicleCategory || "Sedan";

  const pickupFormatted = formatHumanDateTime(b.pickupDate);
  const dropFormatted = formatHumanDateTime(b.dropDate);
  const dur = calculateDuration(b.pickupDate, b.dropDate);
  const durationFormatted = dur.valid ? dur.daysAndHoursText : (b.duration || "—");

  const waText = encodeURIComponent(
    `🎉 *KRUIZLY BOOKING CONFIRMATION*\n\n` +
    `Booking ID: #${b.bookingNumber || b.bookingId || b.id}\n` +
    `Vehicle: ${vehicleName} (${vehicleCategory})\n` +
    `Pickup Date & Time: ${pickupFormatted}\n` +
    `Drop Date & Time: ${dropFormatted}\n` +
    `Duration: ${durationFormatted}\n` +
    `Total Amount: ₹${formatCurrency(b.totalAmount || b.finalAmount || 0)}\n` +
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

  let actionsHtml = "";
  if (isPending) {
    actionsHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center;">
        <button class="btn btn-primary booking-pay-btn" data-id="${escapeHtml(b.id || b.bookingId)}">Complete Payment</button>
        <button class="btn btn-outline booking-cancel-btn" data-id="${escapeHtml(b.id || b.bookingId)}">Cancel Booking</button>
        ${whatsappBtnHtml}
      </div>
    `;
  } else if (isLive && b.status !== "cancelled") {
    actionsHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center;">
        <button class="btn btn-outline booking-cancel-btn" data-id="${escapeHtml(b.id || b.bookingId)}" style="border-color:#ef476f;color:#ef476f;">Cancel Booking</button>
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
          <span style="font-size:0.8rem;color:var(--kz-sub,#7b8798);text-transform:uppercase;letter-spacing:1px;font-weight:700;">Booking #${escapeHtml(b.bookingNumber || b.bookingId || b.id)}</span>
          <h3 style="margin:4px 0 0;font-size:1.2rem;color:#fff;">${escapeHtml(vehicleName)} <span style="font-size:0.85rem;color:var(--kz-cyan,#4fd7ff);font-weight:normal;">(${escapeHtml(vehicleCategory)})</span></h3>
        </div>
        <span class="status-pill ${statusInfo.className}">${escapeHtml(statusInfo.label)}</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;margin-bottom:12px;font-size:0.9rem;">
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">PICKUP DATE &amp; TIME</strong> ${escapeHtml(pickupFormatted)}</div>
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">DROP DATE &amp; TIME</strong> ${escapeHtml(dropFormatted)}</div>
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">RENTAL DURATION</strong> <span style="color:#facc15;font-weight:700;">${escapeHtml(durationFormatted)}</span></div>
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">TOTAL AMOUNT</strong> ₹${formatCurrency(b.totalAmount || b.finalAmount || 0)}</div>
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
