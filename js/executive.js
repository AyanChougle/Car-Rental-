/**
 * js/executive.js
 * 
 * Executive Operations Hub:
 * - Start Trip / Pickup Handover (Photos, Odometer, FASTag, Fuel, Payment Collection)
 * - Process Vehicle Return (Photos, Return Odometer, FASTag, Deductions, Invoice Notes)
 * - Booking Approvals & Status Updates
 * - UPI & Bank Transfer Payment Verification
 * - Customer KYC / ID Verification (License, Aadhaar, PAN) with Image Previews
 * - Fleet Inventory Preview
 * - Coupon Offers Preview
 */

import { auth } from "./firebase-init.js";
import { checkAuth, getCurrentUser, setStoredUser, isExecutiveUser, isManagerUser, isAdminUser } from "./auth.js?v=20260908-v5";
import { api } from "./kruizly-api.js?v=20260908-v5";
import "./nav-helper.js?v=20260908-v5";
import { formatBookingNumber } from "./booking-reference.js";
import { initialiseAdminCalendar, loadAdminCalendar } from "./admin.js?v=20260911-v15";
import { openImageLightbox } from "./image-lightbox.js?v=20260912-v1";

function $(id) {
  return document.getElementById(id);
}

function safeShow(el) {
  if (!el) return;
  el.hidden = false;
  el.removeAttribute("hidden");
  el.style.display = "block";
}

function safeHide(el) {
  if (!el) return;
  el.hidden = true;
  el.setAttribute("hidden", "hidden");
  el.style.display = "none";
}

// Fallbacks for backwards compatibility
const showEl = safeShow;
const hideEl = safeHide;

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(num) {
  const val = Number(num || 0);
  return `₹${Math.round(val).toLocaleString("en-IN")}`;
}

function formatReadableDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(d);
  } catch {
    return dateStr;
  }
}

// State
let currentUser = null;
let allBookings = [];
let allPayments = [];
let allVerifications = [];
let allFleet = [];
let allCoupons = [];

let execBookingsPerPage = 5;
let execPaymentsPerPage = 5;
let execKycPerPage = 5;
let execFleetPerPage = 6;
let execCouponsPerPage = 5;

let execBookingPage = 1;
let execPaymentPage = 1;
let execKycPage = 1;
let execFleetPage = 1;
let execCouponsPage = 1;

let activePickupBooking = null;
let pickupSelectedFiles = [];
let pickupPreviewUrls = [];

let activeReturnBooking = null;
let returnSelectedFiles = [];
let returnPreviewUrls = [];

let activePaymentItem = null;
let activeKycItem = null;
let activeKycDocTab = "license";

function getCarImage(car) {
  if (!car) return "assets/fleet/BMW.png";
  if (typeof window !== "undefined" && typeof window.fleetImagePath === "function") {
    const path = window.fleetImagePath(car);
    if (path && !path.includes("BMW.png")) return path;
    if (path && car.brand && car.brand.toLowerCase() === "bmw") return path;
  }
  if (Array.isArray(car.gallery) && car.gallery[0] && !car.gallery[0].includes("BMW.png")) {
    return car.gallery[0];
  }
  if (car.imageUrl && !car.imageUrl.includes("BMW.png")) {
    return car.imageUrl;
  }
  const brand = (car.brand || "").trim();
  const model = (car.model || "").trim();
  const fullName = `${brand} ${model}`.trim();
  if (typeof window !== "undefined" && typeof window.fleetImagePath === "function") {
    return window.fleetImagePath(fullName) || window.fleetImagePath(model) || "assets/fleet/BMW.png";
  }
  return "assets/fleet/BMW.png";
}

function renderPaginationHtml(currentPage, totalPages, totalItems, itemLabel = "items", pageSize = 5, type = "bookings") {
  if (!totalItems) return "";

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);

  const getPageWindow = (curr, total) => {
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    if (curr <= 3) return [1, 2, 3, "...", total];
    if (curr >= total - 2) return [1, "...", total - 2, total - 1, total];
    return [1, "...", curr, "...", total];
  };

  const windowPages = getPageWindow(currentPage, totalPages);

  const buttonsHtml = windowPages
    .map((p) => {
      if (p === "...") {
        return `<span class="data-pagination__ellipsis" aria-hidden="true" style="color:var(--sub);padding:4px 6px;">...</span>`;
      }
      const isActive = p === currentPage;
      return `<button type="button" class="btn-pagination ${isActive ? "active" : ""}" data-page="${p}">${p}</button>`;
    })
    .join("");

  return `
    <div class="data-pagination" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-top:18px;padding:12px 16px;background:rgba(10,15,26,0.75);border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <span class="data-pagination__summary" style="font-size:13px;color:var(--sub);">
          Showing <strong>${startItem}-${endItem}</strong> of <strong>${totalItems}</strong> ${itemLabel} (Page <strong>${currentPage}</strong> of <strong>${totalPages}</strong>)
        </span>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--sub);">
          <span>Show:</span>
          <select class="exec-page-size-select" data-type="${type}" style="background:rgba(255,255,255,0.06);color:#ffffff;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;">
            <option value="5" ${pageSize === 5 ? "selected" : ""}>5</option>
            <option value="10" ${pageSize === 10 ? "selected" : ""}>10</option>
            <option value="20" ${pageSize === 20 ? "selected" : ""}>20</option>
          </select>
        </div>
      </div>
      <div class="data-pagination__actions" style="display:flex;gap:6px;align-items:center;">
        <button type="button" class="btn-pagination" data-page="prev" ${currentPage === 1 ? "disabled" : ""}>
          <span class="data-pagination__btn-text">Prev</span>
        </button>
        ${buttonsHtml}
        <button type="button" class="btn-pagination" data-page="next" ${currentPage === totalPages ? "disabled" : ""}>
          <span class="data-pagination__btn-text">Next</span>
        </button>
      </div>
    </div>
  `;
}

/* ==========================================================================
   INITIALIZATION & AUTH CHECK
   ========================================================================== */

async function initExecutive() {
  const accessDeniedEl = $("executiveAccessDenied");
  const contentEl = $("executiveContent");

  safeHide(accessDeniedEl);
  safeHide(contentEl);

  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    safeShow(accessDeniedEl);
    return;
  }

  currentUser = getCurrentUser();

  // Real-time backend role sync: if role in localStorage is not staff yet, query /users/me
  if (!isExecutiveUser(currentUser) && !isManagerUser(currentUser) && !isAdminUser(currentUser)) {
    try {
      const meRes = await api.get("/users/me");
      if (meRes && meRes.user) {
        setStoredUser(meRes.user);
        currentUser = getCurrentUser();
      }
    } catch (err) {
      console.warn("User role sync notice:", err);
    }
  }

  const hasStaffRole = isExecutiveUser(currentUser) || isManagerUser(currentUser) || isAdminUser(currentUser);

  if (!hasStaffRole) {
    safeShow(accessDeniedEl);
    return;
  }

  safeShow(contentEl);

  initTabs();
  initModals();
  initFilters();
  try {
    initialiseAdminCalendar();
  } catch (err) {
    console.warn("Calendar init notice:", err);
  }

  await loadAllExecutiveData();
}

/* ==========================================================================
   TAB NAVIGATION
   ========================================================================== */

