import { checkAuth, getCurrentUser } from "./auth.js?v=20260904-v2";
import { api } from "./kruizly-api.js?v=20260904-v2";
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
      return `Paid • ${booking.paymentRef || ""}`;
    case "advance_paid":
      return `₹${formatCurrency(booking.paymentAmountPaid || booking.paymentAmount || 500)} advance paid — ₹${formatCurrency(booking.remainingBalance || 0)} due at pickup`;
    case "pay_at_pickup":
      return "Pay at pickup";
    case "pending_verification":
      return `Verifying payment • ${booking.paymentRef || ""}`;
    case "refunded":
      return `Refunded • Booking cancelled`;
    case "rejected":
      return `Payment rejected${booking.paymentRejectionReason ? ` — ${booking.paymentRejectionReason}` : ""}. Please resubmit.`;
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

  let actionsHtml = "";
  if (isPending) {
    actionsHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
        <button class="btn btn-primary booking-pay-btn" data-id="${escapeHtml(b.id || b.bookingId)}">Complete Payment</button>
        <button class="btn btn-outline booking-cancel-btn" data-id="${escapeHtml(b.id || b.bookingId)}">Cancel Booking</button>
      </div>
    `;
  } else if (isLive && b.status !== "cancelled") {
    actionsHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
        <button class="btn btn-outline booking-cancel-btn" data-id="${escapeHtml(b.id || b.bookingId)}" style="border-color:#ef476f;color:#ef476f;">Cancel Booking</button>
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
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">PICKUP</strong> ${formatDate(b.pickupDate)}</div>
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">DROP</strong> ${formatDate(b.dropDate)}</div>
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">TOTAL</strong> ₹${formatCurrency(b.totalAmount || b.finalAmount || 0)}</div>
        <div><strong style="color:var(--kz-sub,#7b8798);display:block;font-size:0.75rem;">PAYMENT STATUS</strong> ${paymentStatusLabel(b)}</div>
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
