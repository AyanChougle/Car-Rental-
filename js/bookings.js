import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import "./nav-helper.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
    case "pay_at_pickup":
      return "Pay at pickup";
    case "pending_verification":
      return `Verifying payment • ${booking.paymentRef || ""}`;
    case "rejected":
      return `Payment rejected${booking.paymentRejectionReason ? ` — ${booking.paymentRejectionReason}` : ""}. Please resubmit.`;
    default:
      return "Unpaid";
  }
}

const liveEl = document.getElementById("liveBookings");
const pastEl = document.getElementById("pastBookings");

function bookingCard(booking, isLive) {
  const info = STATUS_COPY[booking.status] || {
    label: booking.status,
    className: "",
  };
  const vehicle = (window.fleetVehicles || []).find(
    (v) => v.regNo === booking.vehicleReg,
  );
  const imgPath =
    vehicle && window.fleetImagePath ? window.fleetImagePath(vehicle) : "";

  let actionsHtml = "";
  if (isLive && booking.status === "pending_payment") {
    actionsHtml = `<button class="btn btn-dark booking-pay-btn" data-id="${booking.id}">Complete Payment</button>`;
  }
  if (isLive && booking.status === "confirmed") {
    actionsHtml = `<button class="btn btn-outline booking-cancel-btn" data-id="${booking.id}">Cancel Booking</button>`;
  }
  if (!isLive && booking.status !== "cancelled") {
    actionsHtml = `<a class="btn btn-light" href="booking.html?reg=${encodeURIComponent(booking.vehicleReg)}">Book Again</a>`;
  }

  const returnInfo = booking.returnInspection;
  const returnHtml =
    booking.status === "completed" && returnInfo
      ? `
    <div class="card" style="padding: 14px; margin-top: 12px; background: rgba(255,255,255,0.02);">
      <strong style="font-size: 0.85rem;">Return &amp; Deposit Settlement</strong>
      ${
        returnInfo.deductionTotal > 0
          ? `<ul style="margin: 8px 0; padding-left: 18px; color: var(--sub); font-size: 0.85rem;">
              ${returnInfo.items
                .filter((i) => i.checked)
                .map((i) => `<li>${i.label}: ₹${Math.round(i.amount).toLocaleString("en-IN")}</li>`)
                .join("")}
            </ul>`
          : `<p style="margin: 8px 0; color: var(--sub); font-size: 0.85rem;">No deductions — vehicle returned in good condition.</p>`
      }
      ${returnInfo.notes ? `<p style="margin: 8px 0; font-size: 0.85rem;">${returnInfo.notes}</p>` : ""}
      <div class="booking-summary__row" style="border-top: 1px dashed var(--line); margin-top: 8px; padding-top: 8px;">
        <span>Deposit Refunded</span>
        <strong style="color: var(--accent);">₹${Math.round(returnInfo.depositRefund).toLocaleString("en-IN")}</strong>
      </div>
    </div>
  `
      : "";

  return `
		<article class="booking-card">
			<div class="booking-card__image">
				${imgPath ? `<img src="${imgPath}" alt="${booking.vehicleName}" onload="this.nextElementSibling.style.display='none'" onerror="this.remove()" />` : ""}
				<span>${booking.vehicleIcon || "🚗"}</span>
			</div>
			<div class="booking-card__body">
				<div class="booking-card__top">
					<h3>${booking.vehicleName}</h3>
					<span class="fleet-status ${info.className}">${info.label}</span>
				</div>
				<div class="booking-card__dates">
					<span>Pickup: ${formatDate(booking.pickupDate)}</span>
					<span>Drop: ${formatDate(booking.dropDate)}</span>
					<span>${booking.days} day${booking.days > 1 ? "s" : ""}${booking.withDriver ? " • With driver" : ""}</span>
				</div>
				<div class="booking-card__meta">
					<span>${booking.location || ""}</span>
					<span>${paymentStatusLabel(booking)}</span>
				</div>
				<div class="booking-card__bottom">
					<div class="fleet-price">₹${formatCurrency(booking.totalAmount)}</div>
					<div class="booking-card__actions">${actionsHtml}</div>
				</div>
				${returnHtml}
			</div>
		</article>
	`;
}

function render(liveList, pastList) {
  liveEl.innerHTML = liveList.length
    ? liveList.map((b) => bookingCard(b, true)).join("")
    : `<p class="section-sub">No active bookings yet — <a href="fleet.html">browse the fleet</a> to book your next ride.</p>`;

  pastEl.innerHTML = pastList.length
    ? pastList.map((b) => bookingCard(b, false)).join("")
    : `<p class="section-sub">No past bookings yet.</p>`;
}

async function loadBookings(uid) {
  const q = query(collection(db, "bookings"), where("userId", "==", uid));
  const snap = await getDocs(q);

  const bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
}

function wireActions(bookings) {
  document.querySelectorAll(".booking-pay-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `payment.html?booking=${encodeURIComponent(btn.dataset.id)}`;
    });
  });

  document.querySelectorAll(".booking-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!window.confirm("Cancel this booking? This can't be undone.")) return;
      btn.disabled = true;
      btn.textContent = "Cancelling...";
      try {
        await updateDoc(doc(db, "bookings", btn.dataset.id), {
          status: "cancelled",
        });
        const uid = auth.currentUser && auth.currentUser.uid;
        if (uid) loadBookings(uid);
      } catch (error) {
        btn.disabled = false;
        btn.textContent = "Cancel Booking";
      }
    });
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = `index.html?next=${encodeURIComponent("bookings.html")}`;
    return;
  }
  loadBookings(user.uid);
});