function initTabs() {
  const tabButtons = document.querySelectorAll(".admin-tabs .tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;

      tabButtons.forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.classList.toggle("btn-dark", b === btn);
        b.classList.toggle("btn-outline", b !== btn);
      });

      tabPanels.forEach((panel) => {
        panel.hidden = panel.id !== targetTab;
      });

      if (targetTab === "tab-exec-bookings") {
        execBookingPage = 1;
        renderBookingsTable();
      }
      if (targetTab === "tab-exec-calendar") {
        loadAdminCalendar();
      }
      if (targetTab === "tab-exec-payments") {
        execPaymentPage = 1;
        renderPaymentsTable();
      }
      if (targetTab === "tab-exec-kyc") {
        execKycPage = 1;
        renderKycTable();
      }
      if (targetTab === "tab-exec-fleet") {
        execFleetPage = 1;
        renderFleetGrid();
      }
      if (targetTab === "tab-exec-coupons") {
        execCouponsPage = 1;
        renderCouponsTable();
      }
    });
  });
}

/* ==========================================================================
   LOAD ALL DATA FROM HOSTINGER MYSQL VIA API
   ========================================================================== */

async function loadAllExecutiveData() {
  try {
    const [bookingsRes, paymentsRes, kycRes, fleetRes, couponsRes] = await Promise.all([
      api.get("/bookings").catch(() => ({ bookings: [] })),
      api.get("/payments").catch(() => ({ payments: [] })),
      api.get("/verification").catch(() => ({ verifications: [] })),
      api.get("/vehicles").catch(() => ({ vehicles: [] })),
      api.get("/coupons").catch(() => ({ coupons: [] }))
    ]);

    const rawBk = Array.isArray(bookingsRes?.bookings) ? bookingsRes.bookings : [];
    const seenBk = new Set();
    allBookings = [];
    rawBk.forEach((b) => {
      const key = String(b.bookingNumber || b.bookingId || b.id || "").trim().toUpperCase();
      if (key && !seenBk.has(key)) {
        seenBk.add(key);
        allBookings.push(b);
      }
    });

    const rawPay = Array.isArray(paymentsRes?.payments) ? paymentsRes.payments : [];
    const seenPay = new Set();
    allPayments = [];
    rawPay.forEach((p) => {
      const key = String(p.paymentId || p.id || p.utr || "").trim().toUpperCase();
      if (key && !seenPay.has(key)) {
        seenPay.add(key);
        allPayments.push(p);
      }
    });

    const rawKyc = Array.isArray(kycRes?.verifications) ? kycRes.verifications : [];
    const seenKyc = new Set();
    allVerifications = [];
    rawKyc.forEach((k) => {
      const key = String(k.firebase_uid || k.userId || k.email || k.id || "").trim();
      if (key && !seenKyc.has(key)) {
        seenKyc.add(key);
        allVerifications.push(k);
      }
    });

    const rawFleet = Array.isArray(fleetRes?.vehicles) ? fleetRes.vehicles : [];
    const seenFleet = new Set();
    allFleet = [];
    rawFleet.forEach((v) => {
      const reg = String(v.regNo || v.reg_no || "").trim().toUpperCase();
      const carId = String(v.carId || v.car_id || v.id || "").trim().toUpperCase();
      const key = (reg && reg !== "TBD") ? reg : carId;
      if (key && !seenFleet.has(key)) {
        seenFleet.add(key);
        allFleet.push(v);
      }
    });

    const rawCpn = Array.isArray(couponsRes?.coupons) ? couponsRes.coupons : [];
    const seenCpn = new Set();
    allCoupons = [];
    rawCpn.forEach((c) => {
      const key = String(c.code || "").trim().toUpperCase();
      if (key && !seenCpn.has(key)) {
        seenCpn.add(key);
        allCoupons.push(c);
      }
    });

    updateStats();
    renderBookingsTable();
    renderPaymentsTable();
    renderKycTable();
    renderFleetGrid();
    renderCouponsTable();
  } catch (err) {
    console.error("Failed to load executive data:", err);
  }
}

function parseExecDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameExecDay(d1, d2) {
  if (!d1 || !d2) return false;
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function updateStats() {
  const activeCountEl = $("execActiveCount");
  const pickupCountEl = $("execPickupCount");
  const returnCountEl = $("execReturnCount");
  const pendingPaymentsCountEl = $("execPendingPaymentsCount");
  const pendingKycCountEl = $("execPendingKycCount");

  const paymentsBadge = $("execPaymentsBadge");
  const kycBadge = $("execKycBadge");

  const now = new Date();

  const activeCount = allBookings.filter((b) => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    if (bStat === "cancelled" || bStat === "rejected" || bStat === "completed" || bStat === "returned") return false;
    return bStat === "active" || bStat === "in_trip" || bStat === "started" || b.pickupStatus === "picked_up";
  }).length;

  const pickupsToday = allBookings.filter((b) => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    if (bStat === "cancelled" || bStat === "rejected") return false;
    const p = parseExecDate(b.pickupDate);
    return isSameExecDay(p, now);
  }).length;

  const returnsToday = allBookings.filter((b) => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    if (bStat === "cancelled" || bStat === "rejected") return false;
    const d = parseExecDate(b.dropDate);
    return isSameExecDay(d, now);
  }).length;

  const pendingPayments = allPayments.filter((p) => {
    const s = String(p.status || "").toLowerCase();
    return s === "pending" || s === "pending_verification";
  }).length;

  const pendingKyc = allVerifications.filter((v) => {
    const s = String(v.overallStatus || v.status || "").toLowerCase();
    return s === "pending" || v.licenseStatus === "pending" || v.aadharStatus === "pending" || v.panStatus === "pending";
  }).length;

  if (activeCountEl) activeCountEl.textContent = String(activeCount);
  if (pickupCountEl) pickupCountEl.textContent = String(pickupsToday);
  if (returnCountEl) returnCountEl.textContent = String(returnsToday);
  if (pendingPaymentsCountEl) pendingPaymentsCountEl.textContent = String(pendingPayments);
  if (pendingKycCountEl) pendingKycCountEl.textContent = String(pendingKyc);

  if (paymentsBadge) {
    paymentsBadge.textContent = String(pendingPayments);
    paymentsBadge.style.display = pendingPayments > 0 ? "inline-block" : "none";
  }

  if (kycBadge) {
    kycBadge.textContent = String(pendingKyc);
    kycBadge.style.display = pendingKyc > 0 ? "inline-block" : "none";
  }
}

/* ==========================================================================
   TAB 1: BOOKINGS & OPERATIONS TABLE
   ========================================================================== */

function initFilters() {
  const searchInput = $("execSearchInput");
  const statusFilter = $("execStatusFilter");
  const sortOrder = $("execSortOrder");
  const refreshBtn = $("execRefreshBtn");

  searchInput?.addEventListener("input", renderBookingsTable);
  statusFilter?.addEventListener("change", renderBookingsTable);
  sortOrder?.addEventListener("change", renderBookingsTable);
  refreshBtn?.addEventListener("click", loadAllExecutiveData);
}

