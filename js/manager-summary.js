import { getCurrentUser, checkAuth, isManagerUser, isAdminUser } from "./auth.js?v=20260904-v13";
import { api } from "./kruizly-api.js?v=20260904-v13";
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

let customStats = null;

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

  const eff = customStats?.effective;
  const isOverridden = customStats?.is_overridden;

  const displayTotalBookings = isOverridden && eff?.total_bookings != null ? eff.total_bookings : bookings.length;
  const displayRevenue = isOverridden && eff?.total_revenue != null ? eff.total_revenue : revenue;
  const displayMonthRevenue = isOverridden && eff?.month_revenue != null ? eff.month_revenue : monthRevenue;
  const displayAverage = isOverridden && eff?.avg_booking != null ? eff.avg_booking : average;
  const displayPendingPayments = isOverridden && eff?.pending_payments != null ? eff.pending_payments : pendingPayments;

  const totalPages = Math.max(1, Math.ceil(bookings.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = bookings.slice(start, start + PAGE_SIZE);

  content.innerHTML = `
    <section class="manager-stats" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">
      ${metric("Total Bookings", String(displayTotalBookings))}
      ${metric("Confirmed Bookings", String(confirmed))}
      ${metric("Active Trips", String(activeTrips), "pickups")}
      ${metric("Completed Trips", String(completed))}
      ${metric("Verified Revenue", formatINR(displayRevenue))}
      ${metric("Revenue This Month", formatINR(displayMonthRevenue))}
      ${metric("Average Value", formatINR(displayAverage))}
      ${metric("Pending Payments", String(displayPendingPayments), "action")}
    </section>

    <section class="card manager-panel">
      <div class="manager-panel-header">
        <h3 class="manager-panel-title">Operations Booking Ledger</h3>
      </div>
      <div style="width:100%;overflow-x:auto;">
        <table class="manager-table">
          <thead>
            <tr>
              <th>Booking</th>
              <th>Customer</th>
              <th>Schedule</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Trip Status</th>
            </tr>
          </thead>
          <tbody>
            ${pageItems.map(item => `
              <tr>
                <td><strong>${escapeHtml(formatBookingNumber(item.bookingNumber || item.id))}</strong><br><span style="color:var(--sub);font-size:12px;">${escapeHtml(item.carName || item.vehicleName || "Vehicle")}</span></td>
                <td>${escapeHtml(item.userName || item.name || "Customer")}<br><span style="color:var(--sub);font-size:12px;">${escapeHtml(item.userPhone || item.phone || item.userEmail || "—")}</span></td>
                <td>${escapeHtml(formatDate(item.pickupDate))}<br><span style="color:var(--sub);font-size:12px;">to ${escapeHtml(formatDate(item.dropDate))}</span></td>
                <td><strong>${formatINR(bookingAmount(item))}</strong></td>
                <td><span class="status-pill status-${escapeHtml(item.paymentStatus || 'pending')}">${escapeHtml(item.paymentStatus || 'Pending')}</span></td>
                <td><span class="status-pill status-${escapeHtml(item.status || 'pending')}">${escapeHtml(item.status || 'Pending')}</span></td>
              </tr>
            `).join("")}
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
  try {
    const [bookingsRes, statsRes] = await Promise.allSettled([
      api.get("/bookings"),
      api.get("/admin/stats")
    ]);
    if (bookingsRes.status === "fulfilled" && bookingsRes.value) {
      const res = bookingsRes.value;
      bookings = (res.bookings || res.data || [])
        .sort((a, b) => toMillis(b.createdAt || b.bookingDate || b.pickupDate) - toMillis(a.createdAt || a.bookingDate || a.pickupDate));
    }
    if (statsRes.status === "fulfilled" && statsRes.value?.data) {
      customStats = statsRes.value.data;
    }
  } catch (e) {
    console.warn("API summary fetch notice:", e);
    bookings = [];
  }
  renderDashboard();
}

async function initManagerSummary() {
  setVisible(content, false);
  setVisible(denied, false);

  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    setVisible(denied, true);
    return;
  }

  const user = getCurrentUser();
  if (isManagerUser(user) || isAdminUser(user)) {
    setVisible(denied, false);
    setVisible(content, true);
    await loadSummary();
  } else {
    setVisible(denied, true);
  }
}

initManagerSummary();
