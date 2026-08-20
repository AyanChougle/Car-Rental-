import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import "./nav-helper.js";
import { formatBookingNumber } from "./booking-reference.js";

const content = document.getElementById("managerContent");
const denied = document.getElementById("managerAccessDenied");
const PAGE_SIZE = 10;
let bookings = [];
let currentPage = 1;

function setVisible(element, visible) {
  if (!element) return;
  element.hidden = !visible;
  element.style.display = visible ? "" : "none";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const millis = toMillis(value);
  if (!millis) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(millis));
}

function formatINR(value) {
  const number = Number(value || 0);
  return `₹${Math.round(number).toLocaleString("en-IN")}`;
}

function bookingAmount(booking) {
  return Number(booking.totalAmount ?? booking.amount ?? booking.total ?? 0) || 0;
}

function isThisMonth(value) {
  const millis = toMillis(value);
  if (!millis) return false;
  const date = new Date(millis);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function metric(label, value, tone = "") {
  return `
    <div class="card manager-stat-card ${tone}">
      <span class="manager-stat-label">${escapeHtml(label)}</span>
      <div class="manager-stat-value">${escapeHtml(value)}</div>
    </div>`;
}

function renderDashboard() {
  if (!content) return;

  const paid = bookings.filter(item => item.paymentStatus === "paid");
  const revenue = paid.reduce((sum, item) => sum + bookingAmount(item), 0);
  const monthRevenue = paid
    .filter(item => isThisMonth(item.paymentVerifiedAt || item.bookingDate || item.createdAt))
    .reduce((sum, item) => sum + bookingAmount(item), 0);
  const average = paid.length ? revenue / paid.length : 0;
  const confirmed = bookings.filter(item => item.status === "confirmed").length;
  const completed = bookings.filter(item => item.status === "completed").length;
  const activeTrips = bookings.filter(
    item => item.status === "confirmed" && item.pickupStatus === "picked_up"
  ).length;
  const pendingPayments = bookings.filter(
    item => item.paymentStatus === "pending_verification"
  ).length;

  const totalPages = Math.max(1, Math.ceil(bookings.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = bookings.slice(start, start + PAGE_SIZE);

  content.innerHTML = `
    <section class="manager-stats" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">
      ${metric("Total Bookings", String(bookings.length))}
      ${metric("Confirmed Bookings", String(confirmed))}
      ${metric("Active Trips", String(activeTrips), "pickups")}
      ${metric("Completed Trips", String(completed))}
      ${metric("Verified Revenue", formatINR(revenue))}
      ${metric("Revenue This Month", formatINR(monthRevenue))}
      ${metric("Paid Bookings", String(paid.length))}
      ${metric("Avg. Verified Booking", formatINR(average))}
      ${metric("Payments Awaiting Review", String(pendingPayments), "documents")}
    </section>

    <section class="card manager-panel">
      <div class="manager-panel-header">
        <div>
          <h2 class="manager-panel-title">Booking Summary</h2>
          <p class="manager-panel-subtitle">Read-only view of recent booking and payment performance.</p>
        </div>
        <span class="manager-status verified">Read-only summary</span>
      </div>
      <div class="manager-table-wrap">
        <table class="manager-table">
          <thead><tr><th>Booking</th><th>Customer</th><th>Vehicle</th><th>Date</th><th>Amount</th><th>Status</th><th>Payment</th></tr></thead>
          <tbody>
            ${pageItems.map(item => `
              <tr>
                <td><strong>#${escapeHtml(formatBookingNumber(item))}</strong></td>
                <td>${escapeHtml(item.userName || item.customerName || "Customer")}</td>
                <td>${escapeHtml(item.vehicleName || item.carName || "Vehicle")}</td>
                <td>${escapeHtml(formatDate(item.createdAt || item.bookingDate || item.pickupDate))}</td>
                <td style="color:var(--accent);font-weight:700">${escapeHtml(formatINR(bookingAmount(item)))}</td>
                <td><span class="manager-status ${escapeHtml(String(item.status || "pending").toLowerCase())}">${escapeHtml(String(item.status || "pending").replaceAll("_", " "))}</span></td>
                <td>${escapeHtml(String(item.paymentStatus || "unpaid").replaceAll("_", " "))}</td>
              </tr>`).join("") || `<tr><td colspan="7" class="manager-state">No bookings available.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${totalPages > 1 ? `
        <nav class="data-pagination" aria-label="Manager booking summary pages">
          <span class="data-pagination__summary">Page ${currentPage} of ${totalPages} · ${bookings.length} bookings</span>
          <div class="data-pagination__actions">
            <button type="button" data-summary-page="previous" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
            <button type="button" data-summary-page="next" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
          </div>
        </nav>` : ""}
    </section>`;

  content.querySelectorAll("[data-summary-page]").forEach(button => {
    button.addEventListener("click", () => {
      currentPage += button.dataset.summaryPage === "next" ? 1 : -1;
      renderDashboard();
      content.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function loadSummary() {
  if (content) {
    content.innerHTML = `<div class="card manager-panel manager-state">Loading management summary...</div>`;
  }
  const snapshot = await getDocs(collection(db, "bookings"));
  bookings = snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => toMillis(b.createdAt || b.bookingDate || b.pickupDate) - toMillis(a.createdAt || a.bookingDate || a.pickupDate));
  renderDashboard();
}

onAuthStateChanged(auth, async user => {
  setVisible(content, false);
  setVisible(denied, false);

  if (!user) {
    setVisible(denied, true);
    return;
  }

  try {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    const role = snapshot.exists()
      ? String(snapshot.data().role || "customer").trim().toLowerCase()
      : "customer";

    if (role !== "manager" && role !== "admin") {
      setVisible(denied, true);
      return;
    }

    setVisible(content, true);
    await loadSummary();
  } catch (error) {
    console.error("Manager summary error:", error);
    setVisible(content, true);
    if (content) {
      content.innerHTML = `<div class="card manager-panel manager-state" style="color:#ef476f">Could not load the management summary.</div>`;
    }
  }
});