function getFilteredBookings() {
  const search = ($("execSearchInput")?.value || "").toLowerCase().trim();
  const status = $("execStatusFilter")?.value || "";
  const sort = $("execSortOrder")?.value || "desc";

  return allBookings
    .filter((b) => {
      if (status && b.status !== status && b.bookingStatus !== status) return false;
      if (search) {
        const hay = `${b.bookingNumber} ${b.id} ${b.userName} ${b.userEmail} ${b.userPhone} ${b.vehicleName} ${b.vehicleReg}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const tA = new Date(a.pickupDate || a.createdAt).getTime() || 0;
      const tB = new Date(b.pickupDate || b.createdAt).getTime() || 0;
      return sort === "asc" ? tA - tB : tB - tA;
    });
}

function renderBookingsTable() {
  const wrap = $("execBookingsWrap");
  if (!wrap) return;

  const filtered = getFilteredBookings();
  const totalItems = filtered.length;

  if (!totalItems) {
    wrap.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--sub);">No bookings found matching filters.</div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / execBookingsPerPage));
  execBookingPage = Math.max(1, Math.min(execBookingPage, totalPages));

  const startIndex = (execBookingPage - 1) * execBookingsPerPage;
  const paginatedBookings = filtered.slice(startIndex, startIndex + execBookingsPerPage);

  wrap.innerHTML = `
    <div style="overflow-x: auto;">
      <table class="admin-table" style="width: 100%; min-width: 840px; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--sub); font-size: 12.5px; text-transform: uppercase;">
            <th style="padding: 12px 10px;">Date</th>
            <th style="padding: 12px 10px;">Booking Ref</th>
            <th style="padding: 12px 10px;">Customer</th>
            <th style="padding: 12px 10px;">Vehicle</th>
            <th style="padding: 12px 10px;">Amount (Excl. Deposit)</th>
            <th style="padding: 12px 10px;">Status</th>
            <th style="padding: 12px 10px; text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${paginatedBookings
            .map((b) => {
              const baseAmt = (b.baseAmount !== undefined && b.baseAmount !== null && Number(b.baseAmount) > 0)
                ? Number(b.baseAmount)
                : Math.max(0, Number(b.finalAmount || b.totalAmount || 0) - Number(b.securityDeposit || 0));

              const statusClass =
                b.status === "active" || b.status === "confirmed"
                  ? "color: #06d6a0;"
                  : b.status === "pending_verification" || b.status === "pending_payment"
                  ? "color: #ffd166;"
                  : b.status === "cancelled" || b.status === "rejected"
                  ? "color: #ef476f;"
                  : "color: #4fd7ff;";

              const displayStatus = (b.status || "pending").replace(/_/g, " ").toUpperCase();
              const isPickedUp = b.status === "active" || b.pickupStatus === "picked_up";
              const isCompleted = b.status === "completed";
              const isCancelled = b.status === "cancelled" || b.status === "rejected";

              return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13.5px;">
                  <td style="padding: 12px 10px; color: var(--sub); white-space: nowrap;">${escapeHtml(formatReadableDate(b.pickupDate || b.createdAt))}</td>
                  <td style="padding: 12px 10px; font-family: monospace; font-weight: 700; color: var(--accent);">#${escapeHtml(formatBookingNumber(b))}</td>
                  <td style="padding: 12px 10px;">
                    <strong style="color: #fff;">${escapeHtml(b.userName || "Customer")}</strong><br/>
                    <small style="color: #4fd7ff; font-size: 12px;">${escapeHtml(b.userEmail || "")}</small>
                    ${b.userPhone ? `<br/><small style="color: var(--sub); font-size: 11.5px;">${escapeHtml(b.userPhone)}</small>` : ""}
                  </td>
                  <td style="padding: 12px 10px;">
                    <strong>${escapeHtml(b.vehicleName || "Vehicle")}</strong><br/>
                    <small style="color: var(--sub); font-family: monospace;">${escapeHtml(b.vehicleReg || "—")}</small>
                  </td>
                  <td style="padding: 12px 10px; font-weight: 700; color: #06d6a0;">${formatMoney(baseAmt)}</td>
                  <td style="padding: 12px 10px; font-weight: 700; ${statusClass}">${escapeHtml(displayStatus)}</td>
                  <td style="padding: 12px 10px; text-align: right;">
                    <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end; flex-wrap: wrap;">
                      ${
                        !isPickedUp && !isCompleted && !isCancelled
                          ? `<button type="button" class="btn btn-outline btn-sm btn-approve-booking" data-id="${escapeHtml(b.id)}" style="border-color: #06d6a0; color: #06d6a0; padding: 4px 8px; font-size: 12px;">Approve</button>`
                          : ""
                      }
                      ${
                        !isPickedUp && !isCompleted && !isCancelled
                          ? `<button type="button" class="btn btn-dark btn-sm btn-start-pickup" data-id="${escapeHtml(b.id)}" style="background: #4fd7ff; color: #000; font-weight: 700; padding: 4px 10px; font-size: 12px;">Start Trip</button>`
                          : ""
                      }
                      ${
                        isPickedUp && !isCompleted
                          ? `<button type="button" class="btn btn-dark btn-sm btn-process-return" data-id="${escapeHtml(b.id)}" style="background: #ffd166; color: #000; font-weight: 700; padding: 4px 10px; font-size: 12px;">Return</button>`
                          : ""
                      }
                      <button type="button" class="btn btn-outline btn-sm btn-view-booking" data-id="${escapeHtml(b.id)}" style="padding: 4px 8px; font-size: 12px;">Details</button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    ${renderPaginationHtml(execBookingPage, totalPages, totalItems, "bookings", execBookingsPerPage, "bookings")}
  `;

  // Attach action listeners
  wrap.querySelectorAll(".btn-approve-booking").forEach((btn) => {
    btn.addEventListener("click", () => handleApproveBooking(btn.dataset.id));
  });

  wrap.querySelectorAll(".btn-start-pickup").forEach((btn) => {
    btn.addEventListener("click", () => {
      const booking = allBookings.find((item) => item.id === btn.dataset.id);
      if (booking) openPickupModal(booking);
    });
  });

  wrap.querySelectorAll(".btn-process-return").forEach((btn) => {
    btn.addEventListener("click", () => {
      const booking = allBookings.find((item) => item.id === btn.dataset.id);
      if (booking) openReturnModal(booking);
    });
  });

  wrap.querySelectorAll(".btn-view-booking").forEach((btn) => {
    btn.addEventListener("click", () => {
      const booking = allBookings.find((item) => item.id === btn.dataset.id);
      if (booking) openBookingDetailModal(booking);
    });
  });

  // Attach pagination listeners
  wrap.querySelectorAll(".exec-page-size-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      execBookingsPerPage = Number(sel.value) || 5;
      execBookingPage = 1;
      renderBookingsTable();
    });
  });

  wrap.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.page;
      if (target === "prev") {
        execBookingPage = Math.max(1, execBookingPage - 1);
      } else if (target === "next") {
        execBookingPage = Math.min(totalPages, execBookingPage + 1);
      } else {
        execBookingPage = Number(target) || 1;
      }
      renderBookingsTable();
      wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function handleApproveBooking(bookingId) {
  if (!confirm("Approve and confirm this booking reservation?")) return;

  try {
    await api.put(`/bookings/${encodeURIComponent(bookingId)}`, {
      status: "confirmed",
      bookingStatus: "confirmed"
    });
    alert("Booking approved successfully.");
    await loadAllExecutiveData();
  } catch (err) {
    alert(`Failed to approve booking: ${err.message}`);
  }
}

/* ==========================================================================
   PICKUP HANDOVER MODAL & PHOTO UPLOAD
   ========================================================================== */

function openPickupModal(booking) {
  activePickupBooking = booking;
  pickupSelectedFiles = [];
  pickupPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  pickupPreviewUrls = [];

  const modal = $("executivePickupModal");
  const title = $("executivePickupModalTitle");
  const odo = $("executivePickupOdo");
  const fastag = $("executivePickupFastag");
  const fuel = $("executivePickupFuel");
  const notes = $("executivePickupNotes");
  const balanceDisplay = $("executivePickupBalanceDisplay");
  const fullPaidCheck = $("executivePickupFullPaidCheck");
  const payRef = $("executivePickupPayRef");
  const previewBox = $("executivePickupPreview");
  const statusEl = $("executivePickupStatus");

  if (title) title.textContent = `Pickup — ${booking.vehicleName || "Vehicle"} (#${formatBookingNumber(booking)})`;
  if (odo) odo.value = booking.pickupOdometer ?? booking.startOdometer ?? "";
  if (fastag) fastag.value = booking.pickupFastagBalance ?? booking.startFastag ?? "";
  if (fuel) fuel.value = booking.pickupFuelLevel || "Full";
  if (notes) notes.value = booking.pickupNotes || "";
  if (payRef) payRef.value = booking.paymentRef || "";
  if (previewBox) previewBox.innerHTML = "";
  if (statusEl) statusEl.textContent = "";

  const total = Number(booking.finalAmount || booking.totalAmount || 0);
  const paid = Number(booking.advanceAmount || (booking.paymentStatus === "paid" ? total : 0));
  const rem = Math.max(0, Number(booking.remainingBalance ?? (total - paid)));

  if (balanceDisplay) balanceDisplay.textContent = `₹${Math.round(rem).toLocaleString("en-IN")}`;
  if (fullPaidCheck) fullPaidCheck.checked = rem > 0;

  if (modal) {
    modal.hidden = false;
    modal.style.display = "flex";
  }
}

function closePickupModal() {
  const modal = $("executivePickupModal");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
  pickupPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  pickupPreviewUrls = [];
  pickupSelectedFiles = [];
  activePickupBooking = null;
}

function initModals() {
  // Pickup modal
  $("closeExecutivePickupModal")?.addEventListener("click", closePickupModal);
  $("cancelExecutivePickupBtn")?.addEventListener("click", closePickupModal);

  $("executivePickupPhotos")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const previewBox = $("executivePickupPreview");
    pickupSelectedFiles.push(...files);

    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      pickupPreviewUrls.push(url);

      const item = document.createElement("div");
      item.style.cssText = "position: relative; width: 80px; height: 80px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2);";
      item.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`;
      previewBox?.appendChild(item);
    });
  });

  $("saveExecutivePickupBtn")?.addEventListener("click", async () => {
    if (!activePickupBooking) return;

    const btn = $("saveExecutivePickupBtn");
    const statusEl = $("executivePickupStatus");
    const odo = Number($("executivePickupOdo")?.value || 0);
    const fastag = Number($("executivePickupFastag")?.value || 0);
    const fuel = $("executivePickupFuel")?.value || "Full";
    const notes = $("executivePickupNotes")?.value || "";
    const fullPaid = $("executivePickupFullPaidCheck")?.checked;
    const payMode = $("executivePickupPayMode")?.value || "UPI";
    const payRef = $("executivePickupPayRef")?.value || "";

    if (odo <= 0) {
      alert("Please enter the vehicle's starting odometer reading.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Uploading & Saving...";
    if (statusEl) statusEl.textContent = "Uploading condition photos...";

    try {
      const uploadedMediaIds = [];

      for (const file of pickupSelectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", "inspection_photo");
        formData.append("relatedId", activePickupBooking.id);

        const uploadRes = await api.upload("/media/upload", formData);
        if (uploadRes?.mediaId || uploadRes?.id) {
          uploadedMediaIds.push(uploadRes.mediaId || uploadRes.id);
        }
      }

      if (statusEl) statusEl.textContent = "Updating booking trip state...";

      const payload = {
        status: "active",
        bookingStatus: "active",
        pickupStatus: "picked_up",
        pickupOdometer: odo,
        startOdometer: odo,
        pickupFastagBalance: fastag,
        startFastag: fastag,
        pickupFuelLevel: fuel,
        pickupNotes: notes,
        pickupHandledBy: currentUser?.name || currentUser?.email || "Executive",
        pickupAt: new Date().toISOString(),
        pickupPhotoMediaIds: uploadedMediaIds
      };

      if (fullPaid) {
        payload.paymentStatus = "paid";
        payload.paymentMode = payMode;
        payload.paymentRef = payRef || activePickupBooking.paymentRef || "Paid at Pickup";
      }

      await api.put(`/bookings/${encodeURIComponent(activePickupBooking.id)}`, payload);

      alert("Trip started and vehicle handover confirmed successfully!");
      closePickupModal();
      await loadAllExecutiveData();
    } catch (err) {
      console.error("Pickup save error:", err);
      alert(`Could not complete pickup handover: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Upload & Start Trip";
    }
  });

  // Return modal
  $("closeReturnModal")?.addEventListener("click", closeReturnModal);
  $("cancelReturnBtn")?.addEventListener("click", closeReturnModal);

  $("returnInspectionPhotos")?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const previewBox = $("returnInspectionPreview");
    returnSelectedFiles.push(...files);

    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      returnPreviewUrls.push(url);

      const item = document.createElement("div");
      item.style.cssText = "position: relative; width: 80px; height: 80px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2);";
      item.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`;
      previewBox?.appendChild(item);
    });
  });

  $("returnDeductionsInput")?.addEventListener("input", updateReturnRefundDisplay);

  $("saveReturnBtn")?.addEventListener("click", async () => {
    if (!activeReturnBooking) return;

    const btn = $("saveReturnBtn");
    const odo = Number($("returnOdometer")?.value || 0);
    const fastag = Number($("returnFastag")?.value || 0);
    const deductions = Number($("returnDeductionsInput")?.value || 0);
    const notes = $("returnInvoiceNotes")?.value || "";

    if (odo <= 0) {
      alert("Please enter the vehicle's return odometer reading.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Processing Return...";

    try {
      const uploadedMediaIds = [];
      for (const file of returnSelectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", "inspection_photo");
        formData.append("relatedId", activeReturnBooking.id);

        const uploadRes = await api.upload("/media/upload", formData);
        if (uploadRes?.mediaId || uploadRes?.id) {
          uploadedMediaIds.push(uploadRes.mediaId || uploadRes.id);
        }
      }

      const deposit = Number(activeReturnBooking.securityDeposit || 0);
      const refund = Math.max(0, deposit - deductions);

      await api.put(`/bookings/${encodeURIComponent(activeReturnBooking.id)}`, {
        status: "completed",
        bookingStatus: "completed",
        pickupStatus: "returned",
        returnOdometer: odo,
        endOdometer: odo,
        returnFastag: fastag,
        returnFastagBalance: fastag,
        returnDeductions: deductions,
        refundableDeposit: refund,
        returnNotes: notes,
        returnPhotoMediaIds: uploadedMediaIds,
        returnAt: new Date().toISOString()
      });

      alert("Vehicle return processed and trip marked Completed!");
      closeReturnModal();
      await loadAllExecutiveData();
    } catch (err) {
      console.error("Return save error:", err);
      alert(`Could not process return: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Save & Mark Completed";
    }
  });

  // Payment modal
  $("closeManagerPaymentModal")?.addEventListener("click", closePaymentModal);
  $("managerApprovePaymentBtn")?.addEventListener("click", handleApprovePayment);
  $("managerRejectPaymentBtn")?.addEventListener("click", handleRejectPayment);

  // KYC modal
  $("closeExecutiveDocModal")?.addEventListener("click", closeKycModal);
  $("execApproveDocBtn")?.addEventListener("click", handleApproveKyc);
  $("execRejectDocBtn")?.addEventListener("click", handleRejectKyc);

  document.querySelectorAll(".doc-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".doc-tab-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.classList.toggle("btn-dark", b === btn);
        b.classList.toggle("btn-outline", b !== btn);
      });
      activeKycDocTab = btn.dataset.doc;
      renderKycDocPreviews();
    });
  });

  // Booking detail modal
  $("closeExecutiveBookingDetailModal")?.addEventListener("click", () => {
    const m = $("executiveBookingDetailModal");
    if (m) {
      m.hidden = true;
      m.style.display = "none";
    }
  });
}

function openReturnModal(booking) {
  activeReturnBooking = booking;
  returnSelectedFiles = [];
  returnPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  returnPreviewUrls = [];

  const modal = $("returnModal");
  const title = $("returnModalTitle");
  const odo = $("returnOdometer");
  const fastag = $("returnFastag");
  const origDep = $("returnDepositOriginal");
  const deduct = $("returnDeductionsInput");
  const previewBox = $("returnInspectionPreview");
  const notes = $("returnInvoiceNotes");

  if (title) title.textContent = `Return — ${booking.vehicleName || "Vehicle"} (#${formatBookingNumber(booking)})`;
  if (odo) odo.value = booking.returnOdometer ?? booking.endOdometer ?? "";
  if (fastag) fastag.value = booking.returnFastag ?? booking.returnFastagBalance ?? "";
  if (origDep) origDep.textContent = formatMoney(booking.securityDeposit || 0);
  if (deduct) deduct.value = "0";
  if (previewBox) previewBox.innerHTML = "";
  if (notes) notes.value = "";

  updateReturnRefundDisplay();

  if (modal) {
    modal.hidden = false;
    modal.style.display = "flex";
  }
}

function updateReturnRefundDisplay() {
  const deposit = Number(activeReturnBooking?.securityDeposit || 0);
  const deductions = Number($("returnDeductionsInput")?.value || 0);
  const refund = Math.max(0, deposit - deductions);
  const refundEl = $("returnDepositRefund");
  if (refundEl) refundEl.textContent = formatMoney(refund);
}

function closeReturnModal() {
  const modal = $("returnModal");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
  returnPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  returnPreviewUrls = [];
  returnSelectedFiles = [];
  activeReturnBooking = null;
}

/* ==========================================================================
   TAB 2: PAYMENT VERIFICATION QUEUE
   ========================================================================== */

function renderPaymentsTable() {
  const wrap = $("execPaymentsWrap");
  if (!wrap) return;

  const totalItems = allPayments.length;
  if (!totalItems) {
    wrap.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--sub);">No payment receipts awaiting review.</div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / execPaymentsPerPage));
  execPaymentPage = Math.max(1, Math.min(execPaymentPage, totalPages));

  const startIndex = (execPaymentPage - 1) * execPaymentsPerPage;
  const paginatedPayments = allPayments.slice(startIndex, startIndex + execPaymentsPerPage);

  wrap.innerHTML = `
    <div style="overflow-x: auto;">
      <table class="admin-table" style="width: 100%; min-width: 840px; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--sub); font-size: 12.5px; text-transform: uppercase;">
            <th style="padding: 12px 10px;">Date</th>
            <th style="padding: 12px 10px;">Booking</th>
            <th style="padding: 12px 10px;">Customer</th>
            <th style="padding: 12px 10px;">Vehicle</th>
            <th style="padding: 12px 10px;">Amount</th>
            <th style="padding: 12px 10px;">Method / UTR</th>
            <th style="padding: 12px 10px;">Status</th>
            <th style="padding: 12px 10px; text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${paginatedPayments
            .map((p) => {
              const statusColor = p.status === "verified" ? "#06d6a0" : p.status === "rejected" ? "#ef476f" : "#ffd166";
              const paymentDate = formatReadableDate(p.createdAt || p.date);

              return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13.5px;">
                  <td style="padding: 12px 10px; color: var(--sub); white-space: nowrap;">${escapeHtml(paymentDate)}</td>
                  <td style="padding: 12px 10px; font-family: monospace; font-weight: 700; color: var(--accent);">#${escapeHtml(p.bookingNumber || p.bookingId)}</td>
                  <td style="padding: 12px 10px;">
                    <strong style="color: #fff;">${escapeHtml(p.userName || "Customer")}</strong><br/>
                    <small style="color: #4fd7ff; font-size: 12px;">${escapeHtml(p.userEmail || "")}</small>
                    ${p.userPhone ? `<br/><small style="color: var(--sub); font-size: 11.5px;">${escapeHtml(p.userPhone)}</small>` : ""}
                  </td>
                  <td style="padding: 12px 10px;">
                    <strong>${escapeHtml(p.vehicleName || "Vehicle")}</strong>
                    ${p.vehicleReg ? `<br/><small style="color: var(--sub); font-family: monospace;">${escapeHtml(p.vehicleReg)}</small>` : ""}
                  </td>
                  <td style="padding: 12px 10px; font-weight: 700; color: #fff;">${formatMoney(p.amount)}</td>
                  <td style="padding: 12px 10px; font-family: monospace;">
                    <span style="font-size: 11px; text-transform: uppercase; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px;">${escapeHtml(p.method || "UPI")}</span><br/>
                    ${escapeHtml(p.utr || p.paymentRef || "No UTR")}
                  </td>
                  <td style="padding: 12px 10px; font-weight: 700; color: ${statusColor};">${escapeHtml((p.status || "pending").toUpperCase())}</td>
                  <td style="padding: 12px 10px; text-align: right;">
                    <button type="button" class="btn btn-dark btn-sm btn-review-payment" data-id="${escapeHtml(p.id)}" style="padding: 5px 12px; font-size: 12.5px;">Review</button>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    ${renderPaginationHtml(execPaymentPage, totalPages, totalItems, "payments", execPaymentsPerPage, "payments")}
  `;

  wrap.querySelectorAll(".btn-review-payment").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = allPayments.find((item) => item.id === btn.dataset.id);
      if (p) openPaymentModal(p);
    });
  });

  wrap.querySelectorAll(".exec-page-size-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      execPaymentsPerPage = Number(sel.value) || 5;
      execPaymentPage = 1;
      renderPaymentsTable();
    });
  });

  wrap.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.page;
      if (target === "prev") {
        execPaymentPage = Math.max(1, execPaymentPage - 1);
      } else if (target === "next") {
        execPaymentPage = Math.min(totalPages, execPaymentPage + 1);
      } else {
        execPaymentPage = Number(target) || 1;
      }
      renderPaymentsTable();
      wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function openPaymentModal(payment) {
  activePaymentItem = payment;
  const modal = $("managerPaymentModal");
  const title = $("managerPaymentModalTitle");
  const body = $("managerPaymentModalBody");

  if (title) title.textContent = `Payment Verification — #${payment.bookingNumber || payment.bookingId}`;

  let screenshotImg = "";
  if (payment.screenshotUrl) {
    screenshotImg = `<img src="${escapeHtml(payment.screenshotUrl)}" alt="Payment Receipt" class="manager-modal-screenshot-img" />`;
  } else if (payment.screenshotMediaId) {
    screenshotImg = `<img src="/api/media/file.php?id=${encodeURIComponent(payment.screenshotMediaId)}" alt="Payment Receipt" class="manager-modal-screenshot-img" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\'padding:20px;text-align:center;color:var(--sub);\\'>No image file found on server.</div>';" />`;
  } else {
    screenshotImg = `<div style="padding: 20px; text-align: center; color: var(--sub); border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px;">No screenshot receipt attached.</div>`;
  }

  if (body) {
    body.innerHTML = `
      <div class="manager-modal-details-list">
        <div class="manager-modal-detail-row">
          <span class="manager-modal-detail-label">Customer</span>
          <div class="manager-modal-detail-val">
            <strong class="manager-modal-name">${escapeHtml(payment.userName || "Customer")}</strong>
            <span class="manager-modal-subval">${escapeHtml(payment.userPhone || payment.userEmail || "—")}</span>
          </div>
        </div>
        <div class="manager-modal-detail-row">
          <span class="manager-modal-detail-label">Vehicle</span>
          <div class="manager-modal-detail-val">
            <strong>${escapeHtml(payment.vehicleName || "Vehicle")}</strong>
          </div>
        </div>
        <div class="manager-modal-detail-row">
          <span class="manager-modal-detail-label">Amount</span>
          <div class="manager-modal-detail-val">
            <strong class="price-highlight">${formatMoney(payment.amount)}</strong>
          </div>
        </div>
        <div class="manager-modal-detail-row">
          <span class="manager-modal-detail-label">UTR / Ref</span>
          <div class="manager-modal-detail-val">
            <strong class="mono-highlight">${escapeHtml(payment.utr || payment.paymentRef || "Not provided")}</strong>
          </div>
        </div>
        <div class="manager-modal-screenshot-section">
          <span class="manager-modal-section-title">Payment Screenshot</span>
          ${screenshotImg}
        </div>
      </div>
    `;
  }

  if (modal) {
    modal.hidden = false;
    modal.style.display = "flex";
  }
}

function closePaymentModal() {
  const modal = $("managerPaymentModal");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
  activePaymentItem = null;
}

async function handleApprovePayment() {
  if (!activePaymentItem) return;
  const btn = $("managerApprovePaymentBtn");
  btn.disabled = true;
  btn.textContent = "Approving...";

  try {
    await api.post(`/payments/${encodeURIComponent(activePaymentItem.id || activePaymentItem.bookingId)}/verify`, {
      action: "approve",
      status: "verified"
    });
    alert("Payment verified and booking confirmed successfully!");
    closePaymentModal();
    await loadAllExecutiveData();
  } catch (err) {
    alert(`Failed to approve payment: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Approve & Confirm Booking";
  }
}

async function handleRejectPayment() {
  if (!activePaymentItem) return;
  const reason = prompt("Enter the reason for rejecting this payment receipt:");
  if (reason === null) return;

  const btn = $("managerRejectPaymentBtn");
  btn.disabled = true;

  try {
    await api.post(`/payments/${encodeURIComponent(activePaymentItem.id || activePaymentItem.bookingId)}/verify`, {
      action: "reject",
      status: "rejected",
      reason: reason || "Invalid or unverified transaction reference."
    });
    alert("Payment rejected.");
    closePaymentModal();
    await loadAllExecutiveData();
  } catch (err) {
    alert(`Failed to reject payment: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

/* ==========================================================================
   TAB 3: CUSTOMER KYC & ID VERIFICATION
   ========================================================================== */

function renderKycTable() {
  const wrap = $("execKycWrap");
  if (!wrap) return;

  const totalItems = allVerifications.length;
  if (!totalItems) {
    wrap.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--sub);">No customer KYC submissions found.</div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / execKycPerPage));
  execKycPage = Math.max(1, Math.min(execKycPage, totalPages));

  const startIndex = (execKycPage - 1) * execKycPerPage;
  const paginatedKyc = allVerifications.slice(startIndex, startIndex + execKycPerPage);

  wrap.innerHTML = `
    <div style="overflow-x: auto;">
      <table class="admin-table" style="width: 100%; min-width: 800px; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--sub); font-size: 12.5px; text-transform: uppercase;">
            <th style="padding: 12px 10px;">Customer</th>
            <th style="padding: 12px 10px;">Contact</th>
            <th style="padding: 12px 10px;">Driving License</th>
            <th style="padding: 12px 10px;">Aadhaar</th>
            <th style="padding: 12px 10px;">PAN</th>
            <th style="padding: 12px 10px;">Overall</th>
            <th style="padding: 12px 10px; text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${paginatedKyc
            .map((v) => {
              const pill = (st) => {
                const s = (st || "not_submitted").toLowerCase();
                const col = s === "verified" ? "#06d6a0" : s === "rejected" ? "#ef476f" : s === "pending" ? "#ffd166" : "var(--sub)";
                return `<span style="color:${col}; font-weight:700; font-size:12px;">${s.replace(/_/g, " ").toUpperCase()}</span>`;
              };

              return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13.5px;">
                  <td style="padding: 12px 10px;"><strong>${escapeHtml(v.fullName || "Customer")}</strong></td>
                  <td style="padding: 12px 10px; color: var(--sub);">
                    <small style="color: #4fd7ff; font-size: 12px;">${escapeHtml(v.email || "")}</small>
                    ${v.phone ? `<br/><small style="color: var(--sub);">${escapeHtml(v.phone)}</small>` : ""}
                  </td>
                  <td style="padding: 12px 10px;">${pill(v.licenseStatus)}</td>
                  <td style="padding: 12px 10px;">${pill(v.aadharStatus)}</td>
                  <td style="padding: 12px 10px;">${pill(v.panStatus)}</td>
                  <td style="padding: 12px 10px;">${pill(v.overallStatus)}</td>
                  <td style="padding: 12px 10px; text-align: right;">
                    <button type="button" class="btn btn-dark btn-sm btn-review-kyc" data-id="${escapeHtml(v.userId || v.firebaseUid)}" style="padding: 5px 12px; font-size: 12.5px;">Review ID</button>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    ${renderPaginationHtml(execKycPage, totalPages, totalItems, "customer IDs", execKycPerPage, "kyc")}
  `;

  wrap.querySelectorAll(".btn-review-kyc").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = allVerifications.find((item) => (item.userId || item.firebaseUid) === btn.dataset.id);
      if (v) openKycModal(v);
    });
  });

  wrap.querySelectorAll(".exec-page-size-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      execKycPerPage = Number(sel.value) || 5;
      execKycPage = 1;
      renderKycTable();
    });
  });

  wrap.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.page;
      if (target === "prev") {
        execKycPage = Math.max(1, execKycPage - 1);
      } else if (target === "next") {
        execKycPage = Math.min(totalPages, execKycPage + 1);
      } else {
        execKycPage = Number(target) || 1;
      }
      renderKycTable();
      wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function openKycModal(kycItem) {
  activeKycItem = kycItem;
  activeKycDocTab = "license";

  const modal = $("executiveDocModal");
  const title = $("executiveDocModalTitle");
  const subtitle = $("executiveDocModalSubtitle");

  if (title) title.textContent = `KYC Verification — ${kycItem.fullName || "Customer"}`;
  if (subtitle) subtitle.textContent = `Phone: ${kycItem.phone || "—"} · Email: ${kycItem.email || "—"}`;

  document.querySelectorAll(".doc-tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.doc === "license");
    b.classList.toggle("btn-dark", b.dataset.doc === "license");
    b.classList.toggle("btn-outline", b.dataset.doc !== "license");
  });

  renderKycDocPreviews();

  if (modal) {
    modal.hidden = false;
    modal.style.display = "flex";
  }
}

function renderKycDocPreviews() {
  if (!activeKycItem) return;

  const frontBox = $("execDocFrontPreview");
  const backBox = $("execDocBackPreview");

  let frontUrl = null;
  let backUrl = null;

  if (activeKycDocTab === "license") {
    frontUrl = activeKycItem.licenseFrontURL || (activeKycItem.licenseFrontMediaId ? `/api/media/file.php?id=${encodeURIComponent(activeKycItem.licenseFrontMediaId)}` : null);
    backUrl = activeKycItem.licenseBackURL || (activeKycItem.licenseBackMediaId ? `/api/media/file.php?id=${encodeURIComponent(activeKycItem.licenseBackMediaId)}` : null);
  } else if (activeKycDocTab === "aadhar") {
    frontUrl = activeKycItem.aadharFrontURL || (activeKycItem.aadharFrontMediaId ? `/api/media/file.php?id=${encodeURIComponent(activeKycItem.aadharFrontMediaId)}` : null);
    backUrl = activeKycItem.aadharBackURL || (activeKycItem.aadharBackMediaId ? `/api/media/file.php?id=${encodeURIComponent(activeKycItem.aadharBackMediaId)}` : null);
  } else if (activeKycDocTab === "pan") {
    frontUrl = activeKycItem.panFrontURL || (activeKycItem.panFrontMediaId ? `/api/media/file.php?id=${encodeURIComponent(activeKycItem.panFrontMediaId)}` : null);
    backUrl = activeKycItem.panBackURL || (activeKycItem.panBackMediaId ? `/api/media/file.php?id=${encodeURIComponent(activeKycItem.panBackMediaId)}` : null);
  }

  const docTypeName = activeKycDocTab === "license" ? "Driving License" : activeKycDocTab === "aadhar" ? "Aadhaar Card" : "PAN Card";
  const customerName = activeKycItem.fullName || "Customer";
  const customerPhone = activeKycItem.phone || "";

  if (frontBox) {
    if (frontUrl) {
      frontBox.innerHTML = `
        <div class="exec-doc-img-wrapper" role="button" tabindex="0" title="Click to enlarge Front Side">
          <img src="${escapeHtml(frontUrl)}" alt="${docTypeName} Front" class="enlargeable-kyc-img" onerror="this.onerror=null;this.parentElement.innerHTML='<span style=\\'color:var(--sub);font-size:13px;\\'>Document image not accessible</span>';" />
          <div class="exec-doc-zoom-overlay">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            <span>Click to Enlarge</span>
          </div>
        </div>
      `;
      const wrap = frontBox.querySelector(".exec-doc-img-wrapper");
      if (wrap) {
        wrap.addEventListener("click", () => {
          openImageLightbox(frontUrl, `${docTypeName} — Front Side`, `${customerName} ${customerPhone ? `· ${customerPhone}` : ""}`);
        });
        wrap.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openImageLightbox(frontUrl, `${docTypeName} — Front Side`, `${customerName} ${customerPhone ? `· ${customerPhone}` : ""}`);
          }
        });
      }
    } else {
      frontBox.innerHTML = `<span style="color:var(--sub);font-size:13px;">No front image submitted</span>`;
    }
  }

  if (backBox) {
    if (backUrl) {
      backBox.innerHTML = `
        <div class="exec-doc-img-wrapper" role="button" tabindex="0" title="Click to enlarge Back Side">
          <img src="${escapeHtml(backUrl)}" alt="${docTypeName} Back" class="enlargeable-kyc-img" onerror="this.onerror=null;this.parentElement.innerHTML='<span style=\\'color:var(--sub);font-size:13px;\\'>Document image not accessible</span>';" />
          <div class="exec-doc-zoom-overlay">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            <span>Click to Enlarge</span>
          </div>
        </div>
      `;
      const wrap = backBox.querySelector(".exec-doc-img-wrapper");
      if (wrap) {
        wrap.addEventListener("click", () => {
          openImageLightbox(backUrl, `${docTypeName} — Back Side`, `${customerName} ${customerPhone ? `· ${customerPhone}` : ""}`);
        });
        wrap.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openImageLightbox(backUrl, `${docTypeName} — Back Side`, `${customerName} ${customerPhone ? `· ${customerPhone}` : ""}`);
          }
        });
      }
    } else {
      backBox.innerHTML = `<span style="color:var(--sub);font-size:13px;">No back image submitted</span>`;
    }
  }
}

function closeKycModal() {
  const modal = $("executiveDocModal");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
  activeKycItem = null;
}

async function handleApproveKyc() {
  if (!activeKycItem) return;
  const uid = activeKycItem.userId || activeKycItem.firebaseUid;
  const btn = $("execApproveDocBtn");
  btn.disabled = true;

  try {
    await api.post(`/verification/user/${encodeURIComponent(uid)}/status`, {
      docType: activeKycDocTab,
      status: "verified"
    });
    alert(`${activeKycDocTab.toUpperCase()} verified successfully.`);
    closeKycModal();
    await loadAllExecutiveData();
  } catch (err) {
    alert(`Could not verify document: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function handleRejectKyc() {
  if (!activeKycItem) return;
  const reason = prompt("Enter the reason for rejecting this document:");
  if (reason === null) return;

  const uid = activeKycItem.userId || activeKycItem.firebaseUid;
  const btn = $("execRejectDocBtn");
  btn.disabled = true;

  try {
    await api.post(`/verification/user/${encodeURIComponent(uid)}/status`, {
      docType: activeKycDocTab,
      status: "rejected",
      reason: reason || "Document is blurry or invalid."
    });
    alert(`${activeKycDocTab.toUpperCase()} rejected.`);
    closeKycModal();
    await loadAllExecutiveData();
  } catch (err) {
    alert(`Could not reject document: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

/* ==========================================================================
   TAB 4: FLEET PREVIEW
   ========================================================================== */

function renderFleetGrid() {
  const grid = $("execFleetGrid");
  const countEl = $("execFleetCount");
  if (!grid) return;

  const totalItems = allFleet.length;
  if (countEl) countEl.textContent = `${totalItems} Vehicles`;

  if (!totalItems) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--sub);">No vehicles found in fleet inventory.</div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / execFleetPerPage));
  execFleetPage = Math.max(1, Math.min(execFleetPage, totalPages));

  const startIndex = (execFleetPage - 1) * execFleetPerPage;
  const paginatedFleet = allFleet.slice(startIndex, startIndex + execFleetPerPage);

  const cardsHtml = paginatedFleet
    .map((car) => {
      const isAvailable = car.available == 1 && car.status !== "maintenance" && car.status !== "removed";
      const statusBadge = isAvailable
        ? `<span style="background: rgba(6, 214, 160, 0.15); color: #06d6a0; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 6px;">Available</span>`
        : `<span style="background: rgba(239, 71, 111, 0.15); color: #ef476f; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 6px;">${escapeHtml(car.status || "Unavailable")}</span>`;

      const imgSrc = getCarImage(car);

      return `
        <div class="card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;">
          <div style="height: 140px; background: #000; overflow: hidden; position: relative; display: flex; align-items: center; justify-content: center;">
            <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(car.brand)} ${escapeHtml(car.model)}" style="width: 100%; height: 100%; object-fit: contain; padding: 6px;" onerror="this.onerror=null;this.src='assets/fleet/BMW.png';" />
            <div style="position: absolute; top: 10px; right: 10px;">${statusBadge}</div>
          </div>
          <div style="padding: 14px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <span style="font-size: 11.5px; text-transform: uppercase; color: var(--sub); letter-spacing: 0.05em;">${escapeHtml(car.category || "Sedan")}</span>
              <h3 style="font-size: 16px; margin: 2px 0 6px;">${escapeHtml(car.brand)} ${escapeHtml(car.model)}</h3>
              <p style="font-family: monospace; font-size: 12px; color: var(--accent); margin-bottom: 10px;">Reg: ${escapeHtml(car.regNo || car.reg_no || "—")}</p>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px; margin-top: 8px;">
              <span style="font-size: 12px; color: var(--sub);">${escapeHtml(car.fuel || "Petrol")} · ${escapeHtml(car.transmission || "Auto")}</span>
              <strong style="color: #fff; font-size: 15px;">₹${Math.round(car.priceDay || 0).toLocaleString("en-IN")}<small style="font-size: 11px; color: var(--sub);">/day</small></strong>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  grid.innerHTML = `
    <div style="grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;">
      ${cardsHtml}
    </div>
    <div style="grid-column: 1 / -1;">
      ${renderPaginationHtml(execFleetPage, totalPages, totalItems, "vehicles", execFleetPerPage, "fleet")}
    </div>
  `;

  grid.querySelectorAll(".exec-page-size-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      execFleetPerPage = Number(sel.value) || 6;
      execFleetPage = 1;
      renderFleetGrid();
    });
  });

  grid.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.page;
      if (target === "prev") {
        execFleetPage = Math.max(1, execFleetPage - 1);
      } else if (target === "next") {
        execFleetPage = Math.min(totalPages, execFleetPage + 1);
      } else {
        execFleetPage = Number(target) || 1;
      }
      renderFleetGrid();
      grid.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

/* ==========================================================================
   TAB 5: COUPON PREVIEW
   ========================================================================== */

function renderCouponsTable() {
  const wrap = $("execCouponsWrap");
  if (!wrap) return;

  const totalItems = allCoupons.length;
  if (!totalItems) {
    wrap.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--sub);">No promotional coupons active.</div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / execCouponsPerPage));
  execCouponsPage = Math.max(1, Math.min(execCouponsPage, totalPages));

  const startIndex = (execCouponsPage - 1) * execCouponsPerPage;
  const paginatedCoupons = allCoupons.slice(startIndex, startIndex + execCouponsPerPage);

  wrap.innerHTML = `
    <div style="overflow-x: auto;">
      <table class="admin-table" style="width: 100%; min-width: 700px; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--sub); font-size: 12.5px; text-transform: uppercase;">
            <th style="padding: 12px 10px;">Promo Code</th>
            <th style="padding: 12px 10px;">Discount</th>
            <th style="padding: 12px 10px;">Min. Booking</th>
            <th style="padding: 12px 10px;">Max. Cap</th>
            <th style="padding: 12px 10px;">Used Count</th>
            <th style="padding: 12px 10px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${paginatedCoupons
            .map((c) => {
              const discountText = c.type === "percent" || c.discountType === "percent" ? `${c.discountValue || c.val}% OFF` : `₹${c.discountValue || c.val} FLAT OFF`;
              const statusPill = c.active
                ? `<span style="color: #06d6a0; font-weight: 700;">ACTIVE</span>`
                : `<span style="color: #ef476f; font-weight: 700;">INACTIVE</span>`;

              return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13.5px;">
                  <td style="padding: 12px 10px; font-family: monospace; font-weight: 700; color: #4fd7ff; font-size: 15px;">${escapeHtml(c.code)}</td>
                  <td style="padding: 12px 10px; font-weight: 700; color: #ffd166;">${escapeHtml(discountText)}</td>
                  <td style="padding: 12px 10px;">${formatMoney(c.minOrder || 0)}</td>
                  <td style="padding: 12px 10px;">${c.maxDiscount ? formatMoney(c.maxDiscount) : "No limit"}</td>
                  <td style="padding: 12px 10px;">${c.usedCount || 0} times</td>
                  <td style="padding: 12px 10px;">${statusPill}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    ${renderPaginationHtml(execCouponsPage, totalPages, totalItems, "coupons", execCouponsPerPage, "coupons")}
  `;

  wrap.querySelectorAll(".exec-page-size-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      execCouponsPerPage = Number(sel.value) || 5;
      execCouponsPage = 1;
      renderCouponsTable();
    });
  });

  wrap.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.page;
      if (target === "prev") {
        execCouponsPage = Math.max(1, execCouponsPage - 1);
      } else if (target === "next") {
        execCouponsPage = Math.min(totalPages, execCouponsPage + 1);
      } else {
        execCouponsPage = Number(target) || 1;
      }
      renderCouponsTable();
      wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

/* ==========================================================================
   BOOKING DETAIL MODAL
   ========================================================================== */

function openBookingDetailModal(b) {
  const modal = $("executiveBookingDetailModal");
  const title = $("execBookingDetailTitle");
  const body = $("execBookingDetailBody");

  if (title) title.textContent = `Booking #${formatBookingNumber(b)} — ${b.vehicleName || "Vehicle"}`;

  if (body) {
    body.innerHTML = `
      <div style="display: grid; gap: 12px; font-size: 13.5px;">
        <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 12px;">
          <strong style="color: var(--accent); display: block; margin-bottom: 6px;">Customer Information</strong>
          <div><strong>Name:</strong> ${escapeHtml(b.userName || "Customer")}</div>
          <div><strong>Phone:</strong> <a href="tel:${escapeHtml(b.userPhone || '')}" style="color:#4fd7ff;">${escapeHtml(b.userPhone || "Not provided")}</a></div>
          <div><strong>Email:</strong> ${escapeHtml(b.userEmail || "Not provided")}</div>
        </div>

        <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 12px;">
          <strong style="color: var(--accent); display: block; margin-bottom: 6px;">Trip Schedule &amp; Location</strong>
          <div><strong>Vehicle:</strong> ${escapeHtml(b.vehicleName)} (${escapeHtml(b.vehicleReg || "—")})</div>
          <div><strong>Pickup Date:</strong> ${escapeHtml(formatReadableDate(b.pickupDate))}</div>
          <div><strong>Drop Date:</strong> ${escapeHtml(formatReadableDate(b.dropDate))}</div>
          <div><strong>Location:</strong> ${escapeHtml(b.location || "Ghansoli, Navi Mumbai")}</div>
        </div>

        <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 12px;">
          <strong style="color: var(--accent); display: block; margin-bottom: 6px;">Financial Breakdown</strong>
          <div><strong>Base Amount:</strong> ${formatMoney(b.baseAmount)}</div>
          <div><strong>Coupon Discount:</strong> ${b.couponDiscount ? `-₹${b.couponDiscount}` : "₹0"} (${escapeHtml(b.couponCode || "None")})</div>
          <div><strong>Security Deposit:</strong> ${formatMoney(b.securityDeposit)}</div>
          <div style="font-size: 15px; font-weight: 700; color: #06d6a0; margin-top: 4px;"><strong>Total Amount:</strong> ${formatMoney(b.finalAmount || b.totalAmount)}</div>
          <div><strong>Payment Status:</strong> <span style="font-weight:700; text-transform:uppercase;">${escapeHtml(b.paymentStatus || "pending")}</span></div>
          <div><strong>Payment Ref:</strong> <span style="font-family:monospace;">${escapeHtml(b.paymentRef || "—")}</span></div>
        </div>

        <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 12px;">
          <strong style="color: var(--accent); display: block; margin-bottom: 6px;">Operations &amp; Odometer Log</strong>
          <div><strong>Start Odometer:</strong> ${b.pickupOdometer ? `${b.pickupOdometer} km` : "Not recorded"}</div>
          <div><strong>Return Odometer:</strong> ${b.returnOdometer ? `${b.returnOdometer} km` : "Not returned yet"}</div>
          <div><strong>Start FASTag Balance:</strong> ${b.pickupFastagBalance ? `₹${b.pickupFastagBalance}` : "—"}</div>
          <div><strong>Return FASTag Balance:</strong> ${b.returnFastag ? `₹${b.returnFastag}` : "—"}</div>
          <div><strong>Handover Notes:</strong> ${escapeHtml(b.pickupNotes || "None")}</div>
        </div>
      </div>
    `;
  }

  if (modal) {
    modal.hidden = false;
    modal.style.display = "flex";
  }
}

// Start
initExecutive();
