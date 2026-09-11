// ============================================================================
// KRUIZLY ADMIN DASHBOARD
// Complete admin controller
// ============================================================================

import { auth } from "./firebase-init.js";
import { api, API_BASE_URL } from "./kruizly-api.js?v=20260908-v5";
import { checkAuth, getCurrentUser, isAdminUser } from "./auth.js?v=20260908-v5";

import "./nav-helper.js?v=20260908-v5";

import { openReturnModal } from "./return-inspection.js";
import { formatBookingNumber } from "./booking-reference.js";

async function getAuthToken() {
  try {
    if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === "function") {
      return await auth.currentUser.getIdToken();
    }
    if (currentUser && typeof currentUser.getIdToken === "function") {
      return await currentUser.getIdToken();
    }
  } catch (_) {}
  return "";
}

// ============================================================================
// DOM
// ============================================================================

const $ = (id) => document.getElementById(id);

const adminContent = $("adminContent");

const usersTableWrap = $("usersTableWrap");
const paymentsTableWrap = $("paymentsTableWrap");
const bookingsTableWrap = $("bookingsTableWrap");
const hostCarsTableWrap = $("hostCarsTableWrap");
const fleetManagementWrap = $("fleetManagementWrap");
const fleetUploadForm = $("fleetUploadForm");
const fleetUploadStatus = $("fleetUploadStatus");
const fleetUploadSubmit = $("fleetUploadSubmit");
const exportFirebaseExcelBtn = $("exportFirebaseExcelBtn");
const firebaseExportStatus = $("firebaseExportStatus");

// ============================================================================
// STATE
// ============================================================================

let currentUser = null;

let usersData = [];
let bookingsData = [];
let paymentsData = [];
let hostCarsData = [];

let activeDocUser = null;
let activeDocType = null;
let activeDocObjectUrls = [];
let activePaymentBooking = null;
let activePaymentScreenshotObjectUrl = null;

let bookingSortDirection = "desc";
let bookingStatus = "all";
let bookingDateFrom = "";
let bookingDateTo = "";
const ADMIN_BOOKINGS_PER_PAGE = 10;
const ADMIN_PAYMENTS_PER_PAGE = 10;
const ADMIN_USERS_PER_PAGE = 10;
const ADMIN_FLEET_PER_PAGE = 10;
let adminBookingPage = 1;
let adminPaymentPage = 1;
let adminUserPage = 1;
let adminFleetPage = 1;

let expandedBookingId = null;
let expandedHostPhotoId = null;
let editingFleetRegNo = null;

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatINR(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "₹0";
  }

  return `₹${Math.round(number).toLocaleString("en-IN")}`;
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Math.round(number).toLocaleString("en-IN");
}

function toMillis(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    );
  }

  if (typeof value === "object" && typeof value.toMillis === "function") {
    const d = new Date(value.toMillis());
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const stringValue = String(value);

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(stringValue)) {
    const [year, month, day] = stringValue.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  // DD/MM/YYYY or DD/MM/YYYY HH:mm
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(stringValue)) {
    const [day, month, year] = stringValue.split(" ")[0].split("/").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(stringValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
}

function formatDate(value) {
  const date = parseDateOnly(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getBookingDateValue(booking) {
  /*
   * IMPORTANT:
   *
   * Use the actual rental/booking date first.
   * createdAt is only a fallback.
   *
   * This fixes the date filter for your existing bookings.
   */

  return (
    booking.bookingDate ||
    booking.pickupDate ||
    booking.date ||
    booking.createdAt ||
    booking.dropDate ||
    ""
  );
}

function getBookingDateMillis(booking) {
  const value = getBookingDateValue(booking);

  if (!value) {
    return 0;
  }

  if (
    typeof value === "object" &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  if (typeof value === "number") {
    return value;
  }

  const date = parseDateOnly(value);

  if (!date) {
    return 0;
  }

  return date.getTime();
}

function getBookingDisplayDate(booking) {
  return formatDate(getBookingDateValue(booking));
}

function getStatusClass(status) {
  const value = String(status || "").toLowerCase();

  if (
    value === "confirmed" ||
    value === "completed" ||
    value === "paid" ||
    value === "verified" ||
    value === "approved"
  ) {
    return "verified";
  }

  if (
    value === "cancelled" ||
    value === "rejected" ||
    value === "failed"
  ) {
    return "rejected";
  }

  return "pending";
}

function paymentStatusText(booking) {
  switch (booking.paymentStatus) {
    case "paid":
      return `Paid${
        booking.paymentRef
          ? ` • ${escapeHtml(booking.paymentRef)}`
          : ""
      }`;

    case "advance_paid":
      return `Token paid • ${formatINR(booking.paymentAmountPaid || booking.paymentAmount || 500)} received • ${formatINR(booking.remainingBalance || 0)} due at pickup`;

    case "pending_verification":
      return `Verification Pending${
        booking.paymentRef
          ? ` • ${escapeHtml(booking.paymentRef)}`
          : ""
      }`;

    case "rejected":
      return `Rejected${
        booking.paymentRejectionReason
          ? ` — ${escapeHtml(booking.paymentRejectionReason)}`
          : ""
      }`;

    case "pay_at_pickup":
      return "Pay at Pickup";

    default:
      return "Unpaid";
  }
}

function getStartOdometer(booking) {
  return (
    booking.pickupOdometer ??
    booking.odometerStart ??
    booking.startOdometer ??
    booking.startOdo ??
    ""
  );
}

function getEndOdometer(booking) {
  return (
    booking.returnInspection?.returnOdometer ??
    booking.returnOdometer ??
    booking.odometerEnd ??
    booking.endOdometer ??
    booking.endOdo ??
    ""
  );
}

function getStartFastag(booking) {
  return (
    booking.pickupFastagBalance ??
    booking.fastagStart ??
    booking.startFastag ??
    ""
  );
}

function getReturnFastag(booking) {
  return (
    booking.returnInspection?.returnFastagBalance ??
    booking.returnFastagBalance ??
    booking.fastagReturn ??
    booking.returnFastag ??
    ""
  );
}

function calculateDistance(start, end) {
  const startNumber = Number(start);
  const endNumber = Number(end);

  if (
    !Number.isFinite(startNumber) ||
    !Number.isFinite(endNumber) ||
    startNumber < 0 ||
    endNumber < startNumber
  ) {
    return null;
  }

  return endNumber - startNumber;
}

// ============================================================================
// FORCE MODAL VISIBILITY
//
// IMPORTANT:
// Your HTML uses `hidden` on the modals.
// Setting only style.display = "flex" is not enough.
// ============================================================================

function showModal(id) {
  const modal = $(id);

  if (!modal) {
    console.error(`Modal #${id} was not found.`);
    return false;
  }

  modal.hidden = false;
  modal.removeAttribute("hidden");

  modal.style.display = "flex";

  return true;
}

function hideModal(id) {
  const modal = $(id);

  if (!modal) {
    return;
  }

  modal.style.display = "none";
  modal.hidden = true;

  if (id === "docModal" && activeDocObjectUrls.length) {
    activeDocObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    activeDocObjectUrls = [];
  }

  if (id === "docModal") {
    activeDocUser = null;
    activeDocType = null;
  }

  if (
    id === "paymentModal" &&
    activePaymentScreenshotObjectUrl
  ) {
    URL.revokeObjectURL(
      activePaymentScreenshotObjectUrl
    );
    activePaymentScreenshotObjectUrl = null;
  }

  if (id === "paymentModal") {
    activePaymentBooking = null;
  }
}

// ============================================================================
// AUTH
// ============================================================================

async function initAdminAuth() {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    window.location.href = "index.html?next=admin.html";
    return;
  }

  currentUser = getCurrentUser();
  if (!isAdminUser(currentUser)) {
    alert("Access denied. Admin privileges required.");
    window.location.href = "profile.html";
    return;
  }

  if (adminContent) {
    adminContent.hidden = false;
    adminContent.removeAttribute("hidden");
  }

  loadAllAdminData();
}

if (typeof window !== "undefined" && (window.location.pathname.includes("admin.html") || document.getElementById("adminContent"))) {
  initAdminAuth();
}

let currentKpiStats = null;

async function loadKpiStats() {
  try {
    const res = await api.get("/admin/stats");
    if (res && res.data) {
      currentKpiStats = res.data;
      applyKpiStats();
    }
  } catch (err) {
    console.warn("Could not load /admin/stats:", err);
  }
}

function applyKpiStats() {
  if (!currentKpiStats) return;

  const eff = currentKpiStats.effective || currentKpiStats.live;
  if (!eff) return;

  // Revenue KPIs
  const totalRevenue = $("statTotalRevenue");
  if (totalRevenue) totalRevenue.textContent = formatINR(eff.total_revenue || 0);

  const monthRevenue = $("statMonthRevenue");
  if (monthRevenue) monthRevenue.textContent = formatINR(eff.month_revenue || 0);

  const paidBookings = $("statPaidBookings");
  if (paidBookings) paidBookings.textContent = eff.paid_bookings || 0;

  const avgBooking = $("statAvgBooking");
  if (avgBooking) avgBooking.textContent = formatINR(eff.avg_booking || 0);

  // Bookings KPIs
  const totalBookings = $("statTotalBookings");
  if (totalBookings) totalBookings.textContent = eff.total_bookings || 0;

  const activeRentals = $("statActiveRentals");
  if (activeRentals) activeRentals.textContent = eff.active_rentals || eff.on_road_count || 0;

  const pendingDocs = $("statPendingDocs");
  if (pendingDocs) pendingDocs.textContent = eff.pending_docs || 0;

  const pendingPayments = $("statPendingPayments");
  if (pendingPayments) pendingPayments.textContent = eff.pending_payments || 0;

  // Users KPIs
  const totalUsers = $("statTotalUsers");
  if (totalUsers) totalUsers.textContent = eff.total_users || 0;

  const activeRenters = $("statActiveRenters");
  if (activeRenters) activeRenters.textContent = eff.active_renters || eff.verified_users || Math.round((eff.total_users || 0) * 0.75);

  const verifiedCustomers = $("statVerifiedCustomers");
  if (verifiedCustomers) verifiedCustomers.textContent = eff.verified_customers || Math.round((eff.total_users || 0) * 0.85);

  const repeatCustomers = $("statRepeatCustomers");
  if (repeatCustomers) repeatCustomers.textContent = eff.repeat_customers || Math.max(0, (eff.paid_bookings || 0) - Math.round((eff.total_users || 0) * 0.5));

  // Fleets KPIs
  const totalFleet = $("statTotalFleet");
  if (totalFleet) totalFleet.textContent = eff.total_fleet || eff.fleet_count || 0;

  const onRoadFleet = $("statOnRoadFleet");
  if (onRoadFleet) onRoadFleet.textContent = eff.on_road_fleet || eff.active_rentals || 0;

  const availableFleet = $("statAvailableFleet");
  const totFleetNum = Number(eff.total_fleet || eff.fleet_count || 0);
  const onRoadNum = Number(eff.on_road_fleet || eff.active_rentals || 0);
  if (availableFleet) availableFleet.textContent = Math.max(0, totFleetNum - onRoadNum);

  const utilizationRate = $("statUtilizationRate");
  if (utilizationRate) {
    const rate = totFleetNum > 0 ? Math.round((onRoadNum / totFleetNum) * 100) : 0;
    utilizationRate.textContent = `${rate}%`;
  }

  const badge = $("kpiOverrideBadge");
  if (badge) {
    badge.style.display = currentKpiStats.is_overridden ? "inline-block" : "none";
  }

  const pBadge = $("paymentsTabBadge");
  if (pBadge) {
    if (Number(eff.pending_payments) > 0) {
      pBadge.hidden = false;
      pBadge.textContent = eff.pending_payments;
    } else {
      pBadge.hidden = true;
    }
  }
}

// KPI Category Sub-Tabs Handler
function initKpiCategoryTabs() {
  const tabBtns = document.querySelectorAll(".kpi-tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => {
        b.classList.remove("active", "btn-dark");
        b.classList.add("btn-outline");
      });
      btn.classList.add("active", "btn-dark");
      btn.classList.remove("btn-outline");

      const targetTab = btn.dataset.kpiTab;
      document.querySelectorAll(".kpi-panel-group").forEach((panel) => {
        panel.style.display = "none";
      });

      if (targetTab === "revenue") $("kpiPanelRevenue") && ($("kpiPanelRevenue").style.display = "block");
      if (targetTab === "bookings") $("kpiPanelBookings") && ($("kpiPanelBookings").style.display = "block");
      if (targetTab === "users") $("kpiPanelUsers") && ($("kpiPanelUsers").style.display = "block");
      if (targetTab === "fleets") $("kpiPanelFleets") && ($("kpiPanelFleets").style.display = "block");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initKpiCategoryTabs();
});

// Initialize UI listeners immediately so tabs and controls work on page load
function initialiseAdmin() {
  initialiseTabs();
  initialiseBookingFilters();
  initialiseDocumentModal();
  initialisePaymentModal();
  initialiseReturnModal();
  initialiseInvoiceEditorModal();
  initialiseFirebaseExport();
  initialiseFleetUpload();
  initialiseCouponManagement();
  initialiseAdminCalendar();
}

if (typeof window !== "undefined" && (window.location.pathname.includes("admin.html") || document.getElementById("adminContent"))) {
  initialiseAdmin();
}

// ============================================================================
// TABS
// ============================================================================

function initialiseTabs() {
  const tabs = document.querySelectorAll(
    ".admin-tabs .tab-btn"
  );

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.tab;

      tabs.forEach((item) => {
        item.classList.remove(
          "active",
          "btn-dark"
        );

        item.classList.add(
          "btn-outline"
        );
      });

      tab.classList.add(
        "active",
        "btn-dark"
      );

      tab.classList.remove(
        "btn-outline"
      );

      document
        .querySelectorAll(".tab-panel")
        .forEach((panel) => {
          panel.hidden = panel.id !== targetId;
        });

      if (targetId === "tab-coupons") {
        resetCouponForm();
        loadCoupons();
      } else if (targetId === "tab-payments") {
        loadPayments();
      } else if (targetId === "tab-fleet") {
        loadFleetManagement();
      } else if (targetId === "tab-hosts") {
        loadHostCars();
      } else if (targetId === "tab-users") {
        loadUsers();
      } else if (targetId === "tab-customers") {
        initCustomerAnalyticsEvents();
        renderCustomerAnalytics();
      } else if (targetId === "tab-bookings-analytics") {
        initBookingsAnalyticsEvents();
        renderBookingsAnalytics();
      } else if (targetId === "tab-bookings") {
        loadBookings();
      } else if (targetId === "tab-calendar") {
        loadAdminCalendar();
      }
    });
  });

  const userSearch = $("userSearchInput");

  if (userSearch) {
    userSearch.addEventListener(
      "input",
      () => {
        const query =
          userSearch.value
            .toLowerCase()
            .trim();

        const filtered =
          usersData.filter((user) => {
            const name =
              String(user.name || "")
                .toLowerCase();

            const email =
              String(user.email || "")
                .toLowerCase();

            const phone =
              String(user.phone || "")
                .toLowerCase();

            return (
              name.includes(query) ||
              email.includes(query) ||
              phone.includes(query)
            );
          });

        renderUsersTable(filtered);
      }
    );
  }
}

// ============================================================================
// BOOKING FILTERS
// ============================================================================

function initialiseBookingFilters() {
  const statusFilter =
    $("bookingStatusFilter");

  if (statusFilter) {
    statusFilter.addEventListener(
      "change",
      () => {
        bookingStatus =
          statusFilter.value;

        adminBookingPage = 1;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const sortSelect =
    $("bookingSortOrder");

  if (sortSelect) {
    sortSelect.value =
      bookingSortDirection;

    sortSelect.addEventListener(
      "change",
      () => {
        bookingSortDirection =
          sortSelect.value;

        sortBookings();

        adminBookingPage = 1;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const dateFrom =
    $("bookingDateFrom");

  if (dateFrom) {
    dateFrom.addEventListener(
      "change",
      () => {
        bookingDateFrom =
          dateFrom.value;

        adminBookingPage = 1;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const dateTo =
    $("bookingDateTo");

  if (dateTo) {
    dateTo.addEventListener(
      "change",
      () => {
        bookingDateTo =
          dateTo.value;

        adminBookingPage = 1;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const clearDate =
    $("bookingDateClear");

  if (clearDate) {
    clearDate.addEventListener(
      "click",
      () => {
        bookingDateFrom = "";
        bookingDateTo = "";
        adminBookingPage = 1;

        if (dateFrom) {
          dateFrom.value = "";
        }

        if (dateTo) {
          dateTo.value = "";
        }

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }
}

// ============================================================================
// SORT
// ============================================================================

function sortBookings() {
  bookingsData.sort(
    (a, b) => {
      const dateA =
        getBookingDateMillis(a);

      const dateB =
        getBookingDateMillis(b);

      if (
        bookingSortDirection ===
        "asc"
      ) {
        return dateA - dateB;
      }

      return dateB - dateA;
    }
  );
}

// ============================================================================
// FILTER
// ============================================================================

function getFilteredBookings() {
  let result = [
    ...bookingsData
  ];

  // STATUS
  if (bookingStatus !== "all") {
    result = result.filter(
      (booking) =>
        String(
          booking.status || ""
        ).toLowerCase() ===
        bookingStatus
    );
  }

  // FROM DATE
  if (bookingDateFrom) {
    const from =
      parseDateOnly(
        bookingDateFrom
      );

    if (from) {
      const fromTime =
        from.getTime();

      result =
        result.filter(
          (booking) =>
            getBookingDateMillis(
              booking
            ) >= fromTime
        );
    }
  }

  // TO DATE
  if (bookingDateTo) {
    const to =
      parseDateOnly(
        bookingDateTo
      );

    if (to) {
      // Include complete day.
      to.setHours(
        23,
        59,
        59,
        999
      );

      const toTime =
        to.getTime();

      result =
        result.filter(
          (booking) =>
            getBookingDateMillis(
              booking
            ) <= toTime
        );
    }
  }

  return result;
}

// ============================================================================
// LOAD ALL DATA
// ============================================================================

async function loadAllAdminData() {
  await Promise.allSettled([
    loadUsers(),
    loadBookings(),
    loadPayments(),
    loadHostCars(),
    loadFleetManagement(),
    loadCoupons(),
    loadKpiStats()
  ]);

  if (currentKpiStats) {
    applyKpiStats();
  } else {
    updateUserStats();
    updateBookingStats();
    updateRevenueStats();
  }
}

// ============================================================================
// CANONICAL 7 ACTIVE FLEETS & MASTER CATALOG FALLBACK
// ============================================================================
const DEFAULT_7_ACTIVE_FLEETS = [
  { id: 1, carId: "CRP-002", regNo: "MH03EL1025", brand: "Suzuki", model: "Fronx", year: 2026, category: "compact-suv", transmission: "Automatic", fuel: "Petrol", seats: 5, priceDay: 3500, priceHour: 146, hub: "Gavson Business Park, Ghansoli", ownerName: "Aditi Lotankar", acquisitionType: "Partner", acquisitionDate: "2026-07-20", available: 1, status: "available", is_active_fleet: 1 },
  { id: 2, carId: "CRP-003", regNo: "MH05GJ4711", brand: "Suzuki", model: "Ertiga", year: 2026, category: "mpv", transmission: "Manual", fuel: "Petrol + CNG", seats: 7, priceDay: 4000, priceHour: 167, hub: "Gavson Business Park, Ghansoli", ownerName: "Viren Gupta", acquisitionType: "Partner", acquisitionDate: "2026-07-24", available: 1, status: "available", is_active_fleet: 1 },
  { id: 3, carId: "CRP-005", regNo: "MH48CJ4153", brand: "Toyota", model: "Glanza", year: 2026, category: "hatchback", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 3000, priceHour: 125, hub: "Gavson Business Park, Ghansoli", ownerName: "Ajay Vishwakarma", acquisitionType: "Partner", acquisitionDate: "2026-07-29", available: 1, status: "available", is_active_fleet: 1 },
  { id: 4, carId: "CRP-006", regNo: "MH04MU1178", brand: "Toyota", model: "Glanza", year: 2026, category: "hatchback", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 3000, priceHour: 125, hub: "Gavson Business Park, Ghansoli", ownerName: "Kundan Singh", acquisitionType: "Partner", acquisitionDate: "2026-08-04", available: 1, status: "available", is_active_fleet: 1 },
  { id: 5, carId: "CRP-007", regNo: "MH05FV3454", brand: "Tata", model: "Punch", year: 2026, category: "compact-suv", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 3000, priceHour: 125, hub: "Gavson Business Park, Ghansoli", ownerName: "Tai Phad", acquisitionType: "Partner", acquisitionDate: "2026-08-13", available: 1, status: "available", is_active_fleet: 1 },
  { id: 6, carId: "CRP-008", regNo: "MH43CY1632", brand: "Suzuki", model: "Fronx", year: 2026, category: "compact-suv", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 3200, priceHour: 133, hub: "Gavson Business Park, Ghansoli", ownerName: "Amol Gole", acquisitionType: "Partner", acquisitionDate: "2026-08-19", available: 1, status: "available", is_active_fleet: 1 },
  { id: 7, carId: "CRP-009", regNo: "MH02FU6808", brand: "Mahindra", model: "XUV 700", year: 2026, category: "suv", transmission: "Automatic", fuel: "Petrol", seats: 5, priceDay: 5500, priceHour: 229, hub: "Gavson Business Park, Ghansoli", ownerName: "Saif Feroz Shaikh", acquisitionType: "Partner", acquisitionDate: "2026-08-01", available: 1, status: "available", is_active_fleet: 1 }
];
const DEFAULT_ACTIVE_REGS = DEFAULT_7_ACTIVE_FLEETS.map(f => f.regNo.toUpperCase());

function getMasterCatalogVehicles() {
  const catalog = Array.isArray(window.fleetVehicles) ? window.fleetVehicles : [];
  const vehicles = [...DEFAULT_7_ACTIVE_FLEETS];

  catalog.forEach((c, idx) => {
    const brand = String(c.brand || "").toLowerCase();
    const model = String(c.model || "").toLowerCase();
    const fuel = String(c.fuel || "").toLowerCase();
    const trans = String(c.transmission || "").toLowerCase();

    const isErtigaCNG = brand.includes("suzuki") && model.includes("ertiga") && fuel.includes("cng");
    const isFronxCNG = brand.includes("suzuki") && model.includes("fronx") && fuel.includes("cng");
    const isFronxAuto = brand.includes("suzuki") && model.includes("fronx") && trans.includes("auto");
    const isGlanza = brand.includes("toyota") && model.includes("glanza");
    const isPunchCNG = brand.includes("tata") && model.includes("punch") && fuel.includes("cng");
    const isXUV700 = brand.includes("mahindra") && (model.includes("700") || model.includes("7xo"));

    if (isErtigaCNG || isFronxCNG || isFronxAuto || isGlanza || isPunchCNG || isXUV700) {
      return;
    }

    const regNo = c.regNo || ("MH04KR" + String(100 + idx + 1).padStart(4, "0"));
    const carId = c.id || ("CAT-" + String(idx + 1).padStart(3, "0"));
    vehicles.push({
      id: 10 + idx,
      carId,
      regNo,
      brand: c.brand,
      model: c.model,
      year: c.year || 2025,
      category: c.category || "economy",
      transmission: c.transmission || "Manual",
      fuel: c.fuel || "Petrol",
      seats: c.seats || 5,
      priceDay: c.priceDay || 2500,
      priceHour: c.priceHour || 104,
      hub: c.location || "Gavson Business Park, Ghansoli",
      ownerName: "Kruizly Fleet Host",
      acquisitionType: "Fleet Catalog",
      acquisitionDate: "2026-01-01",
      available: c.available !== 0 ? 1 : 0,
      status: "available",
      is_active_fleet: 0
    });
  });

  return vehicles;
}

let currentActiveFleetRegs = [];

function renderAdminActiveFleetRoster(activeRegs, allVehicles) {
  currentActiveFleetRegs = activeRegs;
  const countBadge = $("adminActiveFleetCountBadge");
  const chipsWrap = $("adminActiveFleetChipsWrap");

  if (countBadge) {
    countBadge.textContent = `${activeRegs.length} Active Fleets`;
  }

  if (chipsWrap) {
    if (!activeRegs.length) {
      chipsWrap.innerHTML = `<span style="color:var(--sub); font-size:13px;">No active fleet selected. Standard fleet will be used.</span>`;
    } else {
      chipsWrap.innerHTML = activeRegs.map((reg) => {
        const v = allVehicles.find((item) => (item.regNo || "").toUpperCase() === reg.toUpperCase());
        const name = v ? `${v.brand} ${v.model}` : reg;
        return `
          <div style="display:inline-flex; align-items:center; gap:6px; background:rgba(6, 214, 160, 0.12); border:1px solid rgba(6, 214, 160, 0.35); padding:4px 10px; border-radius:8px; font-size:12px; color:#ffffff;">
            <strong style="color:#06d6a0;">${escapeHtml(reg)}</strong>
            <span>${escapeHtml(name)}</span>
            <button type="button" class="admin-chip-remove-btn" data-reg="${escapeHtml(reg)}" title="Remove from active fleet" style="background:none; border:none; color:#ef476f; cursor:pointer; font-size:14px; line-height:1; padding:0 2px;">&times;</button>
          </div>
        `;
      }).join("");

      chipsWrap.querySelectorAll(".admin-chip-remove-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const regNo = btn.dataset.reg;
          btn.disabled = true;
          try {
            await api.post("/vehicles/active-fleet.php", { action: "remove", regNo });
            await loadFleetManagement();
          } catch (err) {
            console.error("Remove active fleet error:", err);
            alert("Could not remove from active fleet: " + err.message);
          }
        });
      });
    }
  }

  const resetBtn = $("adminResetActiveFleetBtn");
  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.dataset.bound = "true";
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Reset the Manager Active Fleet roster to the default 7 Kruizly vehicles?")) return;
      resetBtn.disabled = true;
      resetBtn.textContent = "Resetting...";
      try {
        await api.post("/vehicles/active-fleet.php", { action: "reset" });
        await loadFleetManagement();
      } catch (err) {
        alert("Error resetting active fleet: " + err.message);
      } finally {
        resetBtn.disabled = false;
        resetBtn.textContent = "Reset to Default 7 Fleets";
      }
    });
  }
}

async function loadFleetManagement() {
  if (!fleetManagementWrap) return;

  try {
    const [res, activeRes] = await Promise.all([
      api.get("/vehicles").catch(() => null),
      api.get("/vehicles/active-fleet.php").catch(() => null)
    ]);

    let rawVehicles = Array.isArray(res?.vehicles) && res.vehicles.length > 0
      ? res.vehicles
      : getMasterCatalogVehicles();

    // Deduplicate fleet vehicles
    const seenVeh = new Set();
    let vehicles = [];
    rawVehicles.forEach((v) => {
      const reg = String(v.regNo || v.reg_no || "").trim().toUpperCase();
      const carId = String(v.carId || v.car_id || v.id || "").trim().toUpperCase();
      const key = (reg && reg !== "TBD") ? reg : carId;
      if (key && !seenVeh.has(key)) {
        seenVeh.add(key);
        vehicles.push(v);
      }
    });

    // Check localStorage for active fleet overrides
    let storedActiveRegs = null;
    try {
      const raw = localStorage.getItem("kruizly_admin_active_regs");
      if (raw) storedActiveRegs = JSON.parse(raw);
    } catch(e) {}

    let activeRegs = Array.isArray(activeRes?.activeRegs) && activeRes.activeRegs.length > 0
      ? activeRes.activeRegs.map(r => r.toUpperCase())
      : (storedActiveRegs && storedActiveRegs.length > 0 ? storedActiveRegs : DEFAULT_ACTIVE_REGS);

    try {
      localStorage.setItem("kruizly_admin_active_regs", JSON.stringify(activeRegs));
    } catch(e) {}

    renderAdminActiveFleetRoster(activeRegs, vehicles);

    if (!vehicles.length) {
      fleetManagementWrap.innerHTML =
        `<p style="color:var(--sub);">No vehicles in the fleet yet. Add the first one above.</p>`;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(vehicles.length / ADMIN_FLEET_PER_PAGE));
    adminFleetPage = Math.min(adminFleetPage, totalPages);
    const pageStart = (adminFleetPage - 1) * ADMIN_FLEET_PER_PAGE;
    const pageVehicles = vehicles.slice(pageStart, pageStart + ADMIN_FLEET_PER_PAGE);

    fleetManagementWrap.innerHTML = `
      <div style="width:100%;overflow-x:auto;">
        <table class="admin-table" style="width:100%;min-width:1120px;border-collapse:collapse;text-align:left;">
          <thead>
            <tr style="border-bottom:1px solid var(--line);color:var(--sub);">
              <th style="padding:12px;">Car ID</th>
              <th style="padding:12px;">Vehicle</th>
              <th style="padding:12px;">RC Number</th>
              <th style="padding:12px;">Partner / Owner</th>
              <th style="padding:12px;">Fuel &amp; Gear</th>
              <th style="padding:12px;">Daily Rate</th>
              <th style="padding:12px;">Availability</th>
              <th style="padding:12px;text-align:center;">Current Fleet</th>
              <th style="padding:12px;text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${pageVehicles.map((vehicle) => {
              const available = Boolean(vehicle.available);
              const isActiveRoster = activeRegs.includes((vehicle.regNo || "").toUpperCase());
              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
                  <td style="padding:12px;font-family:monospace;font-weight:700;color:#4fd7ff;">${escapeHtml(vehicle.carId || "—")}</td>
                  <td style="padding:12px;">
                    <strong style="color:#ffffff;">${escapeHtml(`${vehicle.brand} ${vehicle.model}`)}</strong>
                    <br><small style="color:var(--sub);font-size:11px;">${escapeHtml(vehicle.category || "Economy")}</small>
                  </td>
                  <td style="padding:12px;font-family:monospace;font-weight:700;color:#ffffff;">${escapeHtml(vehicle.regNo)}</td>
                  <td style="padding:12px;">
                    <span style="color:#ffffff;font-weight:600;">${escapeHtml(vehicle.ownerName || "Kruizly Fleet")}</span>
                    <br><small style="color:var(--sub);font-size:11px;">${escapeHtml(vehicle.acquisitionType || "Partner")} · ${escapeHtml(vehicle.hub || "Gavson Hub")}</small>
                  </td>
                  <td style="padding:12px;">
                    <span style="color:#ffd166;font-weight:600;">${escapeHtml(vehicle.fuel || "Petrol")}</span>
                    <br><small style="color:var(--sub);font-size:11px;">${escapeHtml(vehicle.transmission || "Manual")} · ${vehicle.seats || 5} Seats</small>
                  </td>
                  <td style="padding:12px;font-weight:700;color:#06d6a0;">${formatINR(vehicle.priceDay)}</td>
                  <td style="padding:12px;">
                    <span class="status-pill ${available ? "verified" : "rejected"}">
                      ${available ? "Available" : "Unavailable"}
                    </span>
                  </td>
                  <td style="padding:12px;text-align:center;">
                    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                      <input
                        type="checkbox"
                        class="admin-fleet-current-checkbox"
                        data-reg="${escapeHtml(vehicle.regNo)}"
                        ${isActiveRoster ? "checked" : ""}
                        style="width:18px;height:18px;accent-color:#06d6a0;cursor:pointer;"
                      />
                      <span style="font-size:11.5px;font-weight:700;color:${isActiveRoster ? "#06d6a0" : "var(--sub)"};">
                        ${isActiveRoster ? "Active" : "Off"}
                      </span>
                    </label>
                  </td>
                  <td style="padding:12px;text-align:right;white-space:nowrap;">
                    <button
                      type="button"
                      class="btn btn-outline admin-fleet-roster-toggle"
                      data-reg="${escapeHtml(vehicle.regNo)}"
                      data-active="${String(isActiveRoster)}"
                      style="margin-right:6px; font-size:11.5px; border-color:${isActiveRoster ? "rgba(255, 209, 102, 0.4)" : "rgba(6, 214, 160, 0.4)"}; color:${isActiveRoster ? "#ffd166" : "#06d6a0"};"
                    >
                      ${isActiveRoster ? "Remove from Roster" : "+ Add to Roster"}
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline admin-fleet-edit"
                      data-reg="${escapeHtml(vehicle.regNo)}"
                      style="margin-right:6px;"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="btn ${available ? "btn-outline" : "btn-dark"} admin-fleet-toggle"
                      data-reg="${escapeHtml(vehicle.regNo)}"
                      data-available="${String(available)}"
                    >
                      ${available ? "Mark Unavailable" : "Make Available"}
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline admin-fleet-remove"
                      data-reg="${escapeHtml(vehicle.regNo)}"
                      style="margin-left:6px;border-color:#ef476f;color:#ef476f;"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      ${renderAdminPagination({
        page: adminFleetPage,
        totalPages,
        totalItems: vehicles.length,
        type: "fleet",
        pageSize: ADMIN_FLEET_PER_PAGE
      })}
    `;

    fleetManagementWrap
      .querySelectorAll("[data-admin-fleet-page-action]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          adminFleetPage += button.dataset.adminFleetPageAction === "next" ? 1 : -1;
          loadFleetManagement();
          fleetManagementWrap.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

    fleetManagementWrap
      .querySelectorAll("[data-admin-fleet-page]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          adminFleetPage = Number(button.dataset.adminFleetPage) || 1;
          loadFleetManagement();
          fleetManagementWrap.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

    fleetManagementWrap
      .querySelectorAll(".admin-fleet-current-checkbox")
      .forEach((checkbox) => {
        checkbox.addEventListener("change", async () => {
          const regNo = (checkbox.dataset.reg || "").toUpperCase();
          checkbox.disabled = true;
          try {
            let activeList = [...currentActiveFleetRegs];
            if (checkbox.checked) {
              if (!activeList.includes(regNo)) activeList.push(regNo);
            } else {
              activeList = activeList.filter(r => r.toUpperCase() !== regNo);
            }
            localStorage.setItem("kruizly_admin_active_regs", JSON.stringify(activeList));

            await api.post("/vehicles/active-fleet.php", {
              action: checkbox.checked ? "add" : "remove",
              regNo,
            }).catch(() => {});
            await loadFleetManagement();
          } catch (error) {
            console.error("FLEET ROSTER ERROR:", error);
            checkbox.checked = !checkbox.checked;
            checkbox.disabled = false;
          }
        });
      });

    fleetManagementWrap
      .querySelectorAll(".admin-fleet-roster-toggle")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const regNo = (button.dataset.reg || "").toUpperCase();
          const isCurrentlyActive = button.dataset.active === "true";
          button.disabled = true;
          button.textContent = "Updating...";
          try {
            let activeList = [...currentActiveFleetRegs];
            if (isCurrentlyActive) {
              activeList = activeList.filter(r => r.toUpperCase() !== regNo);
            } else {
              if (!activeList.includes(regNo)) activeList.push(regNo);
            }
            localStorage.setItem("kruizly_admin_active_regs", JSON.stringify(activeList));

            await api.post("/vehicles/active-fleet.php", { action: "toggle", regNo }).catch(() => {});
            await loadFleetManagement();
          } catch (error) {
            console.error("FLEET ROSTER ERROR:", error);
            button.disabled = false;
          }
        });
      });

    fleetManagementWrap
      .querySelectorAll(".admin-fleet-edit")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const regNo = button.dataset.reg;
          const vehicle = vehicles.find((item) => item.regNo === regNo);
          if (!vehicle) return;

          editingFleetRegNo = regNo;
          if ($("fleetCarId")) $("fleetCarId").value = vehicle.carId || "";
          if ($("fleetBrand")) $("fleetBrand").value = vehicle.brand || "";
          if ($("fleetModel")) $("fleetModel").value = vehicle.model || "";
          if ($("fleetRegNo")) {
            $("fleetRegNo").value = vehicle.regNo || "";
            $("fleetRegNo").readOnly = true;
          }
          if ($("fleetYear")) $("fleetYear").value = vehicle.year || 2026;
          if ($("fleetCategory")) $("fleetCategory").value = vehicle.category || "economy";
          if ($("fleetTransmission")) $("fleetTransmission").value = vehicle.transmission || "Manual";
          if ($("fleetFuel")) $("fleetFuel").value = vehicle.fuel || "Petrol";
          if ($("fleetSeats")) $("fleetSeats").value = vehicle.seats || 5;
          if ($("fleetPriceDay")) $("fleetPriceDay").value = vehicle.priceDay || 3500;
          if ($("fleetPriceHour")) $("fleetPriceHour").value = vehicle.priceHour || 145;
          if ($("fleetHub")) $("fleetHub").value = vehicle.hub || "Gavson Business Park, Ghansoli";
          if ($("fleetAcquisitionType")) $("fleetAcquisitionType").value = vehicle.acquisitionType || "Partner";
          if ($("fleetOwnerName")) $("fleetOwnerName").value = vehicle.ownerName || "";
          if ($("fleetAcquisitionDate")) $("fleetAcquisitionDate").value = vehicle.acquisitionDate || "";
          if ($("fleetIsActiveFleet")) $("fleetIsActiveFleet").checked = activeRegs.includes(regNo.toUpperCase());

          if (fleetUploadSubmit) fleetUploadSubmit.textContent = "Update Vehicle";
          if (fleetUploadStatus) fleetUploadStatus.textContent = `Editing ${regNo}`;

          fleetUploadForm?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

    fleetManagementWrap
      .querySelectorAll(".admin-fleet-toggle")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const regNo = button.dataset.reg;
          const current = button.dataset.available === "true";
          button.disabled = true;
          button.textContent = "Updating...";
          try {
            await api.post("/vehicles/availability", {
              regNo,
              available: !current,
            }).catch(() => {});
            const v = vehicles.find(item => item.regNo === regNo);
            if (v) v.available = !current ? 1 : 0;
            await loadFleetManagement();
          } catch (error) {
            console.error("FLEET AVAILABILITY ERROR:", error);
            button.disabled = false;
          }
        });
      });

    fleetManagementWrap
      .querySelectorAll(".admin-fleet-remove")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const regNo = button.dataset.reg;
          if (!regNo || !confirm(`Remove ${regNo} from the fleet?`)) return;

          button.disabled = true;
          try {
            await api.delete(`/vehicles/${regNo}`).catch(() => {});
            await loadFleetManagement();
          } catch (error) {
            console.error("FLEET REMOVE ERROR:", error);
            button.disabled = false;
          }
        });
      });
  } catch (error) {
    console.error("FLEET MANAGEMENT LOAD ERROR:", error);
    fleetManagementWrap.innerHTML = `
      <p style="color:#ef476f;">
        Could not load fleet management. ${escapeHtml(error.message)}
      </p>
    `;
  }
}

function resetFleetForm() {
  editingFleetRegNo = null;
  fleetUploadForm?.reset();
  if ($("fleetRegNo")) $("fleetRegNo").readOnly = false;
  if ($("fleetCarId")) $("fleetCarId").value = "";
  if ($("fleetYear")) $("fleetYear").value = "2026";
  if ($("fleetSeats")) $("fleetSeats").value = "5";
  if ($("fleetHub")) $("fleetHub").value = "Gavson Business Park, Ghansoli";
  if ($("fleetAcquisitionType")) $("fleetAcquisitionType").value = "Partner";
  if ($("fleetFuel")) $("fleetFuel").value = "Petrol";
  if ($("fleetTransmission")) $("fleetTransmission").value = "Manual";
  if ($("fleetIsActiveFleet")) $("fleetIsActiveFleet").checked = true;
  if (fleetUploadSubmit) fleetUploadSubmit.textContent = "Add Fleet Vehicle";
  const cancelBtn = $("fleetCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "none";
}

function initialiseFleetUpload() {
  const cancelBtn = $("fleetCancelEdit");
  cancelBtn?.addEventListener("click", () => {
    resetFleetForm();
    if (fleetUploadStatus) fleetUploadStatus.textContent = "Edit cancelled.";
  });

  fleetUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const getValue = (id) => String($(id)?.value || "").trim();
    const regNo = getValue("fleetRegNo").toUpperCase().replace(/\s+/g, "-");
    const image = $("fleetImage")?.files?.[0];

    if (!regNo) return;
    if (image && (!image.type.startsWith("image/") || image.size > 10 * 1024 * 1024)) {
      if (fleetUploadStatus) fleetUploadStatus.textContent = "Use an image up to 10 MB.";
      return;
    }

    const isEditing = Boolean(editingFleetRegNo);
    if (fleetUploadSubmit) fleetUploadSubmit.disabled = true;
    if (fleetUploadStatus) fleetUploadStatus.textContent = isEditing ? "Updating vehicle data..." : "Saving vehicle to fleet...";

    try {
      let imageUrl = null;
      if (image) {
        try {
          const fd = new FormData();
          fd.append("file", image);
          fd.append("category", "vehicle_gallery");
          fd.append("relatedId", regNo);
          const uploadRes = await api.upload("/media/upload", fd);
          imageUrl = uploadRes.url || uploadRes.mediaUrl;
        } catch (uploadErr) {
          console.warn("Storage upload error:", uploadErr);
        }
      }

      const priceDay = Number(getValue("fleetPriceDay") || 0);

      const vehicleData = {
        carId: getValue("fleetCarId") || null,
        regNo,
        brand: getValue("fleetBrand"),
        model: getValue("fleetModel"),
        year: Number(getValue("fleetYear") || 2026),
        category: getValue("fleetCategory") || "compact-suv",
        transmission: getValue("fleetTransmission") || "Manual",
        fuel: getValue("fleetFuel") || "Petrol",
        seats: Number(getValue("fleetSeats") || 5),
        priceDay,
        priceHour: Math.max(1, Math.round(priceDay / 24)),
        hub: getValue("fleetHub") || "Gavson Business Park, Ghansoli",
        acquisitionType: getValue("fleetAcquisitionType") || "Partner",
        ownerName: getValue("fleetOwnerName") || null,
        acquisitionDate: getValue("fleetAcquisitionDate") || null,
        isActiveFleet: $("fleetIsActiveFleet") ? $("fleetIsActiveFleet").checked : true,
        available: 1,
        status: "available"
      };

      if (imageUrl) {
        vehicleData.gallery = [imageUrl];
      }

      await api.post("/vehicles", vehicleData);

      // Sync active fleet roster if checkbox was toggled
      const wantsActive = $("fleetIsActiveFleet") ? $("fleetIsActiveFleet").checked : true;
      const isCurrentlyActive = currentActiveFleetRegs.includes(regNo.toUpperCase());
      if (wantsActive !== isCurrentlyActive) {
        await api.post("/vehicles/active-fleet.php", { action: wantsActive ? "add" : "remove", regNo });
      }

      resetFleetForm();
      if (fleetUploadStatus) fleetUploadStatus.textContent = isEditing ? `Vehicle ${regNo} updated successfully.` : `Vehicle ${regNo} added to fleet.`;
      await loadFleetManagement();
    } catch (err) {
      console.error("FLEET SAVE ERROR:", err);
      if (fleetUploadStatus) fleetUploadStatus.textContent = `Error: ${err.message}`;
    } finally {
      if (fleetUploadSubmit) fleetUploadSubmit.disabled = false;
    }
  });
}

// ============================================================================
// COUPON MANAGEMENT
// ============================================================================

let couponsData = [];
let editingCouponId = null;

const DEFAULT_COUPONS = [
  { id: "WELCOME500", code: "WELCOME500", type: "flat", val: 500, label: "₹500 Flat Off", minOrder: 0, status: "active" },
  { id: "FIRST500", code: "FIRST500", type: "flat", val: 500, label: "₹500 Flat Off", minOrder: 0, status: "active" },
  { id: "KRUIZLY10", code: "KRUIZLY10", type: "percent", val: 10, label: "10% Off Rental", minOrder: 0, status: "active" },
  { id: "KRUIZLY20", code: "KRUIZLY20", type: "percent", val: 20, label: "20% Off Rental", minOrder: 0, status: "active" },
];

async function loadCoupons() {
  const wrap = $("couponsTableWrap");
  if (!wrap) return;

  try {
    const res = await api.get("/coupons?all=1");
    const rawC = Array.isArray(res.coupons) ? res.coupons : [];
    const seenC = new Set();
    couponsData = [];
    rawC.forEach((c) => {
      const key = String(c.code || "").trim().toUpperCase();
      if (key && !seenC.has(key)) {
        seenC.add(key);
        couponsData.push(c);
      }
    });
    renderCouponsTable();
  } catch (error) {
    console.error("COUPONS LOAD ERROR:", error);
    renderCouponsTable();
  }
}

function renderCouponsTable() {
  const wrap = $("couponsTableWrap");
  const activeStatEl = $("activeCouponsCount");
  
  const activeCount = couponsData.filter(c => c.status === "active" || c.active === true).length;
  if (activeStatEl) activeStatEl.textContent = String(activeCount);

  if (!wrap) return;

  if (!couponsData.length) {
    wrap.innerHTML = `<p style="color:var(--kz-sub);padding:16px 0;">No coupon codes created yet.</p>`;
    return;
  }

  let html = `
    <div style="width:100%;overflow-x:auto;">
      <table class="coupon-table">
        <thead>
          <tr>
            <th>Coupon Code</th>
            <th>Discount</th>
            <th>Label / Description</th>
            <th>Min Order</th>
            <th>Status</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${couponsData.map((c) => {
            const active = c.status === "active" || c.active === true;
            const isPercent = c.type === "percent" || c.type === "percentage" || c.discountType === "percent" || c.discountType === "percentage" || (typeof c.label === "string" && c.label.includes("%"));
            const discountLabel = isPercent
              ? `${c.val || c.discountValue}% Off`
              : `₹${Number(c.val || c.discountValue || 0).toLocaleString("en-IN")} Off`;
            return `
              <tr>
                <td><span class="coupon-code-tag">${escapeHtml(c.code)}</span></td>
                <td><strong style="color:var(--kz-cyan);">${escapeHtml(discountLabel)}</strong></td>
                <td style="color:var(--kz-text);">${escapeHtml(c.label || "—")}</td>
                <td style="color:var(--kz-sub);">₹${Number(c.minOrder || c.minimumBookingAmount || 0).toLocaleString("en-IN")}</td>
                <td>
                  <span class="status-pill ${active ? "verified" : "rejected"}">
                    ${active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style="text-align:right;">
                  <div style="display:inline-flex;gap:8px;justify-content:flex-end;">
                    <button type="button" class="admin-upload-replacement-btn admin-coupon-edit" data-id="${escapeHtml(c.code || c.id)}">
                      Edit
                    </button>
                    <button type="button" class="${active ? "admin-btn-reject" : "admin-btn-approve"} admin-coupon-toggle" data-id="${escapeHtml(c.code || c.id)}" style="padding:8px 14px;font-size:0.78rem;">
                      ${active ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" class="admin-btn-reject admin-coupon-delete" data-id="${escapeHtml(c.code || c.id)}" style="padding:8px 14px;font-size:0.78rem;">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  wrap.innerHTML = html;

  wrap.querySelectorAll(".admin-coupon-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = couponsData.find(item => String(item.id) === String(btn.dataset.id) || String(item.code) === String(btn.dataset.id));
      if (!c) return;
      editingCouponId = c.id || c.code;
      const isPercent = c.type === "percent" || c.type === "percentage" || c.discountType === "percent" || c.discountType === "percentage" || (typeof c.label === "string" && c.label.includes("%"));
      if ($("couponCodeInput")) $("couponCodeInput").value = c.code || "";
      if ($("couponTypeSelect")) $("couponTypeSelect").value = isPercent ? "percent" : "flat";
      if ($("couponValueInput")) $("couponValueInput").value = c.val || c.discountValue || "";
      if ($("couponLabelInput")) $("couponLabelInput").value = c.label || "";
      if ($("couponMinOrderInput")) $("couponMinOrderInput").value = c.minOrder || c.minimumBookingAmount || 0;
      if ($("couponStatusSelect")) $("couponStatusSelect").value = c.status || (c.active ? "active" : "inactive");

      if ($("couponBoxHeading")) $("couponBoxHeading").textContent = `Editing Coupon "${c.code}"`;
      const badge = $("couponFormModeBadge");
      if (badge) {
        badge.textContent = `Editing Existing #${c.id || c.code}`;
        badge.style.background = "rgba(255, 209, 102, 0.15)";
        badge.style.color = "#ffd166";
        badge.style.borderColor = "rgba(255, 209, 102, 0.35)";
      }
      if ($("couponFormSubmit")) $("couponFormSubmit").textContent = "Update Existing Coupon";
      if ($("couponCancelBtn")) $("couponCancelBtn").style.display = "inline-block";
      if ($("couponResetNewBtn")) $("couponResetNewBtn").style.display = "inline-block";
      const formBox = $("couponFormBox");
      if (formBox) {
        formBox.style.border = "1px solid rgba(255, 209, 102, 0.4)";
        formBox.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  });

  wrap.querySelectorAll(".admin-coupon-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const c = couponsData.find(item => String(item.id) === String(btn.dataset.id) || String(item.code) === String(btn.dataset.id));
      if (!c) return;
      const isActive = c.status === "active" || c.active === true;
      const nextActive = !isActive;
      const nextStatus = nextActive ? "active" : "inactive";
      btn.disabled = true;

      try {
        await api.put(`/coupons/${c.id || c.code}`, { active: nextActive, status: nextStatus });
        await loadCoupons();
      } catch (err) {
        alert("Could not update coupon: " + err.message);
        btn.disabled = false;
      }
    });
  });

  wrap.querySelectorAll(".admin-coupon-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const c = couponsData.find(item => String(item.id) === String(btn.dataset.id) || String(item.code) === String(btn.dataset.id));
      if (!c || !confirm(`Delete coupon "${c.code}" from server database?`)) return;
      btn.disabled = true;

      try {
        await api.delete(`/coupons/${c.id || c.code}`);
        await loadCoupons();
      } catch (err) {
        alert("Could not delete coupon: " + err.message);
        btn.disabled = false;
      }
    });
  });
}

function resetCouponForm() {
  editingCouponId = null;
  $("couponForm")?.reset();
  if ($("couponBoxHeading")) $("couponBoxHeading").textContent = "Add New Coupon Code";
  const badge = $("couponFormModeBadge");
  if (badge) {
    badge.textContent = "Create Mode";
    badge.style.background = "rgba(6, 214, 160, 0.15)";
    badge.style.color = "#06d6a0";
    badge.style.borderColor = "rgba(6, 214, 160, 0.3)";
  }
  if ($("couponFormSubmit")) $("couponFormSubmit").textContent = "Save Coupon";
  const cancelBtn = $("couponCancelBtn");
  if (cancelBtn) cancelBtn.style.display = "none";
  const resetBtn = $("couponResetNewBtn");
  if (resetBtn) resetBtn.style.display = "none";
  const formBox = $("couponFormBox");
  if (formBox) formBox.style.border = "";
}

function initialiseCouponManagement() {
  const cancelBtn = $("couponCancelBtn");
  cancelBtn?.addEventListener("click", () => {
    resetCouponForm();
    const statusMsg = $("couponFormStatus");
    if (statusMsg) {
      statusMsg.textContent = "Editing cancelled. Switched to Create New Coupon mode.";
      statusMsg.style.color = "var(--kr-cyan)";
    }
  });

  const resetBtn = $("couponResetNewBtn");
  resetBtn?.addEventListener("click", () => {
    resetCouponForm();
    const statusMsg = $("couponFormStatus");
    if (statusMsg) {
      statusMsg.textContent = "Switched to Create New Coupon mode.";
      statusMsg.style.color = "var(--kr-cyan)";
    }
  });

  const topNewBtn = $("couponNewTopBtn");
  topNewBtn?.addEventListener("click", () => {
    resetCouponForm();
    $("couponFormBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
    $("couponCodeInput")?.focus();
  });

  $("couponForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = String($("couponCodeInput")?.value || "").trim().toUpperCase();
    const type = $("couponTypeSelect")?.value || "flat";
    const val = Number($("couponValueInput")?.value || 0);
    const label = String($("couponLabelInput")?.value || "").trim() || (type === "percent" ? `${val}% Off` : `₹${val} Flat Off`);
    const minOrder = Number($("couponMinOrderInput")?.value || 0);
    const status = $("couponStatusSelect")?.value || "active";

    if (!code || val <= 0) {
      alert("Enter a valid coupon code and discount value.");
      return;
    }

    const isEditing = editingCouponId !== null;
    const currentEditId = editingCouponId;
    const submitBtn = $("couponFormSubmit");
    if (submitBtn) submitBtn.disabled = true;
    const statusMsg = $("couponFormStatus");
    if (statusMsg) statusMsg.textContent = isEditing ? `Updating existing coupon #${currentEditId}...` : `Creating new coupon "${code}"...`;

    try {
      const isActive = status === "active";
      const data = {
        code,
        newCode: code,
        active: isActive,
        status,
        type,
        discountType: type,
        val,
        discountValue: val,
        label,
        minOrder,
        minimumBookingAmount: minOrder
      };

      const existingCoupon = couponsData.find(item => String(item.code || "").toUpperCase() === code);
      if (isEditing) {
        // Strictly update ONLY the existing selected coupon by ID
        await api.put(`/coupons/${encodeURIComponent(currentEditId)}`, data);
      } else if (existingCoupon) {
        // Automatically update the matching existing coupon
        await api.put(`/coupons/${encodeURIComponent(existingCoupon.id || existingCoupon.code)}`, data);
      } else {
        // Create a distinct new coupon
        await api.post("/coupons", data);
      }

      resetCouponForm();
      if (statusMsg) {
        statusMsg.textContent = isEditing
          ? `Coupon "${code}" updated successfully!`
          : `New coupon "${code}" created successfully!`;
        statusMsg.style.color = "#00f0a0";
      }
      await loadCoupons();
    } catch (err) {
      console.error("COUPON SAVE ERROR:", err);
      if (statusMsg) {
        statusMsg.textContent = `Notice: ${err.message}`;
        statusMsg.style.color = "#ef476f";
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// ============================================================================
// DATABASE EXCEL EXPORT
// ============================================================================

function initialiseFirebaseExport() {
  if (!exportFirebaseExcelBtn) return;

  exportFirebaseExcelBtn.addEventListener("click", async () => {
    exportFirebaseExcelBtn.disabled = true;
    if (firebaseExportStatus) {
      firebaseExportStatus.textContent = "Generating database Excel export...";
      firebaseExportStatus.style.color = "var(--kr-cyan)";
    }

    try {
      const res = await api.get("/admin/export", { format: "json" });
      const exportData = res.data || res;
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `KRUIZLY_Database_Export_${dateStr}.xlsx`;

      if (typeof window.XLSX !== "undefined" && window.XLSX.utils) {
        // Generate a true multi-tab Excel (.xlsx) workbook
        const wb = window.XLSX.utils.book_new();

        const addSheet = (rows, sheetName) => {
          if (Array.isArray(rows) && rows.length > 0) {
            const ws = window.XLSX.utils.json_to_sheet(rows);
            window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
          } else {
            const ws = window.XLSX.utils.aoa_to_sheet([["No records found"]]);
            window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
          }
        };

        addSheet(exportData.bookings, "Bookings");
        addSheet(exportData.payments, "Payments");
        addSheet(exportData.users, "Users");
        addSheet(exportData.vehicles, "Vehicles");
        addSheet(exportData.coupons, "Coupons");
        addSheet(exportData.verification, "KYC Verifications");

        window.XLSX.writeFile(wb, filename);
      } else {
        // Fallback to CSV download
        const csvUrl = `${API_BASE_URL}/admin/export?format=csv`;
        const token = await getAuthToken();
        const response = await fetch(csvUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `KRUIZLY_Database_Export_${dateStr}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
      }

      if (firebaseExportStatus) {
        firebaseExportStatus.textContent = "✓ Database Excel workbook downloaded successfully.";
        firebaseExportStatus.style.color = "#00f0a0";
      }
    } catch (err) {
      console.error("EXCEL EXPORT ERROR:", err);
      if (firebaseExportStatus) {
        firebaseExportStatus.textContent = "Export error: " + err.message;
        firebaseExportStatus.style.color = "#ef476f";
      }
    } finally {
      exportFirebaseExcelBtn.disabled = false;
    }
  });
}

function normaliseFirestoreValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (
    value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    value &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number"
  ) {
    return `${value.latitude}, ${value.longitude}`;
  }

  if (
    value &&
    typeof value.path === "string"
  ) {
    return value.path;
  }

  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map(
        normaliseNestedFirestoreValue
      )
    );
  }

  return value;
}

function normaliseNestedFirestoreValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(
      normaliseNestedFirestoreValue
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    if (
      typeof value.latitude === "number" &&
      typeof value.longitude === "number"
    ) {
      return {
        latitude: value.latitude,
        longitude: value.longitude,
      };
    }

    if (typeof value.path === "string") {
      return value.path;
    }

    return Object.fromEntries(
      Object.entries(value).map(
        ([key, nestedValue]) => [
          key,
          normaliseNestedFirestoreValue(
            nestedValue
          ),
        ]
      )
    );
  }

  return value;
}

function flattenFirestoreRecord(
  value,
  prefix = "",
  result = {}
) {
  Object.entries(value || {}).forEach(
    ([key, fieldValue]) => {
      const columnName = prefix
        ? `${prefix}.${key}`
        : key;

      const isNestedObject =
        fieldValue &&
        typeof fieldValue === "object" &&
        !Array.isArray(fieldValue) &&
        !(fieldValue instanceof Date) &&
        typeof fieldValue.toDate !== "function" &&
        typeof fieldValue.latitude !== "number" &&
        typeof fieldValue.path !== "string";

      if (isNestedObject) {
        flattenFirestoreRecord(
          fieldValue,
          columnName,
          result
        );

        return;
      }

      result[columnName] =
        normaliseFirestoreValue(
          fieldValue
        );
    }
  );

  return result;
}

async function getFirestoreExportRows(
  collectionName
) {
  try {
    const res = await api.get(`/admin/export?table=${encodeURIComponent(collectionName)}`);
    const records = res.data || res.rows || [];
    return records.map((item) => flattenFirestoreRecord(item));
  } catch {
    const cached = getCachedExportRows(collectionName);
    return cached ? cached.map((item) => flattenFirestoreRecord(item)) : [];
  }
}

function getCachedExportRows(
  collectionName
) {
  let records = null;

  if (collectionName === "users") {
    records = usersData;
  } else if (collectionName === "bookings") {
    records = bookingsData;
  } else if (
    collectionName === "partner_cars"
  ) {
    records = hostCarsData;
  }

  if (!records) {
    return null;
  }

  return records.map(
    (item) =>
      flattenFirestoreRecord({
        documentId: item.id,
        ...item,
      })
  );
}

function createExportWorksheet(rows) {
  const XLSX = window.XLSX;
  const worksheetRows = rows.length
    ? rows
    : [{ Message: "No records" }];

  const headers = Array.from(
    new Set(
      worksheetRows.flatMap(
        (row) => Object.keys(row)
      )
    )
  );

  const worksheet =
    XLSX.utils.json_to_sheet(
      worksheetRows,
      { header: headers }
    );

  worksheet["!autofilter"] = {
    ref: worksheet["!ref"],
  };

  worksheet["!cols"] = headers.map(
    (header) => {
      const longest = Math.max(
        header.length,
        ...worksheetRows.map(
          (row) =>
            String(row[header] ?? "").length
        )
      );

      return {
        wch: Math.min(
          Math.max(longest + 2, 12),
          45
        ),
      };
    }
  );

  return worksheet;
}
async function exportFirebaseToExcel() {
  if (!exportFirebaseExcelBtn) {
    return;
  }

  if (!currentUser) {
    alert("You must be signed in as an administrator.");
    return;
  }

  const originalText =
    exportFirebaseExcelBtn.textContent;

  try {
    exportFirebaseExcelBtn.disabled = true;
    exportFirebaseExcelBtn.textContent =
      "Preparing Excel...";

    if (firebaseExportStatus) {
      firebaseExportStatus.textContent =
        "Generating Excel from Firebase...";
    }

    const token = await getAuthToken();

    const response = await fetch(
      `${MEDIA_SERVER_URL}/api/admin/export/excel`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      let message =
        `Export failed (${response.status}).`;

      try {
        const data =
          await response.json();

        if (data.error) {
          message = data.error;
        }
      } catch (_) {
        // Response wasn't JSON.
      }

      throw new Error(message);
    }

    const blob =
      await response.blob();

    const downloadUrl =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = downloadUrl;

    const date =
      new Date()
        .toISOString()
        .slice(0, 10);

    link.download =
      `CARRENTPE_Firebase_${date}.xlsx`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(
      downloadUrl
    );

    if (firebaseExportStatus) {
      firebaseExportStatus.textContent =
        "Excel export completed successfully.";
    }

  } catch (error) {
    console.error(
      "FIREBASE EXCEL EXPORT ERROR:",
      error
    );

    if (firebaseExportStatus) {
      firebaseExportStatus.textContent =
        "Excel export failed.";
    }

    alert(
      "Could not create export.\n\n" +
      error.message
    );

  } finally {
    exportFirebaseExcelBtn.disabled = false;

    exportFirebaseExcelBtn.textContent =
      originalText;
  }
}
// ============================================================================
// USERS
// ============================================================================

async function loadUsers() {
  if (usersTableWrap) {
    usersTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading users...
      </p>`;
  }

  try {
    const res = await api.get("/users");
    const rawU = Array.isArray(res.users) ? res.users : [];
    const seenU = new Set();
    usersData = [];
    rawU.forEach((u) => {
      const key = String(u.firebase_uid || u.uid || u.email || u.id || "").trim();
      if (key && !seenU.has(key)) {
        seenU.add(key);
        usersData.push(u);
      }
    });

    usersData.sort(
      (a, b) =>
        toMillis(b.createdAt || b.documentsVerifiedAt) -
        toMillis(a.createdAt || a.documentsVerifiedAt)
    );

    updateUserStats();

    renderUsersTable(
      usersData
    );

  } catch (error) {
    console.error("LOAD USERS ERROR:", error);

    const isPermErr = error.code === "permission-denied" || (error.message && error.message.includes("permission"));
    const errMsg = isPermErr
      ? "Admin Authentication Required — Sign in on the Profile page as an Admin to inspect user identity records."
      : error.message;

    if (usersTableWrap) {
      usersTableWrap.innerHTML =
        `<div style="padding:24px;text-align:center;background:rgba(255,92,119,0.06);border:1px solid rgba(255,92,119,0.2);border-radius:14px;margin:10px 0;">
          <p style="color:#ff5c77;font-weight:700;margin:0 0 6px;">Unable to fetch user records</p>
          <p style="color:var(--kr-text-secondary);font-size:13px;margin:0 0 14px;">${escapeHtml(errMsg)}</p>
          ${isPermErr ? `<a href="profile.html" class="btn btn-dark btn-sm" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;">Go to Profile &amp; Sign In</a>` : ""}
        </div>`;
    }
  }
}

function updateUserStats() {
  // Always update live user count from usersData regardless of KPI overrides
  const totalUsersEl = $("statTotalUsers");
  if (totalUsersEl) totalUsersEl.textContent = usersData.length;

  if (currentKpiStats) {
    applyKpiStats();
    return;
  }

  const pending =
    usersData.filter(
      (user) =>
        user.licenseStatus ===
          "pending" ||
        user.aadharStatus ===
          "pending" ||
        user.panStatus ===
          "pending"
    ).length;

  const pendingEl =
    $("statPendingDocs");

  if (pendingEl) {
    pendingEl.textContent =
      pending;
  }
}

function updateBookingStats() {
  if (currentKpiStats) {
    applyKpiStats();
    return;
  }

  const totalBookings = $("statTotalBookings");
  if (totalBookings) {
    totalBookings.textContent = bookingsData.length;
  }
}

function documentStatusLabel(
  status
) {
  switch (status) {
    case "verified":
      return "Verified";

    case "pending":
      return "Pending Review";

    case "rejected":
      return "Rejected";

    default:
      return "Not Submitted";
  }
}

function documentStatusClass(
  status
) {
  if (status === "verified") {
    return "verified";
  }

  if (status === "rejected") {
    return "rejected";
  }

  if (status === "pending") {
    return "pending";
  }

  return "";
}

// ============================================================================
// USERS TABLE
// ============================================================================

function renderUsersTable(
  users
) {
  if (!usersTableWrap) {
    return;
  }

  if (!users.length) {
    usersTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        No user records found.
      </p>`;

    return;
  }

  const totalPages = Math.max(1, Math.ceil(users.length / ADMIN_USERS_PER_PAGE));
  adminUserPage = Math.min(adminUserPage, totalPages);
  const pageStart = (adminUserPage - 1) * ADMIN_USERS_PER_PAGE;
  const pageUsers = users.slice(pageStart, pageStart + ADMIN_USERS_PER_PAGE);

  let html = `
    <div style="width:100%;overflow-x:auto;">
      <table
        class="admin-table"
        style="
          width:100%;
          min-width:940px;
          border-collapse:collapse;
          text-align:left;
        "
      >
        <thead>
          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >
            <th style="padding:12px;">
              User
            </th>

            <th style="padding:12px;">
              Contact
            </th>

            <th style="padding:12px;">
              Role
            </th>

            <th style="padding:12px;">
              License
            </th>

            <th style="padding:12px;">
              Aadhaar
            </th>

            <th style="padding:12px;">
              PAN
            </th>

            <th style="padding:12px;text-align:right;">
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
  `;

  pageUsers.forEach((user) => {
    const hasLicense = Boolean(user.licenseFrontURL || user.licenseURL || user.licenseFrontMediaId || user.license_front_media_id || user.licenseNumber);
      const hasAadhaar = Boolean(user.aadharFrontURL || user.aadharURL || user.aadharBackURL || user.aadharFrontMediaId || user.aadhar_front_media_id || user.aadharNumber);
      const hasPan = Boolean(user.panFrontURL || user.panURL || user.panBackURL || user.panFrontMediaId || user.pan_front_media_id || user.panNumber);

      const license = (user.licenseStatus && user.licenseStatus !== "not_submitted") ? user.licenseStatus : (hasLicense ? "pending" : "not_submitted");
      const aadhaar = (user.aadharStatus && user.aadharStatus !== "not_submitted") ? user.aadharStatus : (hasAadhaar ? "pending" : "not_submitted");
      const pan = (user.panStatus && user.panStatus !== "not_submitted") ? user.panStatus : (hasPan ? "pending" : "not_submitted");

      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,0.06);
          "
        >

          <td style="padding:12px;">
            <strong>
              ${escapeHtml(
                user.name ||
                  "Unnamed"
              )}
            </strong>

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.8rem;
              "
            >
              ${escapeHtml(
                user.email ||
                  "No email"
              )}
            </span>
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              user.phone ||
                "—"
            )}
          </td>

          <td style="padding:12px;">
            <select
              class="kr-clean-input role-select"
              data-uid="${escapeHtml(user.id)}"
              style="width:auto;min-width:130px;height:34px;font-size:12.5px;"
            >

              <option
                value="customer"
                ${
                  user.role ===
                  "customer"
                    ? "selected"
                    : ""
                }
              >
                Customer
              </option>

              <option
                value="manager"
                ${
                  user.role ===
                  "manager"
                    ? "selected"
                    : ""
                }
              >
                Manager
              </option>

              <option
                value="executive"
                ${
                  user.role ===
                  "executive"
                    ? "selected"
                    : ""
                }
              >
                Executive
              </option>

              <option
                value="accountant"
                ${
                  user.role ===
                  "accountant"
                    ? "selected"
                    : ""
                }
              >
                Accountant
              </option>

              <option
                value="admin"
                ${
                  user.role ===
                  "admin"
                    ? "selected"
                    : ""
                }
              >
                Admin
              </option>

            </select>
          </td>

          <td style="padding:12px;">
            <span
              class="fleet-status ${documentStatusClass(
                license
              )}"
            >
              ${documentStatusLabel(
                license
              )}
            </span>

            <br>

            <button
              type="button"
              class="btn btn-outline inspect-document-btn"
              data-uid="${escapeHtml(
                user.id
              )}"
              data-type="license"
              style="
                margin-top:6px;
                padding:4px 8px;
                font-size:.75rem;
              "
            >
              Inspect
            </button>
          </td>

          <td style="padding:12px;">
            <span
              class="fleet-status ${documentStatusClass(
                aadhaar
              )}"
            >
              ${documentStatusLabel(
                aadhaar
              )}
            </span>

            <br>

            <button
              type="button"
              class="btn btn-outline inspect-document-btn"
              data-uid="${escapeHtml(
                user.id
              )}"
              data-type="aadhar"
              style="
                margin-top:6px;
                padding:4px 8px;
                font-size:.75rem;
              "
            >
              Inspect
            </button>
          </td>

          <td style="padding:12px;">
            <span class="fleet-status ${documentStatusClass(pan)}">
              ${documentStatusLabel(pan)}
            </span>
            <br>
            <button
              type="button"
              class="btn btn-outline inspect-document-btn"
              data-uid="${escapeHtml(user.id)}"
              data-type="pan"
              style="margin-top:6px;padding:4px 8px;font-size:.75rem;"
            >
              Inspect
            </button>
          </td>

          <td
            style="
              padding:12px;
              text-align:right;
            "
          >

            <span style="color:${license === "verified" && aadhaar === "verified" && pan === "verified" ? "#06d6a0" : "var(--sub)"};font-size:.8rem;">
              ${license === "verified" && aadhaar === "verified" && pan === "verified"
                ? "Identity verified"
                : "Review each ID"}
            </span>

          </td>

        </tr>
      `;
    }
  );

  html += `
        </tbody>
      </table>
    </div>
    ${renderAdminPagination({
      page: adminUserPage,
      totalPages,
      totalItems: users.length,
      type: "users"
    })}
  `;

  usersTableWrap.innerHTML = html;

  usersTableWrap
    .querySelectorAll("[data-admin-users-page-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        adminUserPage += button.dataset.adminUsersPageAction === "next" ? 1 : -1;
        renderUsersTable(usersData);
        usersTableWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

  // INSPECT DOCUMENT
  usersTableWrap
    .querySelectorAll(
      ".inspect-document-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const uid =
            button.dataset.uid;

          const type =
            button.dataset.type;

          const user =
            usersData.find(
              (item) =>
                item.id === uid
            );

          if (!user) {
            alert(
              "User record not found."
            );

            return;
          }

          openDocumentModal(
            user,
            type
          );
        }
      );
    });

  // ROLE
  usersTableWrap
    .querySelectorAll(
      ".role-select"
    )
    .forEach((select) => {
      select.addEventListener(
        "change",
        async () => {
          const uid =
            select.dataset.uid;

          const newRole =
            select.value;

          const user =
            usersData.find(
              (item) =>
                item.id === uid
            );

          if (!user) return;

          const oldRole =
            user.role;

          user.role =
            newRole;

          try {
            await api.put(`/users/${uid}/role`, { role: newRole });

          } catch (error) {
            console.error(
              "ROLE UPDATE ERROR:",
              error
            );

            user.role =
              oldRole;

            select.value =
              oldRole ||
              "customer";

            alert(
              "Could not update role.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // APPROVE ACCOUNT
  usersTableWrap
    .querySelectorAll(
      ".approve-all-docs-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const uid =
            button.dataset.uid;

          const oldText =
            button.textContent;

          button.disabled = true;
          button.textContent =
            "Verifying...";

          try {
            await api.post(`/verification/user/${uid}/status`, {
              docType: "all",
              status: "verified"
            });

            const user =
              usersData.find(
                (item) =>
                  item.id === uid
              );

            if (user) {
              user.licenseStatus =
                "verified";

              user.aadharStatus =
                "verified";

              user.panStatus =
                "verified";
            }

            updateUserStats();

            renderUsersTable(
              usersData
            );

          } catch (error) {
            console.error(
              "DOCUMENT APPROVAL ERROR:",
              error
            );

            button.disabled =
              false;

            button.textContent =
              oldText;

            alert(
              "Could not approve documents.\n\n" +
              error.message
            );
          }
        }
      );
    });
}

// ============================================================================
// DOCUMENT MODAL
// ============================================================================

function initialiseDocumentModal() {
  const close =
    $("closeDocModal");

  if (close) {
    close.addEventListener(
      "click",
      () => {
        hideModal(
          "docModal"
        );
      }
    );
  }

  const approve =
    $("approveDocBtn");

  if (approve) {
    approve.addEventListener(
      "click",
      async () => {
        if (
          !activeDocUser ||
          !activeDocType
        ) {
          return;
        }

        await updateDocumentStatus(
          activeDocUser.id,
          activeDocType,
          "verified"
        );

        hideModal(
          "docModal"
        );
      }
    );
  }

  const reject =
    $("rejectDocBtn");

  if (reject) {
    reject.addEventListener(
      "click",
      async () => {
        if (
          !activeDocUser ||
          !activeDocType
        ) {
          return;
        }

        await updateDocumentStatus(
          activeDocUser.id,
          activeDocType,
          "rejected"
        );

        hideModal(
          "docModal"
        );
      }
    );
  }

  const uploadButton =
    $("docUploadBtn");

  const uploadInput =
    $("docUploadInput");

  if (
    uploadButton &&
    uploadInput
  ) {
    uploadButton.addEventListener(
      "click",
      () => {
        uploadInput.click();
      }
    );

    uploadInput.addEventListener(
      "change",
      async () => {
        const file =
          uploadInput.files?.[0];

        if (
          !file ||
          !activeDocUser ||
          !activeDocType
        ) {
          return;
        }

        await uploadDocument(
          activeDocUser.id,
          activeDocType,
          file
        );

        uploadInput.value =
          "";
      }
    );
  }
}

async function fetchAdminDocumentPreview(mediaUrl) {
  if (!mediaUrl) return null;
  const str = String(mediaUrl).trim();

  // If it's already a data URI or blob URL
  if (str.startsWith("data:") || str.startsWith("blob:")) {
    return str;
  }

  let finalUrl = str;
  if (str.startsWith("MED-")) {
    finalUrl = `${MEDIA_SERVER_URL}/api/media/file.php?id=${encodeURIComponent(str)}`;
  } else if (!str.startsWith("http://") && !str.startsWith("https://")) {
    finalUrl = `${MEDIA_SERVER_URL}${str.startsWith("/") ? "" : "/"}${str}`;
  }

  const isFullHttp = finalUrl.startsWith("http://") || finalUrl.startsWith("https://");

  try {
    const token = await getAuthToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(finalUrl, { headers });
    if (!response.ok) {
      if (isFullHttp) return finalUrl;
      throw new Error(`Media server status ${response.status}`);
    }
    return URL.createObjectURL(await response.blob());
  } catch (err) {
    if (isFullHttp) return finalUrl;
    throw err;
  }
}

async function openDocumentModal(
  user,
  type
) {
  activeDocObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeDocObjectUrls = [];

  activeDocUser =
    user;

  activeDocType =
    type;

  const configs = {
    license: {
      title: "Driving Licence",
      front: user.licenseFrontURL || user.licenseURL || user.licenseFrontMediaId || user.license_front_media_id,
      back: user.licenseBackURL || user.licenseBackMediaId || user.license_back_media_id,
      requiresBack: true
    },
    aadhar: {
      title: "Aadhaar Card",
      front: user.aadharFrontURL || user.aadharURL || user.aadharFrontMediaId || user.aadhar_front_media_id,
      back: user.aadharBackURL || user.aadharBackMediaId || user.aadhar_back_media_id,
      requiresBack: true
    },
    pan: {
      title: "PAN Card",
      front: user.panFrontURL || user.panFrontMediaId || user.pan_front_media_id,
      back: user.panBackURL || user.panBackMediaId || user.pan_back_media_id,
      requiresBack: true
    }
  };

  const config = configs[type] || configs.license;
  const urls = [config.front, config.back];

  const titleEl =
    $("modalTitle");

  if (titleEl) {
    titleEl.textContent =
      `${user.name || "User"} — ${config.title}`;
  }

  const img =
    $("modalImg");
  const backImg = $("modalBackImg");
  const frontFigure = $("modalFrontFigure");
  const backFigure = $("modalBackFigure");
  const previewGrid = $("documentPreviewGrid");

  const approve =
    $("approveDocBtn");

  const reject =
    $("rejectDocBtn");

  if (frontFigure) frontFigure.style.display = "block";
  if (backFigure) backFigure.style.display = config.requiresBack ? "block" : "none";
  if (previewGrid) {
    previewGrid.style.gridTemplateColumns = config.requiresBack
      ? "repeat(2,minmax(0,1fr))"
      : "1fr";
  }

  showModal(
    "docModal"
  );

  const targets = [img, backImg];
  let loadedCount = 0;

  const noFrontUploaded = !config.front;
  const noBackUploaded = config.requiresBack && !config.back;

  if (img) {
    if (noFrontUploaded) {
      img.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'%3E%3Crect width='100%25' height='100%25' fill='%23121926' rx='12'/%3E%3Ctext x='50%25' y='50%25' fill='%23ef476f' font-family='sans-serif' font-size='14' font-weight='bold' text-anchor='middle'%3ENo Front Side Uploaded%3C/text%3E%3C/svg%3E`;
      img.style.display = "block";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
    }
  }

  if (backImg) {
    if (noBackUploaded) {
      backImg.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'%3E%3Crect width='100%25' height='100%25' fill='%23121926' rx='12'/%3E%3Ctext x='50%25' y='50%25' fill='%23ef476f' font-family='sans-serif' font-size='14' font-weight='bold' text-anchor='middle'%3ENo Back Side Uploaded%3C/text%3E%3C/svg%3E`;
      backImg.style.display = "block";
    } else {
      backImg.removeAttribute("src");
      backImg.style.display = "none";
    }
  }

  await Promise.all(urls.map(async (url, index) => {
    if (!url || !targets[index]) return;
    try {
      const objectUrl = await fetchAdminDocumentPreview(url);
      if (!objectUrl) return;
      if (activeDocUser !== user || activeDocType !== type || !targets[index].isConnected) {
        if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
        return;
      }
      if (objectUrl.startsWith("blob:")) activeDocObjectUrls.push(objectUrl);
      targets[index].src = objectUrl;
      targets[index].style.display = "block";
      loadedCount += 1;
    } catch (error) {
      // Fallback placeholder image when document ID is missing from local storage
      const fallbackSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'%3E%3Crect width='100%25' height='100%25' fill='%23121926' rx='12'/%3E%3Ctext x='50%25' y='46%25' fill='%2348d7ff' font-family='sans-serif' font-size='14' font-weight='bold' text-anchor='middle'%3EProtected Document on Cloud%3C/text%3E%3Ctext x='50%25' y='58%25' fill='%237b8798' font-family='sans-serif' font-size='12' text-anchor='middle'%3ERef: ${encodeURIComponent(String(url).slice(-20))}%3C/text%3E%3C/svg%3E`;
      targets[index].src = fallbackSvg;
      targets[index].style.display = "block";
      loadedCount += 1;
    }
  }));

  const hasUploadedFile = !noFrontUploaded || !noBackUploaded || loadedCount > 0;

  if (approve) {
    approve.disabled = !hasUploadedFile;
    approve.title = hasUploadedFile ? "Approve document verification" : "No document file uploaded.";
  }
  if (reject) {
    reject.disabled = false;
  }
}

async function updateDocumentStatus(
  uid,
  type,
  status
) {
  const user =
    usersData.find(
      (item) =>
        item.id === uid
    );

  if (!user) return;

  const updates = {};

  if (
    type === "license" ||
    type === "both"
  ) {
    updates.licenseStatus =
      status;
  }

  if (
    type === "aadhar" ||
    type === "both"
  ) {
    updates.aadharStatus =
      status;
  }

  if (
    type === "pan" ||
    type === "both"
  ) {
    updates.panStatus = status;
  }

  try {
    await api.post(`/verification/user/${uid}/status`, {
      docType: type,
      status
    });

    Object.assign(
      user,
      updates
    );

    updateUserStats();

    renderUsersTable(
      usersData
    );

  } catch (error) {
    console.error(
      "DOCUMENT STATUS ERROR:",
      error
    );

    alert(
      "Could not update document status.\n\n" +
      error.message
    );
  }
}

async function uploadDocument(
  uid,
  type,
  file
) {
  const status =
    $("docUploadStatus");

  const button =
    $("docUploadBtn");

  if (button) {
    button.disabled =
      true;

    button.textContent =
      "Uploading...";
  }

  if (status) {
    status.textContent =
      "Uploading to server...";
  }

  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", "verification");
    fd.append("relatedId", uid);

    const uploadRes = await api.upload("/media/upload", fd);
    const url = uploadRes.url || uploadRes.mediaUrl;

    const updates = {
      [`${type}URL`]: url,
      [`${type}FrontURL`]: url,
      [`${type}Status`]: "pending",
    };

    await api.post(`/verification/user/${uid}/status`, {
      docType: type,
      status: "pending",
      metadataUpdates: {
        [`${type}URL`]: url,
        [`${type}FrontURL`]: url
      }
    });

    const user =
      usersData.find(
        (item) =>
          item.id === uid
      );

    if (user) {
      Object.assign(
        user,
        updates
      );
    }

    renderUsersTable(
      usersData
    );

    if (user) {
      activeDocUser =
        user;

      openDocumentModal(
        user,
        type
      );
    }

    if (status) {
      status.textContent =
        "Uploaded successfully. Document is now pending review.";
    }

  } catch (error) {
    console.error(
      "DOCUMENT UPLOAD ERROR:",
      error
    );

    alert(
      "Could not upload document.\n\n" +
      error.message
    );

    if (status) {
      status.textContent =
        error.message;
    }

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        "Upload Replacement / Missing Document";
    }
  }
}

// ============================================================================
// BOOKINGS
// ============================================================================

async function loadBookings() {
  if (bookingsTableWrap) {
    bookingsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading bookings...
      </p>`;
  }

  if (paymentsTableWrap) {
    paymentsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading payments...
      </p>`;
  }

  try {
    const res = await api.get("/bookings");
    const rawB = Array.isArray(res.bookings) ? res.bookings : [];
    const seenB = new Set();
    bookingsData = [];
    rawB.forEach((b) => {
      const key = String(b.bookingNumber || b.bookingId || b.id || "").trim().toUpperCase();
      if (key && !seenB.has(key)) {
        seenB.add(key);
        bookingsData.push(b);
      }
    });

    sortBookings();

    const totalBookings =
      $("statTotalBookings");

    if (totalBookings) {
      totalBookings.textContent =
        bookingsData.length;
    }

    renderBookingsTable(
      getFilteredBookings()
    );

    renderPaymentsTable();

    updateRevenueStats();

  } catch (error) {
    console.error("LOAD BOOKINGS ERROR:", error);

    const isAuthErr = error.message && (error.message.includes("401") || error.message.includes("403") || error.message.includes("token") || error.message.includes("access"));
    const isNetworkErr = error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError") || error.message.includes("connection"));
    
    let errMsg = error.message;
    if (isAuthErr) {
      errMsg = "Admin Authentication Required — Please sign in with an Admin account on the Profile page.";
    } else if (isNetworkErr) {
      errMsg = "Cannot connect to Backend API Server. Please verify the API is reachable.";
    }

    if (bookingsTableWrap) {
      bookingsTableWrap.innerHTML =
        `<div style="padding:24px;text-align:center;background:rgba(255,92,119,0.06);border:1px solid rgba(255,92,119,0.2);border-radius:14px;margin:10px 0;">
          <p style="color:#ff5c77;font-weight:700;margin:0 0 6px;">Unable to fetch bookings</p>
          <p style="color:var(--kr-text-secondary);font-size:13px;margin:0 0 14px;">${escapeHtml(errMsg)}</p>
          <a href="profile.html" class="btn btn-dark btn-sm" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;">Go to Profile &amp; Sign In</a>
        </div>`;
    }

    if (paymentsTableWrap) {
      paymentsTableWrap.innerHTML =
        `<div style="padding:24px;text-align:center;background:rgba(255,92,119,0.06);border:1px solid rgba(255,92,119,0.2);border-radius:14px;margin:10px 0;">
          <p style="color:#ff5c77;font-weight:700;margin:0 0 6px;">Unable to fetch payments</p>
          <p style="color:var(--kr-text-secondary);font-size:13px;margin:0 0 14px;">${escapeHtml(errMsg)}</p>
          <a href="profile.html" class="btn btn-dark btn-sm" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;">Go to Profile &amp; Sign In</a>
        </div>`;
    }
  }
}

// ============================================================================
// BOOKINGS TABLE
//
// Date, odometer, and FASTag are deliberately handled as follows:
//
// MAIN TABLE:
// Date | Ref | Customer | Vehicle | Amount | Status | Details
//
// DETAILS:
// Pickup/Return dates
// Start odometer
// End odometer
// Distance
// FASTag at start
// FASTag at return
// Payment
// Status
// Return Report / Process Return
// ============================================================================

function renderBookingsTable(
  bookings
) {
  if (!bookingsTableWrap) {
    return;
  }

  const totalPages = Math.max(
    1,
    Math.ceil(bookings.length / ADMIN_BOOKINGS_PER_PAGE)
  );
  adminBookingPage = Math.min(adminBookingPage, totalPages);
  const pageStart =
    (adminBookingPage - 1) * ADMIN_BOOKINGS_PER_PAGE;
  const pageBookings = bookings.slice(
    pageStart,
    pageStart + ADMIN_BOOKINGS_PER_PAGE
  );

  if (!bookings.length) {
    bookingsTableWrap.innerHTML =
      `<div
        style="
          padding:40px;
          text-align:center;
          color:var(--sub);
        "
      >
        <div
          style="
            font-size:2rem;
            margin-bottom:10px;
          "
        >
          No results
        </div>

        <strong>
          No bookings found
        </strong>

        <p style="margin-top:8px;">
          Try changing the status or date filters.
        </p>
      </div>`;

    return;
  }

  let html = `
    <div
      style="
        width:100%;
        overflow-x:auto;
      "
    >

      <table
        class="admin-table"
        style="
          width:100%;
          min-width:1100px;
          border-collapse:collapse;
          text-align:left;
          font-size:.9rem;
        "
      >

        <thead>

          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >

            <th style="padding:14px;">
              DATE
            </th>

            <th style="padding:14px;">
              BOOKING REF
            </th>

            <th style="padding:14px;">
              CUSTOMER
            </th>

            <th style="padding:14px;">
              VEHICLE
            </th>

            <th style="padding:14px;">
              AMOUNT
            </th>

            <th style="padding:14px;">
              STATUS
            </th>

            <th
              style="
                padding:14px;
                text-align:right;
              "
            >
              DETAILS
            </th>

          </tr>

        </thead>

        <tbody>
  `;

  pageBookings.forEach(
    (booking) => {
      const id =
        booking.id;

      const rowId =
        `booking-details-${id}`;

      const status =
        String(
          booking.status ||
            "unknown"
        ).toLowerCase();

      const customer =
        booking.userName ||
        booking.customerName ||
        booking.name ||
        "Customer";

      const vehicle =
        booking.vehicleName ||
        booking.carName ||
        booking.vehicle ||
        "Vehicle";

      const amount =
        booking.totalAmount ??
        booking.amount ??
        booking.total ??
        0;

      const startOdo =
        getStartOdometer(
          booking
        );

      const endOdo =
        getEndOdometer(
          booking
        );

      const distance =
        calculateDistance(
          startOdo,
          endOdo
        );

      const startFastag =
        getStartFastag(
          booking
        );

      const returnFastag =
        getReturnFastag(
          booking
        );

      let returnButton = "";

      if (
        status ===
        "confirmed"
      ) {
        returnButton = `
          <button
            type="button"
            class="btn btn-dark process-return-btn"
            data-bid="${escapeHtml(
              id
            )}"
            style="
              padding:6px 12px;
              font-size:.8rem;
            "
          >
            Process Return
          </button>
        `;
      }

      if (
        status ===
          "completed" &&
        booking.returnInspection
      ) {
        returnButton = `
          <button
            type="button"
            class="btn btn-outline view-return-report-btn"
            data-bid="${escapeHtml(
              id
            )}"
            style="
              padding:6px 12px;
              font-size:.8rem;
            "
          >
            View Return Report
          </button>
        `;
      }

      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
          "
        >

          <td
            style="
              padding:14px;
              white-space:nowrap;
            "
          >
            ${getBookingDisplayDate(
              booking
            )}
          </td>

          <td
            style="
              padding:14px;
              font-family:monospace;
            "
          >
            #${escapeHtml(
              id.slice(0, 8)
            )}
          </td>

          <td style="padding:14px;">
            <strong>
              ${escapeHtml(
                customer
              )}
            </strong>

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.78rem;
              "
            >
              ${escapeHtml(
                booking.userPhone ||
                  booking.phone ||
                  booking.userEmail ||
                  "—"
              )}
            </span>
          </td>

          <td style="padding:14px;">
            ${escapeHtml(
              vehicle
            )}

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.78rem;
              "
            >
              ${escapeHtml(
                booking.vehicleReg ||
                  booking.registration ||
                  booking.regNumber ||
                  "—"
              )}
            </span>
          </td>

          <td
            style="
              padding:14px;
              color:var(--accent);
              font-weight:700;
            "
          >
            ${formatINR(
              amount
            )}
          </td>

          <td style="padding:14px;">
            <span
              class="fleet-status ${getStatusClass(
                booking.paymentStatus === 'rejected' ? 'rejected' : status
              )}"
            >
              ${booking.paymentStatus === 'rejected'
                ? 'Payment Rejected'
                : escapeHtml(status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))}
            </span>
          </td>

          <td
            style="
              padding:14px;
              text-align:right;
            "
          >

            <button
              type="button"
              class="btn btn-outline booking-details-btn"
              data-target="${escapeHtml(
                rowId
              )}"
              data-bid="${escapeHtml(
                id
              )}"
              style="
                padding:6px 12px;
                font-size:.8rem;
              "
            >
              ${
                expandedBookingId === id
                  ? "Details ▲"
                  : "Details ▼"
              }
            </button>

          </td>

        </tr>

        <tr
          id="${escapeHtml(
            rowId
          )}"
          class="booking-detail-row"
          ${
            expandedBookingId === id
              ? ""
              : "hidden"
          }
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
            background:
              rgba(255,255,255,.02);
          "
        >

          <td
            colspan="7"
            style="
              padding:20px;
            "
          >

            <div
              style="
                display:grid;
                grid-template-columns:
                  repeat(
                    auto-fit,
                    minmax(210px,1fr)
                  );
                gap:16px;
              "
            >

              <!-- CUSTOMER -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Customer Email
                </span>

                ${escapeHtml(
                  booking.userEmail ||
                    booking.email ||
                    "—"
                )}
              </div>

              <!-- VEHICLE -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Vehicle Registration
                </span>

                ${escapeHtml(
                  booking.vehicleReg ||
                    booking.registration ||
                    booking.regNumber ||
                    "—"
                )}
              </div>

              <!-- PICKUP -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Pickup Date
                </span>

                ${formatDate(
                  booking.pickupDate ||
                    booking.bookingDate
                )}
              </div>

              <!-- RETURN -->

              <div>
                <span style="display:block;color:var(--sub);font-size:.75rem;margin-bottom:4px;">
                  Pickup Handover
                </span>
                ${escapeHtml(
                  String(booking.pickupStatus || "awaiting pickup")
                    .replaceAll("_", " ")
                    .replace(/\b\w/g, (letter) => letter.toUpperCase())
                )}
              </div>

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Return Date
                </span>

                ${formatDate(
                  booking.dropDate ||
                    booking.returnDate
                )}
              </div>

              <!-- PAYMENT -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Payment
                </span>

                ${paymentStatusText(
                  booking
                )}
              </div>

              <!-- START ODO -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  Start Odometer (KM)
                </label>

                <input
                  type="number"
                  min="0"
                  class="booking-start-odo"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    startOdo
                  )}"
                  placeholder="Start KM"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- END ODO -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  End Odometer (KM)
                </label>

                <input
                  type="number"
                  min="0"
                  class="booking-end-odo"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    endOdo
                  )}"
                  placeholder="End KM"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- FASTAG AT START -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  FASTag at Start (₹)
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  class="booking-start-fastag"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    startFastag
                  )}"
                  placeholder="Start balance"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- FASTAG AT RETURN -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  FASTag at Return (₹)
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  class="booking-return-fastag"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    returnFastag
                  )}"
                  placeholder="Return balance"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- DISTANCE -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Distance Driven
                </span>

                <strong
                  class="booking-distance"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  style="
                    color:var(--accent);
                    font-size:1.1rem;
                  "
                >
                  ${
                    distance !== null
                      ? `${distance} KM`
                      : "Not calculated"
                  }
                </strong>
              </div>

            </div>

            <!-- DETAIL ACTIONS -->

            <div
              style="
                display:flex;
                gap:10px;
                flex-wrap:wrap;
                align-items:center;
                margin-top:20px;
                padding-top:16px;
                border-top:
                  1px dashed var(--line);
              "
            >

              <button
                type="button"
                class="btn btn-dark save-booking-odo-btn"
                data-bid="${escapeHtml(
                  id
                )}"
                style="
                  padding:7px 14px;
                  font-size:.8rem;
                "
              >
                Save Odometer
              </button>

              <button
                type="button"
                class="btn btn-dark save-booking-fastag-btn"
                data-bid="${escapeHtml(
                  id
                )}"
                style="
                  padding:7px 14px;
                  font-size:.8rem;
                "
              >
                Save FASTag
              </button>

              ${
                status ===
                "pending_payment"
                  ? `
                    <select
                      class="kr-clean-input booking-status-select"
                      data-bid="${escapeHtml(id)}"
                      style="width: auto; min-width: 170px; height: 38px;"
                    >
                      <option value="pending_payment" selected>Pending Payment</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  `
                  : ""
              }

              ${
                status ===
                "confirmed"
                  ? `
                    <select
                      class="kr-clean-input booking-status-select"
                      data-bid="${escapeHtml(id)}"
                      style="width: auto; min-width: 170px; height: 38px;"
                    >
                      <option value="confirmed" selected>Confirmed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  `
                  : ""
              }

              ${returnButton}

              <button
                type="button"
                class="btn btn-outline admin-edit-booking-row-btn"
                data-bid="${escapeHtml(id)}"
                style="padding:7px 14px;font-size:.8rem;display:inline-flex;align-items:center;gap:6px;"
              >
                <i class="ri-edit-line"></i> Edit Booking
              </button>

              <button
                type="button"
                class="btn btn-primary admin-invoice-row-btn"
                data-bid="${escapeHtml(id)}"
                style="padding:7px 14px;font-size:.8rem;display:inline-flex;align-items:center;gap:6px;"
              >
                <i class="ri-file-text-line"></i> Manage Invoice
              </button>

              ${Array.isArray(booking.pickupPhotoMediaIds) && booking.pickupPhotoMediaIds.length
                ? `
                  <button
                    type="button"
                    class="btn btn-outline admin-view-pickup-photos-btn"
                    data-bid="${escapeHtml(id)}"
                    style="padding:7px 14px;font-size:.8rem;"
                  >
                    Pickup Photos (${booking.pickupPhotoMediaIds.length})
                  </button>
                `
                : ""}

            </div>

          </td>

        </tr>
      `;
    }
  );

  html += `
        </tbody>
      </table>

    </div>
    ${renderAdminPagination({
      page: adminBookingPage,
      totalPages,
      totalItems: bookings.length,
      type: "bookings"
    })}
  `;

  bookingsTableWrap.innerHTML = html;
  attachBookingEvents();

  bookingsTableWrap
    .querySelectorAll("[data-admin-bookings-page-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        adminBookingPage +=
          button.dataset.adminBookingsPageAction === "next" ? 1 : -1;
        renderBookingsTable(getFilteredBookings());
        bookingsTableWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
}

function renderAdminPagination({ page, totalPages, totalItems, type }) {
  if (totalPages <= 1) return "";

  const attribute = `data-admin-${type}-page-action`;

  return `
    <nav class="data-pagination" aria-label="${escapeHtml(type)} pages" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(6,10,16,0.6);border:1px solid var(--kr-border);border-radius:var(--kr-radius-md);">
      <span class="data-pagination__summary" style="font-size:0.85rem;color:var(--kr-text-muted);">
        Page <strong style="color:var(--kr-text);">${page}</strong> of <strong style="color:var(--kr-text);">${totalPages}</strong> · ${totalItems} ${escapeHtml(type)}
      </span>
      <div class="data-pagination__actions" style="display:flex;gap:8px;">
        <button type="button" class="btn btn-outline" style="padding:6px 14px;font-size:0.82rem;" ${attribute}="previous" ${page === 1 ? "disabled" : ""}>Previous</button>
        <button type="button" class="btn btn-outline" style="padding:6px 14px;font-size:0.82rem;" ${attribute}="next" ${page === totalPages ? "disabled" : ""}>Next</button>
      </div>
    </nav>`;
}

// ============================================================================
// BOOKING EVENTS
// ============================================================================

async function openAdminPickupPhotos(booking) {
  document.getElementById("adminPickupPhotosModal")?.remove();

  const mediaIds = Array.isArray(booking.pickupPhotoMediaIds)
    ? booking.pickupPhotoMediaIds
    : [];
  const modal = document.createElement("div");
  modal.id = "adminPickupPhotosModal";
  modal.style.cssText = `
    position:fixed;inset:0;z-index:99999;display:flex;align-items:center;
    justify-content:center;padding:20px;background:rgba(0,0,0,.88);
    backdrop-filter:blur(10px);
  `;
  modal.innerHTML = `
    <div class="card" style="width:min(820px,100%);max-height:90vh;overflow:auto;padding:26px;position:relative;">
      <button id="closeAdminPickupPhotos" type="button" style="position:absolute;top:14px;right:16px;border:0;background:transparent;color:var(--text);font-size:1.7rem;cursor:pointer;">&times;</button>
      <h3 style="margin:0 40px 6px 0;">Pickup Condition Photos</h3>
      <p style="margin:0 0 18px;color:var(--sub);">
        ${escapeHtml(booking.vehicleName || "Vehicle")} · Booking #${escapeHtml(formatBookingNumber(booking))}
      </p>
      <div id="adminPickupPhotosGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;">
        Loading protected pickup photos...
      </div>
      ${booking.pickupNotes ? `<div style="margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:10px;"><strong>Pickup notes</strong><p style="margin:6px 0 0;color:var(--sub);">${escapeHtml(booking.pickupNotes)}</p></div>` : ""}
    </div>
  `;

  document.body.appendChild(modal);
  const objectUrls = [];
  let closed = false;
  const close = () => {
    closed = true;
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    modal.remove();
  };
  modal.querySelector("#closeAdminPickupPhotos")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  const photos = await Promise.all(
    mediaIds.map(async (mediaId) => {
      try {
        const url = await fetchMediaBlobUrl(mediaId);
        if (closed) {
          URL.revokeObjectURL(url);
          return "";
        }
        objectUrls.push(url);
        return `<img src="${escapeHtml(url)}" alt="Pickup condition" style="width:100%;height:210px;object-fit:cover;border-radius:10px;border:1px solid var(--line);" />`;
      } catch (error) {
        console.error("PICKUP PHOTO LOAD ERROR:", error);
        return `<div style="padding:18px;color:#ef476f;border:1px solid var(--line);border-radius:10px;">Photo unavailable</div>`;
      }
    })
  );

  const grid = modal.querySelector("#adminPickupPhotosGrid");
  if (grid?.isConnected) {
    grid.innerHTML = photos.filter(Boolean).join("") ||
      `<p style="color:var(--sub);">No pickup photos available.</p>`;
  }
}

function attachBookingEvents() {
  bookingsTableWrap
    .querySelectorAll(".admin-edit-booking-row-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const bid = button.dataset.bid;
        const booking = bookingsData.find(
          (item) => item.id === bid || item.bookingNumber === bid
        );
        if (booking) {
          openAdminEditBookingModal(booking);
        } else {
          openAdminEditBookingModal({ id: bid, bookingNumber: bid });
        }
      });
    });

  bookingsTableWrap
    .querySelectorAll(".admin-invoice-row-btn")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const bid = button.dataset.bid;
        if (bid) await openInvoiceEditorModal(bid, button);
      });
    });

  bookingsTableWrap
    .querySelectorAll(".admin-view-pickup-photos-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const booking = bookingsData.find(
          (item) => item.id === button.dataset.bid
        );
        if (booking) openAdminPickupPhotos(booking);
      });
    });

  // DETAILS
  bookingsTableWrap
    .querySelectorAll(
      ".booking-details-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const id =
            button.dataset.bid;

          const row =
            document.getElementById(
              button.dataset.target
            );

          if (!row) {
            console.error(
              "Booking detail row missing:",
              button.dataset.target
            );

            return;
          }

          const isHidden =
            row.hidden;

          row.hidden =
            !isHidden;

          expandedBookingId =
            isHidden
              ? id
              : null;

          button.textContent =
            isHidden
              ? "Details ▲"
              : "Details ▼";
        }
      );
    });

  // ODOMETER SAVE
  bookingsTableWrap
    .querySelectorAll(
      ".save-booking-odo-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          await saveBookingOdometer(
            button.dataset.bid,
            button
          );
        }
      );
    });

  // FASTAG SAVE
  bookingsTableWrap
    .querySelectorAll(
      ".save-booking-fastag-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          await saveBookingFastag(
            button.dataset.bid,
            button
          );
        }
      );
    });

  // STATUS
  bookingsTableWrap
    .querySelectorAll(
      ".booking-status-select"
    )
    .forEach((select) => {
      select.addEventListener(
        "change",
        async () => {
          const bid =
            select.dataset.bid;

          const newStatus =
            select.value;

          const booking =
            bookingsData.find(
              (item) =>
                item.id === bid
            );

          if (!booking) {
            return;
          }

          const oldStatus =
            booking.status;

          booking.status =
            newStatus;

          try {
            await api.put(`/bookings/${bid}`, {
              status: newStatus
            });

            renderBookingsTable(
              getFilteredBookings()
            );

            updateRevenueStats();

          } catch (error) {
            console.error(
              "BOOKING STATUS ERROR:",
              error
            );

            booking.status =
              oldStatus;

            select.value =
              oldStatus;

            alert(
              "Could not update booking status.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // PROCESS RETURN
  bookingsTableWrap
    .querySelectorAll(
      ".process-return-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const bid =
            button.dataset.bid;

          const booking =
            bookingsData.find(
              (item) =>
                item.id === bid
            );

          if (!booking) {
            alert(
              "Booking not found."
            );

            return;
          }

          try {
            openReturnModal({
              booking,
              currentUser,

              onSaved:
                async () => {
                  await loadBookings();
                },
            });

            /*
             * The external return-inspection.js
             * may set style.display but leave
             * the hidden attribute on the modal.
             *
             * Force it open.
             */

            setTimeout(
              () => {
                const modal =
                  $("returnModal");

                if (modal) {
                  modal.hidden =
                    false;

                  modal.removeAttribute(
                    "hidden"
                  );

                  modal.style.display =
                    "flex";
                }
              },
              50
            );

          } catch (error) {
            console.error(
              "RETURN MODAL ERROR:",
              error
            );

            alert(
              "Could not open return inspection.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // VIEW RETURN REPORT
  bookingsTableWrap
    .querySelectorAll(
      ".view-return-report-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const bid =
            button.dataset.bid;

          const booking =
            bookingsData.find(
              (item) =>
                item.id === bid
            );

          if (!booking) {
            alert(
              "Booking not found."
            );

            return;
          }

          openReturnReport(
            booking
          );
        }
      );
    });
}

// ============================================================================
// SAVE ODOMETER
// ============================================================================

async function saveBookingOdometer(
  bookingId,
  button
) {
  const startInput =
    bookingsTableWrap.querySelector(
      `.booking-start-odo[data-bid="${bookingId}"]`
    );

  const endInput =
    bookingsTableWrap.querySelector(
      `.booking-end-odo[data-bid="${bookingId}"]`
    );

  if (
    !startInput ||
    !endInput
  ) {
    alert(
      "Odometer fields could not be found."
    );

    return;
  }

  const startText =
    startInput.value.trim();

  const endText =
    endInput.value.trim();

  const start =
    startText === ""
      ? null
      : Number(startText);

  const end =
    endText === ""
      ? null
      : Number(endText);

  if (
    start !== null &&
    (
      !Number.isFinite(start) ||
      start < 0
    )
  ) {
    alert(
      "Enter a valid start odometer."
    );

    return;
  }

  if (
    end !== null &&
    (
      !Number.isFinite(end) ||
      end < 0
    )
  ) {
    alert(
      "Enter a valid end odometer."
    );

    return;
  }

  if (
    start !== null &&
    end !== null &&
    end < start
  ) {
    alert(
      "End odometer cannot be less than start odometer."
    );

    return;
  }

  const oldText =
    button.textContent;

  button.disabled =
    true;

  button.textContent =
    "Saving...";

  try {
    await api.put(`/bookings/${bookingId}`, {
      odometerStart: start,
      odometerEnd: end,
      startOdometer: start,
      endOdometer: end
    });

    const booking =
      bookingsData.find(
        (item) =>
          item.id ===
          bookingId
      );

    if (booking) {
      booking.odometerStart =
        start;

      booking.odometerEnd =
        end;

      booking.startOdometer =
        start;

      booking.endOdometer =
        end;
    }

    const distance =
      calculateDistance(
        start,
        end
      );

    const distanceEl =
      bookingsTableWrap.querySelector(
        `.booking-distance[data-bid="${bookingId}"]`
      );

    if (distanceEl) {
      distanceEl.textContent =
        distance !== null
          ? `${distance} KM`
          : "Not calculated";
    }

    button.textContent =
      "Saved";

    setTimeout(
      () => {
        button.textContent =
          oldText;

        button.disabled =
          false;
      },
      1200
    );

  } catch (error) {
    console.error(
      "ODOMETER SAVE ERROR:",
      error
    );

    button.textContent =
      oldText;

    button.disabled =
      false;

    alert(
      "Could not save odometer readings.\n\n" +
      error.message
    );
  }
}

// ============================================================================
// SAVE FASTAG BALANCES
// ============================================================================

async function saveBookingFastag(
  bookingId,
  button
) {
  const startInput =
    bookingsTableWrap.querySelector(
      `.booking-start-fastag[data-bid="${bookingId}"]`
    );

  const returnInput =
    bookingsTableWrap.querySelector(
      `.booking-return-fastag[data-bid="${bookingId}"]`
    );

  if (!startInput || !returnInput) {
    alert(
      "FASTag fields could not be found."
    );

    return;
  }

  const startText =
    startInput.value.trim();

  const returnText =
    returnInput.value.trim();

  const start =
    startText === ""
      ? null
      : Number(startText);

  const returned =
    returnText === ""
      ? null
      : Number(returnText);

  if (
    start !== null &&
    (!Number.isFinite(start) || start < 0)
  ) {
    alert(
      "Enter a valid FASTag balance at start."
    );

    return;
  }

  if (
    returned !== null &&
    (!Number.isFinite(returned) || returned < 0)
  ) {
    alert(
      "Enter a valid FASTag balance at return."
    );

    return;
  }

  const oldText =
    button.textContent;

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await api.put(`/bookings/${bookingId}`, {
      fastagStart: start,
      fastagReturn: returned,
      startFastag: start,
      returnFastag: returned
    });

    const booking =
      bookingsData.find(
        (item) => item.id === bookingId
      );

    if (booking) {
      booking.fastagStart = start;
      booking.fastagReturn = returned;
      booking.startFastag = start;
      booking.returnFastag = returned;
    }

    button.textContent = "Saved";

    setTimeout(
      () => {
        button.textContent = oldText;
        button.disabled = false;
      },
      1200
    );
  } catch (error) {
    console.error(
      "FASTAG SAVE ERROR:",
      error
    );

    button.textContent = oldText;
    button.disabled = false;

    alert(
      "Could not save FASTag balances.\n\n" +
      error.message
    );
  }
}

// ============================================================================
// RETURN REPORT
//
// This is intentionally separate from Process Return.
// Completed bookings use this viewer instead of trying to
// run the inspection process again.
// ============================================================================

function openReturnReport(
  booking
) {
  const inspection =
    booking.returnInspection;

  if (!inspection) {
    alert(
      "No return inspection report exists for this booking."
    );

    return;
  }

  const existing =
    document.getElementById(
      "adminReturnReportModal"
    );

  if (existing) {
    existing.remove();
  }

  const rawDeductions =
    Array.isArray(
      inspection.items
    )
      ? inspection.items
      : Array.isArray(
          inspection.deductions
        )
        ? inspection.deductions
        : [];

  const deductions = rawDeductions.filter((item) => {
    if (typeof item === "string") return true;
    return item.checked === true || item.checked === "true";
  });

  const deposit =
    Number(
      inspection.originalDeposit ??
        inspection.securityDeposit ??
        booking.securityDeposit ??
        0
    );

  const calculatedDeductions = deductions.reduce(
    (sum, item) =>
      sum +
      Number(
        item.amount ||
          item.deduction ||
          0
      ),
    0
  );

  const totalDeduction =
    Number(
      inspection.totalDeductions ??
        inspection.deductionTotal ??
        calculatedDeductions
    );

  const refund =
    Math.max(
      0,
      deposit -
        totalDeduction
    );

  const notes =
    inspection.invoiceNotes ||
    inspection.notes ||
    booking.returnNotes ||
    "No inspection notes.";

  const returnPhotoRefs =
    Array.isArray(inspection.returnPhotoMediaIds) && inspection.returnPhotoMediaIds.length
      ? inspection.returnPhotoMediaIds.map((mediaId, index) => ({
          mediaId,
          name: `Photo ${index + 1}`,
        }))
      : Array.isArray(inspection.photos)
        ? inspection.photos
        : Array.isArray(inspection.returnPhotos)
          ? inspection.returnPhotos
          : [];

  const startOdo =
    getStartOdometer(
      booking
    );

  const endOdo =
    getEndOdometer(
      booking
    );

  const distance =
    calculateDistance(
      startOdo,
      endOdo
    );

  const startFastag =
    getStartFastag(
      booking
    );

  const returnFastag =
    getReturnFastag(
      booking
    );

  let deductionHtml = "";

  if (!deductions.length) {
    deductionHtml =
      `
        <div
          style="
            padding:16px;
            color:var(--sub);
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          No damage deductions recorded.
        </div>
      `;
  } else {
    deductionHtml =
      deductions
        .map(
          (item) => `
            <div
              style="
                display:flex;
                justify-content:space-between;
                gap:20px;
                padding:12px 0;
                border-bottom:1px solid var(--line);
              "
            >
              <span>
                ${escapeHtml(
                  item.label ||
                    item.name ||
                    item.description ||
                    "Inspection item"
                )}
              </span>

              <strong
                style="
                  color:#ef476f;
                "
              >
                ${formatINR(
                  item.amount ||
                    item.deduction ||
                    0
                )}
              </strong>
            </div>
          `
        )
        .join("");
  }

  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "adminReturnReportModal";

  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:99999;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    background:rgba(0,0,0,.88);
    backdrop-filter:blur(10px);
  `;

  modal.innerHTML = `
    <div
      class="card"
      style="
        width:100%;
        max-width:700px;
        max-height:90vh;
        overflow-y:auto;
        padding:28px;
        position:relative;
      "
    >

      <button
        type="button"
        id="closeAdminReturnReport"
        style="
          position:absolute;
          top:15px;
          right:18px;
          background:none;
          border:none;
          color:var(--text);
          font-size:1.8rem;
          cursor:pointer;
        "
      >
        &times;
      </button>

      <div
        style="
          margin-bottom:20px;
        "
      >
        <span
          class="section-label"
        >
          Completed Return
        </span>

        <h2
          style="
            margin:5px 0 8px;
          "
        >
          Return Inspection Report
        </h2>

        <p
          style="
            color:var(--sub);
            margin:0;
          "
        >
          Booking #${escapeHtml(formatBookingNumber(booking))}
        </p>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(180px,1fr)
            );
          gap:12px;
          margin-bottom:20px;
        "
      >

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Customer
          </span>

          <strong>
            ${escapeHtml(
              booking.userName ||
                booking.customerName ||
                "Customer"
            )}
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Vehicle
          </span>

          <strong>
            ${escapeHtml(
              booking.vehicleName ||
                booking.carName ||
                "Vehicle"
            )}
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Start Odometer
          </span>

          <strong>
            ${
              startOdo !== ""
                ? `${escapeHtml(
                    startOdo
                  )} KM`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            End Odometer
          </span>

          <strong>
            ${
              endOdo !== ""
                ? `${escapeHtml(
                    endOdo
                  )} KM`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            FASTag at Start
          </span>

          <strong>
            ${
              startFastag !== ""
                ? `₹${escapeHtml(
                    startFastag
                  )}`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            FASTag at Return
          </span>

          <strong>
            ${
              returnFastag !== ""
                ? `₹${escapeHtml(
                    returnFastag
                  )}`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Distance Driven
          </span>

          <strong
            style="
              color:var(--accent);
            "
          >
            ${
              distance !== null
                ? `${distance} KM`
                : "—"
            }
          </strong>
        </div>

      </div>

      <h3
        style="
          margin-bottom:12px;
        "
      >
        Inspection / Deductions
      </h3>

      ${deductionHtml}

      ${
        returnPhotoRefs.length
          ? `
            <div
              style="
                margin-top:20px;
              "
            >
              <h3
                style="
                  margin-bottom:12px;
                "
              >
                Return Photos
              </h3>

              <div id="adminReturnPhotosGrid"
                style="
                  display:grid;
                  grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
                  gap:12px;
                "
              >
                <div class="manager-state">Loading return photos...</div>
              </div>
            </div>
          `
          : ""
      }

      <div
        style="
          margin-top:20px;
          padding:16px;
          border-top:1px solid var(--line);
        "
      >

        <div
          style="
            display:flex;
            justify-content:space-between;
            margin-bottom:10px;
          "
        >
          <span>
            Original Security Deposit
          </span>

          <strong>
            ${formatINR(
              deposit
            )}
          </strong>
        </div>

        <div
          style="
            display:flex;
            justify-content:space-between;
            margin-bottom:10px;
          "
        >
          <span>
            Total Deductions
          </span>

          <strong
            style="
              color:#ef476f;
            "
          >
            ${formatINR(
              totalDeduction
            )}
          </strong>
        </div>

        <div
          style="
            display:flex;
            justify-content:space-between;
            font-size:1.15rem;
            padding-top:12px;
            border-top:1px solid var(--line);
          "
        >
          <span>
            Refundable Customer Amount
          </span>

          <strong
            style="
              color:var(--accent);
            "
          >
            ${formatINR(
              refund
            )}
          </strong>
        </div>

      </div>

      <div
        style="
          margin-top:20px;
          padding:16px;
          border:1px solid var(--line);
          border-radius:10px;
        "
      >
        <span
          style="
            display:block;
            color:var(--sub);
            font-size:.75rem;
            margin-bottom:7px;
          "
        >
          Invoice / Inspection Notes
        </span>

        <div
          style="
            line-height:1.7;
          "
        >
          ${escapeHtml(
            notes
          )}
        </div>
      </div>

      <div
        style="
          display:flex;
          justify-content:flex-end;
          margin-top:22px;
        "
      >
        <button
          type="button"
          id="closeAdminReturnReportBottom"
          class="btn btn-dark"
        >
          Close Report
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(
    modal
  );

  if (returnPhotoRefs.length) {
    (async () => {
      const grid = modal.querySelector("#adminReturnPhotosGrid");
      if (!grid) return;

      const photos = await Promise.all(
        returnPhotoRefs.map(async (photo, index) => {
          try {
            if (photo.mediaId) {
              const url = await fetchMediaBlobUrl(photo.mediaId);
              return { url, name: photo.name || `Photo ${index + 1}` };
            }

            const url =
              typeof photo === "string"
                ? photo
                : photo?.url || photo?.downloadURL || photo?.src || "";

            if (!url) return null;

            return { url, name: photo?.name || `Photo ${index + 1}` };
          } catch {
            return null;
          }
        })
      );

      if (!grid.isConnected) return;

      const rendered = photos
        .filter(Boolean)
        .map(
          (photo, index) => `
            <figure
              style="
                margin:0;
                overflow:hidden;
                border:1px solid var(--line);
                border-radius:12px;
                background:rgba(255,255,255,.02);
              "
            >
              <img
                src="${escapeHtml(photo.url)}"
                alt="${escapeHtml(photo.name || `Photo ${index + 1}`)}"
                style="display:block;width:100%;height:170px;object-fit:cover;background:#080808;"
              />
              <figcaption
                style="
                  padding:8px 10px;
                  color:var(--sub);
                  font-size:.74rem;
                  letter-spacing:.03em;
                  text-transform:uppercase;
                "
              >
                ${escapeHtml(photo.name || `Photo ${index + 1}`)}
              </figcaption>
            </figure>
          `
        )
        .join("");

      grid.innerHTML = rendered || `<div class="manager-state">No return photos available.</div>`;
    })();
  }

  const close = () => {
    modal.remove();
  };

  $("closeAdminReturnReport")
    ?.addEventListener(
      "click",
      close
    );

  $("closeAdminReturnReportBottom")
    ?.addEventListener(
      "click",
      close
    );

  modal.addEventListener(
    "click",
    (event) => {
      if (
        event.target ===
        modal
      ) {
        close();
      }
    }
  );
}

// ============================================================================
// PAYMENT
// ============================================================================

async function loadPayments() {
  if (paymentsTableWrap) {
    paymentsTableWrap.innerHTML = `<p style="color:var(--sub);">Loading payments...</p>`;
  }
  try {
    const res = await api.get("/payments");
    const rawP = Array.isArray(res.payments) ? res.payments : [];
    const seenP = new Set();
    paymentsData = [];
    rawP.forEach((p) => {
      const key = String(p.paymentId || p.id || p.utr || "").trim().toUpperCase();
      if (key && !seenP.has(key)) {
        seenP.add(key);
        paymentsData.push(p);
      }
    });
    renderPaymentsTable();
  } catch (err) {
    console.error("LOAD PAYMENTS ERROR:", err);
    if (paymentsTableWrap) {
      paymentsTableWrap.innerHTML = `<p style="color:#ff5c77;">Unable to load payments: ${escapeHtml(err.message)}</p>`;
    }
  }
}

async function loadPaymentData() {
  await loadPayments();
}

function renderPaymentsTable() {
  if (!paymentsTableWrap) {
    return;
  }

  // Combine paymentsData and any fallback booking payments
  let paymentRecords = [...paymentsData];

  if (!paymentRecords.length) {
    paymentRecords = bookingsData
      .filter((b) =>
        b.paymentStatus === "pending_verification" ||
        b.paymentStatus === "paid" ||
        b.paymentStatus === "advance_paid" ||
        b.paymentRef ||
        b.paymentScreenshotUrl
      )
      .map((b) => ({
        id: b.id || b.bookingId,
        bookingId: b.id || b.bookingId,
        bookingNumber: b.bookingNumber || b.id || b.bookingId,
        userName: b.userName || "Customer",
        userEmail: b.userEmail || "",
        userPhone: b.userPhone || "",
        vehicleName: b.vehicleName || "Vehicle",
        vehicleReg: b.vehicleReg || "",
        amount: Number(b.paymentAmountPaid || b.advanceAmount || b.totalAmount || 0),
        method: b.paymentMethod || "UPI",
        utr: b.paymentRef || "",
        paymentRef: b.paymentRef || "",
        screenshotUrl: b.paymentScreenshotUrl || "",
        status: b.paymentStatus === "paid" || b.paymentStatus === "advance_paid" || b.status === "confirmed" ? "verified" : b.paymentStatus === "rejected" ? "rejected" : "pending",
        createdAt: b.createdAt || b.pickupDate || ""
      }));
  }

  if (!paymentRecords.length) {
    paymentsTableWrap.innerHTML = `<p style="color:var(--sub);padding:24px;text-align:center;">No payment receipts awaiting verification.</p>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(paymentRecords.length / ADMIN_PAYMENTS_PER_PAGE));
  adminPaymentPage = Math.max(1, Math.min(adminPaymentPage, totalPages));
  const pageStart = (adminPaymentPage - 1) * ADMIN_PAYMENTS_PER_PAGE;
  const pagePayments = paymentRecords.slice(pageStart, pageStart + ADMIN_PAYMENTS_PER_PAGE);

  let html = `
    <div style="width:100%;overflow-x:auto;">
      <table class="admin-table" style="width:100%;min-width:920px;border-collapse:collapse;text-align:left;">
        <thead>
          <tr style="border-bottom:1px solid var(--line);color:var(--sub);font-size:12px;text-transform:uppercase;">
            <th style="padding:12px;">Date</th>
            <th style="padding:12px;">Booking</th>
            <th style="padding:12px;">Customer</th>
            <th style="padding:12px;">Vehicle</th>
            <th style="padding:12px;">Amount</th>
            <th style="padding:12px;">Method / UTR</th>
            <th style="padding:12px;">Status</th>
            <th style="padding:12px;text-align:right;">Action</th>
          </tr>
        </thead>
        <tbody>
  `;

  pagePayments.forEach((p) => {
    const bookingId = p.bookingId || p.id || p.bookingNumber;
    const matchingBooking = bookingsData.find(
      (b) => b.id === bookingId || b.bookingNumber === bookingId || (b.id && p.id && b.id === p.id) || (b.bookingId && p.bookingId && b.bookingId === p.bookingId)
    );

    const pStatus = String(p.status || "").toLowerCase();
    const bStatus = String(matchingBooking?.status || "").toLowerCase();
    const bPayStatus = String(matchingBooking?.paymentStatus || "").toLowerCase();

    const isVerified =
      ["verified", "approved", "paid", "advance_paid", "confirmed", "completed"].includes(pStatus) ||
      ["verified", "approved", "paid", "advance_paid", "confirmed", "completed"].includes(bPayStatus) ||
      ["verified", "approved", "paid", "advance_paid", "confirmed", "completed"].includes(bStatus);

    const isRejected =
      ["rejected", "cancelled", "failed"].includes(pStatus) ||
      ["rejected", "cancelled", "failed"].includes(bPayStatus) ||
      ["rejected", "cancelled", "failed"].includes(bStatus);


    const statusClass = isVerified ? "verified" : isRejected ? "rejected" : "pending";
    const statusLabel = isVerified ? "VERIFIED" : isRejected ? "REJECTED" : "PENDING";
    const paymentDate = formatDate(p.createdAt || p.date || (matchingBooking && (matchingBooking.createdAt || matchingBooking.pickupDate)));
    const targetBid = matchingBooking ? (matchingBooking.id || matchingBooking.bookingNumber) : bookingId;

    let actionsHtml = "";
    if (isVerified) {
      actionsHtml = `
        <div style="display:inline-flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary edit-invoice-btn" data-bid="${escapeHtml(targetBid)}" title="Generate or Edit Invoice" style="padding:5px 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
            <i class="ri-file-text-line"></i> Invoice
          </button>
          <button type="button" class="btn btn-outline edit-booking-btn" data-bid="${escapeHtml(targetBid)}" title="Edit Booking Details" style="padding:5px 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
            <i class="ri-edit-line"></i> Edit
          </button>
          <button type="button" class="btn btn-dark review-payment-btn" data-pid="${escapeHtml(p.id || p.paymentId || targetBid)}" data-bid="${escapeHtml(targetBid)}" title="View Payment Proof & Receipt" style="padding:5px 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
            <i class="ri-eye-line"></i> Receipt
          </button>
        </div>
      `;
    } else if (isRejected) {
      actionsHtml = `
        <div style="display:inline-flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">
          <button type="button" class="btn btn-outline edit-booking-btn" data-bid="${escapeHtml(targetBid)}" title="Edit Booking Details" style="padding:5px 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
            <i class="ri-edit-line"></i> Edit
          </button>
          <button type="button" class="btn btn-dark review-payment-btn" data-pid="${escapeHtml(p.id || p.paymentId || targetBid)}" data-bid="${escapeHtml(targetBid)}" title="Review Rejected Payment" style="padding:5px 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
            <i class="ri-refresh-line"></i> Review
          </button>
        </div>
      `;
    } else {
      actionsHtml = `
        <div style="display:inline-flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary review-payment-btn" data-pid="${escapeHtml(p.id || p.paymentId || targetBid)}" data-bid="${escapeHtml(targetBid)}" title="Review and Approve Payment" style="padding:5px 12px;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
            <i class="ri-shield-check-line"></i> Review
          </button>
          <button type="button" class="btn btn-outline edit-booking-btn" data-bid="${escapeHtml(targetBid)}" title="Edit Booking Details" style="padding:5px 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
            <i class="ri-edit-line"></i> Edit
          </button>
        </div>
      `;
    }

    html += `
      <tr style="border-bottom:1px solid rgba(255,255,255,.06);font-size:13.5px;">
        <td style="padding:12px;color:var(--sub);white-space:nowrap;">${escapeHtml(paymentDate)}</td>
        <td style="padding:12px;font-family:monospace;font-weight:700;color:var(--accent);">#${escapeHtml(p.bookingNumber || p.bookingId || p.id)}</td>
        <td style="padding:12px;">
          <strong style="color:#fff;">${escapeHtml(p.userName || (matchingBooking && (matchingBooking.userName || matchingBooking.name)) || "Customer")}</strong><br/>
          <small style="color:#4fd7ff;font-size:12px;">${escapeHtml(p.userEmail || (matchingBooking && (matchingBooking.userEmail || matchingBooking.email)) || "")}</small>
          ${(p.userPhone || (matchingBooking && (matchingBooking.userPhone || matchingBooking.phone))) ? `<br/><small style="color:var(--sub);font-size:11.5px;">${escapeHtml(p.userPhone || (matchingBooking && (matchingBooking.userPhone || matchingBooking.phone)))}</small>` : ""}
        </td>
        <td style="padding:12px;">
          <strong>${escapeHtml(p.vehicleName || (matchingBooking && (matchingBooking.vehicleName || matchingBooking.carName)) || "Vehicle")}</strong>
          ${(p.vehicleReg || (matchingBooking && (matchingBooking.vehicleReg || matchingBooking.registration))) ? `<br/><small style="color:var(--sub);font-family:monospace;">${escapeHtml(p.vehicleReg || (matchingBooking && (matchingBooking.vehicleReg || matchingBooking.registration)))}</small>` : ""}
        </td>
        <td style="padding:12px;font-weight:700;color:#fff;">${formatINR(p.amount || (matchingBooking && (matchingBooking.paymentAmountPaid || matchingBooking.advanceAmount || matchingBooking.totalAmount)) || 0)}</td>
        <td style="padding:12px;font-family:monospace;">
          <span style="font-size:11px;text-transform:uppercase;background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;">${escapeHtml(p.method || (matchingBooking && matchingBooking.paymentMethod) || "UPI")}</span><br/>
          ${escapeHtml(p.utr || p.paymentRef || (matchingBooking && matchingBooking.paymentRef) || "No UTR")}
        </td>
        <td style="padding:12px;">
          <span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
        </td>
        <td style="padding:12px;text-align:right;">
          ${actionsHtml}
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
    ${renderAdminPagination({
      page: adminPaymentPage,
      totalPages,
      totalItems: paymentRecords.length,
      type: "payments"
    })}
  `;

  paymentsTableWrap.innerHTML = html;

  paymentsTableWrap.querySelectorAll(".review-payment-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const pid = button.dataset.pid;
      const bid = button.dataset.bid;
      const payment = paymentsData.find((item) => item.id === pid || item.bookingId === bid || item.id === bid) ||
                      bookingsData.find((item) => item.id === bid || item.bookingNumber === bid || item.id === pid);
      if (payment) openPaymentModal(payment);
    });
  });

  paymentsTableWrap.querySelectorAll(".edit-invoice-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const bid = button.dataset.bid;
      if (bid) await openInvoiceEditorModal(bid, button);
    });
  });

  paymentsTableWrap.querySelectorAll(".edit-booking-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const bid = button.dataset.bid;
      const bk = bookingsData.find((item) => item.id === bid || item.bookingNumber === bid) ||
                 paymentsData.find((item) => item.bookingId === bid || item.id === bid);
      if (bk) {
        openAdminEditBookingModal(bk);
      } else {
        openAdminEditBookingModal({ id: bid, bookingNumber: bid });
      }
    });
  });

  paymentsTableWrap.querySelectorAll("[data-admin-payments-page-action]").forEach((button) => {
    button.addEventListener("click", () => {
      adminPaymentPage += button.dataset.adminPaymentsPageAction === "next" ? 1 : -1;
      renderPaymentsTable();
      paymentsTableWrap.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function convertBookingToFullPayment(bookingId, triggerBtn) {
  // Open the invoice editor with full paid pre-selected so admin can specify payment mode and reference
  await openInvoiceEditorModal(bookingId, triggerBtn);
  const fullPaidCheck = $("adminInvFullPaidCheck");
  if (fullPaidCheck) {
    fullPaidCheck.checked = true;
    fullPaidCheck.dispatchEvent(new Event("change"));
  }
  const refInput = $("adminInvPaymentRef");
  if (refInput) {
    refInput.focus();
  }
  const statusEl = $("adminInvoiceModalStatus");
  if (statusEl) {
    statusEl.textContent = "Converted to Full Payment! Select Payment Mode, enter Reference ID, then click Save or Send.";
    statusEl.className = "form-status is-success";
  }
}

let currentEditingInvoice = null;

function recalculateInvoiceModalTotals() {
  const rental = Number($("adminInvRental")?.value || 0);
  const driver = Number($("adminInvDriver")?.value || 0);
  const extraKm = Number($("adminInvExtraKm")?.value || 0);
  const lateFee = Number($("adminInvLateFee")?.value || 0);
  const fuel = Number($("adminInvFuel")?.value || 0);
  const damage = Number($("adminInvDamage")?.value || 0);
  const discount = Number($("adminInvDiscount")?.value || 0);
  const taxRate = Number($("adminInvTaxRate")?.value || 0);

  const subtotal = Math.max(0, rental + driver + extraKm + lateFee + fuel + damage - discount);
  const tax = Math.round((subtotal * taxRate) / 100);
  const total = subtotal + tax;

  const fullPaidCheck = $("adminInvFullPaidCheck");
  const amountPaidInput = $("adminInvAmountPaid");

  let paid = Number(amountPaidInput?.value || 0);
  if (fullPaidCheck?.checked && paid < total) {
    paid = total;
    if (amountPaidInput) amountPaidInput.value = total;
  }
  const balance = Math.max(0, total - paid);

  if ($("adminInvSubtotal")) $("adminInvSubtotal").textContent = formatINR(subtotal);
  if ($("adminInvTax")) $("adminInvTax").textContent = formatINR(tax);
  if ($("adminInvTotal")) $("adminInvTotal").textContent = formatINR(total);
  if ($("adminInvPaid")) $("adminInvPaid").textContent = formatINR(paid);
  if ($("adminInvBalance")) $("adminInvBalance").textContent = formatINR(balance);

  return { subtotal, tax, total, paid, balance };
}

async function openInvoiceEditorModal(bookingId, triggerBtn) {
  const statusEl = $("adminInvoiceModalStatus");
  if (statusEl) {
    statusEl.textContent = "Loading invoice data…";
    statusEl.className = "form-status is-loading";
  }

  showModal("adminInvoiceModal");

  try {
    const data = await api.get("/invoices/get", { id: bookingId });
    if (!data.success || !data.invoice) {
      throw new Error(data.error || "Could not load invoice data.");
    }

    currentEditingInvoice = data.invoice;
    const inv = data.invoice;
    const booking = bookingsData.find((item) => item.id === bookingId) || {};

    if ($("adminInvoiceModalNumber")) {
      $("adminInvoiceModalNumber").textContent = inv.invoiceNumber || inv.invoiceId || "";
    }
    if ($("adminInvCustomerName")) $("adminInvCustomerName").value = inv.customer?.name || "";
    if ($("adminInvCustomerEmail")) $("adminInvCustomerEmail").value = inv.customer?.email || "";
    if ($("adminInvVehicleName")) $("adminInvVehicleName").value = inv.vehicle?.name || "";
    let regVal = inv.vehicle?.registration || booking.vehicleReg || booking.registration || "";
    if (typeof regVal === "string" && (regVal.toUpperCase().startsWith("ZIP") || regVal.toUpperCase() === "ZIP001")) {
      regVal = "";
    }
    if ($("adminInvVehicleReg")) $("adminInvVehicleReg").value = regVal;

    const c = inv.charges || {};
    if ($("adminInvRental")) $("adminInvRental").value = c.rental || 0;
    if ($("adminInvDriver")) $("adminInvDriver").value = c.driver || 0;
    if ($("adminInvExtraKm")) $("adminInvExtraKm").value = c.extraKm || 0;
    if ($("adminInvLateFee")) $("adminInvLateFee").value = c.lateFee || 0;
    if ($("adminInvFuel")) $("adminInvFuel").value = c.fuel || 0;
    if ($("adminInvDamage")) $("adminInvDamage").value = Number(c.damage || 0) + Number(c.cleaning || 0);
    if ($("adminInvDiscount")) $("adminInvDiscount").value = c.discount || 0;
    if ($("adminInvTaxRate")) $("adminInvTaxRate").value = inv.taxRate ?? 0;
    if ($("adminInvNotes")) $("adminInvNotes").value = inv.notes || "";

    const pay = inv.payment || {};
    if ($("adminInvPaymentMode")) $("adminInvPaymentMode").value = pay.mode || booking.paymentMode || "UPI";
    if ($("adminInvPaymentRef")) $("adminInvPaymentRef").value = pay.reference || booking.paymentRef || "";

    const isFull = inv.paymentPlan === "full" || inv.paymentStatus === "paid" || inv.balanceDue === 0;
    if ($("adminInvFullPaidCheck")) $("adminInvFullPaidCheck").checked = isFull;
    if (currentEditingInvoice) {
      currentEditingInvoice.isFullPaid = isFull;
      currentEditingInvoice.originalAmountPaid = inv.amountPaid || booking.paymentAmountPaid || booking.advanceAmount || 0;
    }
    if ($("adminInvAmountPaid")) {
      $("adminInvAmountPaid").value = isFull ? (inv.total || inv.subtotal || 0) : (inv.amountPaid || booking.paymentAmountPaid || booking.advanceAmount || 0);
    }

    recalculateInvoiceModalTotals();

    if (statusEl) {
      statusEl.textContent = data.emailSent
        ? "✓ Invoice loaded. Sent to customer."
        : "✓ Invoice loaded. Edit line items, payment mode, preview PDF, or send to customer.";
      statusEl.className = "form-status is-success";
    }
  } catch (error) {
    console.error("LOAD INVOICE ERROR:", error);
    if (statusEl) {
      statusEl.textContent = `Could not load invoice: ${error.message}`;
      statusEl.className = "form-status is-error";
    }
  }
}

function initialiseInvoiceEditorModal() {
  const close = $("closeAdminInvoiceModal");
  if (close) {
    close.addEventListener("click", () => hideModal("adminInvoiceModal"));
  }

  document.querySelectorAll(".inv-calc-field").forEach((input) => {
    input.addEventListener("input", recalculateInvoiceModalTotals);
  });

  const fullPaidCheck = $("adminInvFullPaidCheck");
  const amountPaidInput = $("adminInvAmountPaid");

  if (fullPaidCheck) {
    fullPaidCheck.addEventListener("change", () => {
      if (!currentEditingInvoice) return;
      currentEditingInvoice.isFullPaid = fullPaidCheck.checked;
      if (fullPaidCheck.checked) {
        const rental = Number($("adminInvRental")?.value || 0);
        const driver = Number($("adminInvDriver")?.value || 0);
        const extraKm = Number($("adminInvExtraKm")?.value || 0);
        const lateFee = Number($("adminInvLateFee")?.value || 0);
        const fuel = Number($("adminInvFuel")?.value || 0);
        const damage = Number($("adminInvDamage")?.value || 0);
        const discount = Number($("adminInvDiscount")?.value || 0);
        const taxRate = Number($("adminInvTaxRate")?.value || 0);
        const subtotal = Math.max(0, rental + driver + extraKm + lateFee + fuel + damage - discount);
        const total = subtotal + Math.round((subtotal * taxRate) / 100);
        if (amountPaidInput) amountPaidInput.value = total;
      } else {
        if (amountPaidInput) amountPaidInput.value = currentEditingInvoice.originalAmountPaid || 0;
      }
      recalculateInvoiceModalTotals();
    });
  }

  if (amountPaidInput) {
    amountPaidInput.addEventListener("input", () => {
      const rental = Number($("adminInvRental")?.value || 0);
      const driver = Number($("adminInvDriver")?.value || 0);
      const extraKm = Number($("adminInvExtraKm")?.value || 0);
      const lateFee = Number($("adminInvLateFee")?.value || 0);
      const fuel = Number($("adminInvFuel")?.value || 0);
      const damage = Number($("adminInvDamage")?.value || 0);
      const discount = Number($("adminInvDiscount")?.value || 0);
      const taxRate = Number($("adminInvTaxRate")?.value || 0);
      const subtotal = Math.max(0, rental + driver + extraKm + lateFee + fuel + damage - discount);
      const total = subtotal + Math.round((subtotal * taxRate) / 100);
      const currentPaid = Number(amountPaidInput.value || 0);
      if (fullPaidCheck) {
        fullPaidCheck.checked = (currentPaid >= total && total > 0);
      }
      recalculateInvoiceModalTotals();
    });
  }

  const previewBtn = $("adminInvPreviewBtn");
  if (previewBtn) {
    previewBtn.addEventListener("click", async () => {
      if (!currentEditingInvoice) return;
      const statusEl = $("adminInvoiceModalStatus");
      try {
        previewBtn.disabled = true;
        previewBtn.textContent = "Generating PDF…";
        // Sync latest form inputs to backend before opening PDF preview
        const totalsData = recalculateInvoiceModalTotals();
        const isFull = (totalsData.balance === 0 || $("adminInvFullPaidCheck")?.checked);
        const bookingId = currentEditingInvoice.bookingId || currentEditingInvoice.id;

        const payload = {
          bookingId,
          customer: {
            ...currentEditingInvoice.customer,
            name: $("adminInvCustomerName")?.value || "",
            email: $("adminInvCustomerEmail")?.value || "",
          },
          vehicle: {
            ...currentEditingInvoice.vehicle,
            name: $("adminInvVehicleName")?.value || "",
            registration: $("adminInvVehicleReg")?.value || "",
          },
          charges: {
            ...currentEditingInvoice.charges,
            rental: Number($("adminInvRental")?.value || 0),
            driver: Number($("adminInvDriver")?.value || 0),
            extraKm: Number($("adminInvExtraKm")?.value || 0),
            lateFee: Number($("adminInvLateFee")?.value || 0),
            fuel: Number($("adminInvFuel")?.value || 0),
            damage: Number($("adminInvDamage")?.value || 0),
            discount: Number($("adminInvDiscount")?.value || 0),
          },
          taxRate: Number($("adminInvTaxRate")?.value || 0),
          notes: $("adminInvNotes")?.value || "",
          amountPaid: totalsData.paid,
          paymentMode: $("adminInvPaymentMode")?.value || "UPI",
          paymentRef: $("adminInvPaymentRef")?.value || "",
          paymentPlan: isFull ? "full" : (currentEditingInvoice.paymentPlan || "advance"),
          paymentStatus: isFull ? "paid" : (currentEditingInvoice.paymentStatus || "advance_paid"),
        };

        await api.post("/invoices/update", payload);

        const token = await getAuthToken();
        const pdfUrl = `${API_BASE_URL}/invoices/pdf.php?id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;
        window.open(pdfUrl, "_blank", "noopener");
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `PDF Preview error: ${err.message}`;
          statusEl.className = "form-status is-error";
        }
      } finally {
        previewBtn.disabled = false;
        previewBtn.textContent = "Preview PDF";
      }
    });
  }

  const saveBtn = $("adminInvSaveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      if (!currentEditingInvoice) return;
      const statusEl = $("adminInvoiceModalStatus");
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";
        if (statusEl) {
          statusEl.textContent = "Saving changes & regenerating PDF…";
          statusEl.className = "form-status is-loading";
        }

        const totalsData = recalculateInvoiceModalTotals();
        const isFull = (totalsData.balance === 0 || $("adminInvFullPaidCheck")?.checked);
        const bookingId = currentEditingInvoice.bookingId || currentEditingInvoice.id;

        const payload = {
          bookingId,
          customer: {
            ...currentEditingInvoice.customer,
            name: $("adminInvCustomerName")?.value || "",
            email: $("adminInvCustomerEmail")?.value || "",
          },
          vehicle: {
            ...currentEditingInvoice.vehicle,
            name: $("adminInvVehicleName")?.value || "",
            registration: $("adminInvVehicleReg")?.value || "",
          },
          charges: {
            ...currentEditingInvoice.charges,
            rental: Number($("adminInvRental")?.value || 0),
            driver: Number($("adminInvDriver")?.value || 0),
            extraKm: Number($("adminInvExtraKm")?.value || 0),
            lateFee: Number($("adminInvLateFee")?.value || 0),
            fuel: Number($("adminInvFuel")?.value || 0),
            damage: Number($("adminInvDamage")?.value || 0),
            discount: Number($("adminInvDiscount")?.value || 0),
          },
          taxRate: Number($("adminInvTaxRate")?.value || 0),
          notes: $("adminInvNotes")?.value || "",
          amountPaid: totalsData.paid,
          paymentMode: $("adminInvPaymentMode")?.value || "UPI",
          paymentRef: $("adminInvPaymentRef")?.value || "",
          paymentPlan: isFull ? "full" : (currentEditingInvoice.paymentPlan || "advance"),
          paymentStatus: isFull ? "paid" : (currentEditingInvoice.paymentStatus || "advance_paid"),
        };

        const res = await api.post("/invoices/update", payload);
        if (!res.success) throw new Error(res.error || "Save failed");

        if (res.invoice) {
          currentEditingInvoice = res.invoice;
        }
        recalculateInvoiceModalTotals();
        renderPaymentsTable();
        updateRevenueStats();

        if (statusEl) {
          statusEl.textContent = "✓ Invoice saved & PDF updated successfully!";
          statusEl.className = "form-status is-success";
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `Save error: ${err.message}`;
          statusEl.className = "form-status is-error";
        }
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Changes";
      }
    });
  }

  const sendBtn = $("adminInvSendBtn");
  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      if (!currentEditingInvoice) return;
      const statusEl = $("adminInvoiceModalStatus");
      try {
        sendBtn.disabled = true;
        sendBtn.textContent = "Sending Email…";
        if (statusEl) {
          statusEl.textContent = "Saving latest edits & sending email…";
          statusEl.className = "form-status is-loading";
        }

        const totalsData = recalculateInvoiceModalTotals();
        const isFull = (totalsData.balance === 0 || $("adminInvFullPaidCheck")?.checked);
        const bookingId = currentEditingInvoice.bookingId || currentEditingInvoice.id;

        const payload = {
          bookingId,
          customer: {
            ...currentEditingInvoice.customer,
            name: $("adminInvCustomerName")?.value || "",
            email: $("adminInvCustomerEmail")?.value || "",
          },
          vehicle: {
            ...currentEditingInvoice.vehicle,
            name: $("adminInvVehicleName")?.value || "",
            registration: $("adminInvVehicleReg")?.value || "",
          },
          charges: {
            ...currentEditingInvoice.charges,
            rental: Number($("adminInvRental")?.value || 0),
            driver: Number($("adminInvDriver")?.value || 0),
            extraKm: Number($("adminInvExtraKm")?.value || 0),
            lateFee: Number($("adminInvLateFee")?.value || 0),
            fuel: Number($("adminInvFuel")?.value || 0),
            damage: Number($("adminInvDamage")?.value || 0),
            discount: Number($("adminInvDiscount")?.value || 0),
          },
          taxRate: Number($("adminInvTaxRate")?.value || 0),
          notes: $("adminInvNotes")?.value || "",
          amountPaid: totalsData.paid,
          paymentMode: $("adminInvPaymentMode")?.value || "UPI",
          paymentRef: $("adminInvPaymentRef")?.value || "",
          paymentPlan: isFull ? "full" : (currentEditingInvoice.paymentPlan || "advance"),
          paymentStatus: isFull ? "paid" : (currentEditingInvoice.paymentStatus || "advance_paid"),
        };

        await api.post("/invoices/update", payload);

        const sendRes = await api.post("/invoices/send", {
          bookingId,
          recipientEmail: payload.customer.email
        });

        if (!sendRes.success) throw new Error(sendRes.error || "Email send failed");

        renderPaymentsTable();
        updateRevenueStats();

        if (statusEl) {
          statusEl.textContent = `✓ Invoice successfully sent to ${payload.customer.email}!`;
          statusEl.className = "form-status is-success";
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `Send error: ${err.message}`;
          statusEl.className = "form-status is-error";
          statusEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        alert(`Email Send Notice:\n\n${err.message}`);
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "Send to Customer Email";
      }
    });
  }
}

function initialisePaymentModal() {
  const close =
    $("closePaymentModal");

  if (close) {
    close.addEventListener(
      "click",
      () => {
        hideModal(
          "paymentModal"
        );
      }
    );
  }

  const payInvoiceBtn = $("paymentModalInvoiceBtn");
  if (payInvoiceBtn) {
    payInvoiceBtn.addEventListener("click", async () => {
      if (!activePaymentBooking) return;
      const targetId = activePaymentBooking.id || activePaymentBooking.bookingId || activePaymentBooking.bookingNumber;
      hideModal("paymentModal");
      await openInvoiceEditorModal(targetId, payInvoiceBtn);
    });
  }

  const payEditBtn = $("paymentModalEditBtn");
  if (payEditBtn) {
    payEditBtn.addEventListener("click", () => {
      if (!activePaymentBooking) return;
      const targetId = activePaymentBooking.id || activePaymentBooking.bookingId || activePaymentBooking.bookingNumber;
      const bk = bookingsData.find(b => b.id === targetId || b.bookingNumber === targetId) || activePaymentBooking;
      hideModal("paymentModal");
      openAdminEditBookingModal(bk);
    });
  }

  const approve =
    $("approvePaymentBtn");

  if (approve) {
    approve.addEventListener(
      "click",
      async () => {
        if (
          !activePaymentBooking
        ) {
          return;
        }

        try {
          approve.disabled =
            true;

          approve.textContent =
            "Approving...";

          const isAdvancePayment = activePaymentBooking.paymentPlan === "advance";
          const targetBookingId = activePaymentBooking.id || activePaymentBooking.bookingId;

          await api.post(`/payments/${targetBookingId}/verify`, {
            action: "approve",
            bookingId: targetBookingId
          });

          activePaymentBooking.paymentStatus =
            isAdvancePayment ? "advance_paid" : "paid";

          activePaymentBooking.status =
            "confirmed";

          // Update matching items in memory
          const pItem = paymentsData.find(p => p.id === targetBookingId || p.bookingId === targetBookingId);
          if (pItem) {
            pItem.status = "verified";
          }
          const bItem = bookingsData.find(b => b.id === targetBookingId || b.bookingNumber === targetBookingId);
          if (bItem) {
            bItem.paymentStatus = isAdvancePayment ? "advance_paid" : "paid";
            bItem.status = "confirmed";
          }

          hideModal(
            "paymentModal"
          );

          // Full sync with DB
          try {
            if (typeof loadPayments === "function") await loadPayments();
            if (typeof loadBookings === "function") await loadBookings();
            if (typeof loadAdminCalendar === "function") await loadAdminCalendar();
          } catch (syncErr) {
            console.warn("Sync error after payment approval:", syncErr);
          }

          renderBookingsTable(
            getFilteredBookings()
          );

          renderPaymentsTable();

          updateRevenueStats();

        } catch (error) {
          console.error(
            "PAYMENT APPROVAL ERROR:",
            error
          );

          alert(
            "Could not approve payment.\n\n" +
            error.message
          );

        } finally {
          approve.disabled =
            false;

          approve.textContent =
            "Approve & Confirm Booking";
        }
      }
    );
  }

  const reject =
    $("rejectPaymentBtn");

  if (reject) {
    reject.addEventListener(
      "click",
      async () => {
        if (
          !activePaymentBooking
        ) {
          return;
        }

        const reason =
          prompt(
            "Reason for rejecting this payment:"
          );

        if (
          reason ===
          null
        ) {
          return;
        }

        try {
          const targetBookingId = activePaymentBooking.id || activePaymentBooking.bookingId;

          await api.post(`/payments/${targetBookingId}/verify`, {
            action: "reject",
            reason: reason || "Payment could not be verified.",
            bookingId: targetBookingId
          });

          activePaymentBooking.paymentStatus =
            "rejected";

          const pItem = paymentsData.find(p => p.id === targetBookingId || p.bookingId === targetBookingId);
          if (pItem) {
            pItem.status = "rejected";
          }
          const bItem = bookingsData.find(b => b.id === targetBookingId || b.bookingNumber === targetBookingId);
          if (bItem) {
            bItem.paymentStatus = "rejected";
          }

          hideModal(
            "paymentModal"
          );

          // Full sync with DB
          try {
            if (typeof loadPayments === "function") await loadPayments();
            if (typeof loadBookings === "function") await loadBookings();
            if (typeof loadAdminCalendar === "function") await loadAdminCalendar();
          } catch (syncErr) {
            console.warn("Sync error after payment rejection:", syncErr);
          }

          renderPaymentsTable();

          renderBookingsTable(
            getFilteredBookings()
          );

        } catch (error) {
          console.error(
            "PAYMENT REJECTION ERROR:",
            error
          );

          alert(
            "Could not reject payment.\n\n" +
            error.message
          );
        }
      }
    );
  }
}

async function openPaymentModal(
  booking
) {
  if (activePaymentScreenshotObjectUrl) {
    URL.revokeObjectURL(
      activePaymentScreenshotObjectUrl
    );
    activePaymentScreenshotObjectUrl = null;
  }

  // Ensure we have full booking record if available
  const bookingId = booking.id || booking.bookingId || booking.bookingNumber;
  const fullBooking = bookingsData.find(b => b.id === bookingId || b.bookingNumber === bookingId) || booking;
  activePaymentBooking = fullBooking;

  const isVerified =
    fullBooking.status === "confirmed" ||
    fullBooking.status === "verified" ||
    fullBooking.paymentStatus === "paid" ||
    fullBooking.paymentStatus === "advance_paid" ||
    fullBooking.status === "completed";

  const payInvoiceBtn = $("paymentModalInvoiceBtn");
  if (payInvoiceBtn) {
    payInvoiceBtn.style.display = isVerified ? "inline-flex" : "none";
  }

  const payEditBtn = $("paymentModalEditBtn");
  if (payEditBtn) {
    payEditBtn.style.display = "inline-flex";
  }

  const approve = $("approvePaymentBtn");
  if (approve) {
    approve.textContent = isVerified ? "Re-Confirm & Sync" : "Approve & Confirm Booking";
  }

  const title =
    $("paymentModalTitle");

  if (title) {
    title.textContent =
      `Booking #${formatBookingNumber(fullBooking)}`;
  }

  let screenshotSrc =
    booking.paymentScreenshotDataUrl ||
    booking.paymentScreenshotURL ||
    booking.paymentScreenshotUrl ||
    booking.screenshotUrl ||
    booking.screenshotURL ||
    (typeof booking.paymentScreenshot === "string" ? booking.paymentScreenshot : null);

  if (!screenshotSrc && booking.paymentScreenshotMediaId) {
    screenshotSrc = `/api/media/file.php?id=${encodeURIComponent(booking.paymentScreenshotMediaId)}`;
  } else if (screenshotSrc && String(screenshotSrc).startsWith("MED-")) {
    screenshotSrc = `/api/media/file.php?id=${encodeURIComponent(screenshotSrc)}`;
  }

  const body =
    $("paymentModalBody");

  if (body) {
    body.innerHTML = `
      <div
        style="
          display:grid;
          gap:12px;
        "
      >

        <div class="booking-summary__row">
          <span>Customer</span>
          <strong>
            ${escapeHtml(
              booking.userName ||
                "Customer"
            )}
          </strong>
        </div>

        <div class="booking-summary__row">
          <span>Vehicle</span>
          <strong>
            ${escapeHtml(
              booking.vehicleName ||
                "Vehicle"
            )}
          </strong>
        </div>

        ${(() => {
          const paidAmt = Number(booking.amount ?? booking.advanceAmount ?? booking.advance_amount ?? booking.tokenAmount ?? booking.token_amount ?? booking.paymentAmount ?? booking.amountPaid ?? 0);
          const totalAmt = Number(booking.totalAmount ?? booking.total_amount ?? booking.finalAmount ?? 0);
          const balanceAmt = Number(booking.remainingAmount ?? booking.remaining_amount ?? booking.remainingBalance ?? (totalAmt > paidAmt ? totalAmt - paidAmt : 0));
          return `
          <div class="booking-summary__row">
            <span>Token Amount Paid</span>
            <strong style="color: #06d6a0; font-size: 1.05rem;">
              ${formatINR(paidAmt > 0 ? paidAmt : (totalAmt <= 500 && totalAmt > 0 ? totalAmt : 500))}
            </strong>
          </div>
          ${totalAmt > 0 ? `
          <div class="booking-summary__row">
            <span>Total Booking Value</span>
            <strong>${formatINR(totalAmt)}</strong>
          </div>
          ` : ''}
          ${balanceAmt > 0 ? `
          <div class="booking-summary__row">
            <span>Balance Due at Pickup</span>
            <strong style="color: #ffb703;">${formatINR(balanceAmt)}</strong>
          </div>
          ` : ''}
          `;
        })()}

        <div class="booking-summary__row">
          <span>Method</span>
          <strong>
            ${escapeHtml(
              booking.paymentMethod ||
                "UPI"
            )}
          </strong>
        </div>

        <div class="booking-summary__row">
          <span>Reference</span>
          <strong
            style="
              font-family:monospace;
            "
          >
            ${escapeHtml(
              booking.paymentRef ||
                "—"
            )}
          </strong>
        </div>

        ${
          screenshotSrc
            ? `
              <img
                src="${escapeHtml(
                  screenshotSrc
                )}"
                alt="Payment screenshot"
                onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'400\\' height=\\'260\\' viewBox=\\'0 0 400 260\\'%3E%3Crect width=\\'100%25\\' height=\\'100%25\\' fill=\\'%23121926\\' rx=\\'12\\'/%3E%3Ctext x=\\'50%25\\' y=\\'46%25\\' fill=\\'%2348d7ff\\' font-family=\\'sans-serif\\' font-size=\\'14\\' font-weight=\\'bold\\' text-anchor=\\'middle\\'%3EProtected Payment Proof%3C/text%3E%3Ctext x=\\'50%25\\' y=\\'58%25\\' fill=\\'%237b8798\\' font-family=\\'sans-serif\\' font-size=\\'12\\' text-anchor=\\'middle\\'%3ERef: ${escapeHtml(booking.paymentRef || booking.id || '')}%3C/text%3E%3C/svg%3E';"
                style="
                  width:100%;
                  max-height:400px;
                  object-fit:contain;
                  border-radius:10px;
                  background:#000;
                  margin-top:10px;
                "
              />
            `
            : booking.paymentScreenshotMediaId
              ? `
                <div
                  id="paymentScreenshotPreview"
                  style="
                    min-height:120px;
                    display:grid;
                    place-items:center;
                    color:var(--sub);
                    border:1px solid var(--line);
                    border-radius:10px;
                    margin-top:10px;
                  "
                >
                  Loading payment screenshot...
                </div>
              `
            : `
              <p
                style="
                  color:var(--sub);
                "
              >
                No payment screenshot uploaded.
              </p>
            `
        }

      </div>
    `;
  }

  showModal(
    "paymentModal"
  );

  if (
    booking.paymentScreenshotMediaId &&
    !screenshotSrc
  ) {
    const preview =
      $("paymentScreenshotPreview");

    try {
      const objectUrl =
        await fetchMediaBlobUrl(
          booking.paymentScreenshotMediaId
        );

      if (
        activePaymentBooking !== booking ||
        !preview?.isConnected
      ) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      activePaymentScreenshotObjectUrl =
        objectUrl;

      preview.innerHTML = `
        <img
          src="${escapeHtml(objectUrl)}"
          alt="Payment screenshot"
          style="
            width:100%;
            max-height:400px;
            object-fit:contain;
            border-radius:10px;
            background:#000;
          "
        />
      `;
    } catch (error) {
      console.error(
        "PAYMENT SCREENSHOT LOAD ERROR:",
        error
      );

      if (preview?.isConnected) {
        preview.innerHTML = `
          <p style="color:#ef476f;padding:16px;text-align:center;">
            The screenshot was uploaded, but its preview could not be loaded.
          </p>
        `;
      }
    }
  }
}

// ============================================================================
// REVENUE
// ============================================================================

function getBookingCollectedAmount(booking) {
  if (booking.paymentStatus === "advance_paid") {
    return Number(booking.advanceAmount || booking.paymentAmountPaid || booking.paymentAmount || 500);
  }
  if (booking.paymentStatus === "paid") {
    return Number(booking.finalAmount || booking.totalAmount || booking.paymentAmountPaid || booking.paymentAmount || booking.rentalTotal || 0);
  }
  return Number(booking.paymentAmountPaid || booking.paymentAmount || 0);
}

function updateRevenueStats() {
  if (currentKpiStats) {
    applyKpiStats();
    return;
  }

  const paid =
    bookingsData.filter(
      (booking) =>
        booking.paymentStatus === "paid" ||
        booking.paymentStatus === "advance_paid"
    );

  const totalRevenue =
    paid.reduce(
      (sum, booking) =>
        sum + getBookingCollectedAmount(booking),
      0
    );

  const now =
    new Date();

  const monthlyRevenue =
    paid
      .filter((booking) => {
        // User directive: attribute revenue to the booking/pickup month
        const date =
          parseDateOnly(booking.pickupDate) ||
          parseDateOnly(booking.bookingDate) ||
          parseDateOnly(booking.createdAt) ||
          parseDateOnly(booking.paymentVerifiedAt);

        return (
          date &&
          date.getFullYear() ===
            now.getFullYear() &&
          date.getMonth() ===
            now.getMonth()
        );
      })
      .reduce(
        (sum, booking) =>
          sum + getBookingCollectedAmount(booking),
        0
      );

  const pendingPayments =
    bookingsData.filter(
      (booking) =>
        booking.paymentStatus === "pending_verification" ||
        (booking.paymentRef && booking.paymentStatus !== "paid" && booking.paymentStatus !== "advance_paid" && booking.paymentStatus !== "rejected")
    ).length;

  // Keep the average aligned with the verified revenue cards.
  // Pending, rejected and unpaid bookings must not dilute this KPI.
  const average =
    paid.length
      ? totalRevenue / paid.length
      : 0;

  const totalRevenueEl =
    $("statTotalRevenue");

  if (totalRevenueEl) {
    totalRevenueEl.textContent =
      formatINR(
        totalRevenue
      );
  }

  const monthlyEl =
    $("statMonthRevenue");

  if (monthlyEl) {
    monthlyEl.textContent =
      formatINR(
        monthlyRevenue
      );
  }

  const pendingEl =
    $("statPendingPayments");

  if (pendingEl) {
    pendingEl.textContent =
      pendingPayments;
  }

  const paidBookingsEl =
    $("statPaidBookings");

  if (paidBookingsEl) {
    paidBookingsEl.textContent =
      paid.length;
  }

  const averageEl =
    $("statAvgBooking");

  if (averageEl) {
    averageEl.textContent =
      formatINR(
        average
      );
  }

  const badge =
    $("paymentsTabBadge");

  if (badge) {
    if (
      pendingPayments >
      0
    ) {
      badge.hidden =
        false;

      badge.textContent =
        pendingPayments;
    } else {
      badge.hidden =
        true;
    }
  }
}

// ============================================================================
// HOST CAR MEDIA (Node/SQLite media server)
//
// Host car photos now live in the local media server (SQLite metadata +
// disk storage) instead of Firebase Storage, uploaded with:
//   category   = "partner_car_photo"
//   related_id = the host car's Firestore doc id
//
// /api/media requires a Firebase ID token on every request (server verifies
// it the same way profile.js does) — so every call below attaches
// Authorization: Bearer <token> from the signed-in admin.
//
// A partner_cars document may still have an old `photos` array from before
// this migration (public Firebase Storage URLs) — those are rendered
// directly, no auth needed. New, server-hosted photos are private, so each
// one is fetched as a Blob and turned into a temporary object URL, same
// pattern as profile.js's getPrivateMediaBlobUrl().
// ============================================================================

const MEDIA_SERVER_URL = window.__KRUIZLY_API_URL__ ? window.__KRUIZLY_API_URL__.replace(/\/api$/, '') : window.location.origin;

const hostPhotoCache = new Map(); // carId -> loaded [{ id, mimeType, originalName, blobUrl }]

async function mediaAuthHeaders() {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// The uploader of a given photo could be the host who submitted the car
// (their own Firebase uid) or an admin who added/replaced a photo from this
// dashboard (the admin's own uid) — the media server only lets you filter by
// one user_id per request, so we query both and merge by media id.
//
// If your partner_cars documents store the owner's Firebase uid under a
// different field name than the ones checked here, add it to this list.
function getHostCarOwnerUid(car) {
  return (
    car.ownerUid ||
    car.ownerId ||
    car.uid ||
    car.userId ||
    car.partnerUid ||
    car.hostUid ||
    null
  );
}

async function fetchHostCarMedia(car) {
  const relatedId = car.id;
  const ownerUid = getHostCarOwnerUid(car);
  const headers = await mediaAuthHeaders();

  const urls = [
    `${MEDIA_SERVER_URL}/api/media?category=partner_car_photo&relatedId=${encodeURIComponent(relatedId)}`,
  ];

  if (ownerUid && ownerUid !== currentUser?.uid) {
    urls.push(
      `${MEDIA_SERVER_URL}/api/media?category=partner_car_photo&relatedId=${encodeURIComponent(
        relatedId
      )}&userId=${encodeURIComponent(ownerUid)}`
    );
  }

  const seen = new Map();

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(`HOST CAR MEDIA FETCH FAILED (${response.status}):`, url);
        continue;
      }

      const rows = await response.json();

      (Array.isArray(rows) ? rows : []).forEach((row) => seen.set(row.id, row));
    } catch (error) {
      console.warn("HOST CAR MEDIA FETCH ERROR:", error);
    }
  }

  return [...seen.values()];
}

async function fetchMediaBlobUrl(mediaId) {
  const headers = await mediaAuthHeaders();

  const response = await fetch(
    `${MEDIA_SERVER_URL}/api/media/file/${encodeURIComponent(mediaId)}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Could not load photo (${response.status}).`);
  }

  const blob = await response.blob();

  return URL.createObjectURL(blob);
}

// Loads + caches the server-hosted photos for one car. Cheap on repeat
// toggles — only hits the network the first time a car's photo row is
// opened, or after invalidateHostPhotoCache() runs post upload/delete.
async function loadHostPhotosIntoCache(car) {
  if (hostPhotoCache.has(car.id)) {
    return hostPhotoCache.get(car.id);
  }

  const records = await fetchHostCarMedia(car);

  const withBlobUrls = await Promise.all(
    records.map(async (record) => {
      try {
        const blobUrl = await fetchMediaBlobUrl(record.id);
        return { ...record, blobUrl };
      } catch (error) {
        console.warn(`Could not load photo ${record.id}:`, error);
        return null;
      }
    })
  );

  const loaded = withBlobUrls.filter(Boolean);

  hostPhotoCache.set(car.id, loaded);

  return loaded;
}

function invalidateHostPhotoCache(carId) {
  const cached = hostPhotoCache.get(carId);

  if (cached) {
    cached.forEach((item) => {
      if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
    });
  }

  hostPhotoCache.delete(carId);
}

// ============================================================================
// HOST CARS
// ============================================================================

async function loadHostCars() {
  if (hostCarsTableWrap) {
    hostCarsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading host listings...
      </p>`;
  }

  try {
    const res = await api.get("/users/partner-cars?scope=all");
    hostCarsData = Array.isArray(res.partnerCars) ? res.partnerCars : [];

    hostCarsData.sort(
      (a, b) =>
        toMillis(b.createdAt) - toMillis(a.createdAt)
    );

    const pending =
      hostCarsData.filter(
        (car) =>
          car.status ===
          "pending_approval"
      ).length;

    const pendingEl =
      $("statPendingHosts");

    if (pendingEl) {
      pendingEl.textContent =
        pending;
    }

    renderHostCarsTable(
      hostCarsData
    );

  } catch (error) {
    console.error(
      "HOST CAR LOAD ERROR:",
      error
    );

    if (hostCarsTableWrap) {
      hostCarsTableWrap.innerHTML =
        `<p style="color:#ef476f;">
          Failed to load host listings.
        </p>

        <small style="color:var(--sub);">
          ${escapeHtml(
            error.message
          )}
        </small>`;
    }
  }
}

// Server-hosted photos are private and fetched lazily (only once a car's
// photo row is actually opened), so the row starts out showing just the
// legacy Firestore `photos` array (if any) plus a loading line, and the
// toggle button's count is a "so far" hint until it's been opened once.
function renderHostCarsTable(
  cars
) {
  if (!hostCarsTableWrap) {
    return;
  }

  if (!cars.length) {
    hostCarsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        No host vehicle listings submitted yet.
      </p>`;

    return;
  }

  let html = `
    <div style="width:100%;overflow-x:auto;">

      <table
        class="admin-table"
        style="
          width:100%;
          min-width:820px;
          border-collapse:collapse;
          text-align:left;
        "
      >

        <thead>
          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >

            <th style="padding:12px;">
              Vehicle
            </th>

            <th style="padding:12px;">
              Owner
            </th>

            <th style="padding:12px;">
              Status
            </th>

            <th
              style="
                padding:12px;
                text-align:right;
              "
            >
              Action
            </th>

          </tr>
        </thead>

        <tbody>
  `;

  cars.forEach(
    (car) => {
      const legacyPhotos =
        Array.isArray(
          car.photos
        )
          ? car.photos
          : [];

      const cachedServerPhotos =
        hostPhotoCache.get(
          car.id
        ) || [];

      const knownPhotoCount =
        legacyPhotos.length +
        Math.max(
          cachedServerPhotos.length,
          Array.isArray(car.photoMediaIds) ? car.photoMediaIds.length : 0
        );

      const detailsRow =
        `host-details-${car.id}`;

      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
          "
        >

          <td style="padding:12px;">
            <strong>
              ${escapeHtml(
                car.brand ||
                  ""
              )}
              ${escapeHtml(
                car.model ||
                  ""
              )}
            </strong>

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.8rem;
              "
            >
              ${escapeHtml(
                car.location ||
                  "—"
              )}
            </span>
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              car.ownerName ||
                "—"
            )}

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.8rem;
              "
            >
              ${escapeHtml(
                car.ownerPhone ||
                  "—"
              )}
            </span>
          </td>

          <td style="padding:12px;">
            <span
              class="fleet-status ${getStatusClass(
                car.status
              )}"
            >
              ${escapeHtml(
                car.status ||
                  "unknown"
              )}
            </span>
          </td>

          <td
            style="
              padding:12px;
              text-align:right;
            "
          >

            <button
              type="button"
              class="btn btn-outline host-details-toggle-btn"
              data-hid="${escapeHtml(car.id)}"
              data-target="${escapeHtml(detailsRow)}"
              style="padding:5px 9px;font-size:.78rem;"
            >
              Show Details ▾
            </button>

            ${
              car.status ===
              "pending_approval"
                ? `
                  <button
                    type="button"
                    class="btn btn-dark approve-host-btn"
                    data-hid="${escapeHtml(
                      car.id
                    )}"
                    style="
                      padding:5px 9px;
                      font-size:.78rem;
                    "
                  >
                    Approve
                  </button>

                  <button
                    type="button"
                    class="btn btn-outline reject-host-btn"
                    data-hid="${escapeHtml(
                      car.id
                    )}"
                    style="
                      padding:5px 9px;
                      font-size:.78rem;
                      color:#ef476f;
                      border-color:#ef476f;
                    "
                  >
                    Reject
                  </button>
                `
                : car.status ===
                  "approved"
                  ? `
                    <button
                      type="button"
                      class="btn btn-outline host-photo-upload-btn"
                      data-hid="${escapeHtml(
                        car.id
                      )}"
                      style="
                        padding:5px 9px;
                        font-size:.78rem;
                      "
                    >
                      Upload
                    </button>

                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      class="host-photo-input"
                      data-hid="${escapeHtml(
                        car.id
                      )}"
                      hidden
                    />
                  `
                  : "—"
            }

          </td>

        </tr>

        <tr id="${escapeHtml(detailsRow)}" hidden>
          <td colspan="4" style="padding:18px;">
            <div class="host-document-grid host-acquisition-detail-grid">
              ${renderHostDetail("Brand", car.brand)}
              ${renderHostDetail("Model", car.model)}
              ${renderHostDetail("Manufacturing Year", car.year)}
              ${renderHostDetail("Current Odometer", car.odometer != null ? `${Number(car.odometer).toLocaleString("en-IN")} KM` : null)}
              ${renderHostDetail("Transmission", car.transmission)}
              ${renderHostDetail("Fuel Type", car.fuel)}
              ${renderHostDetail("Seats", car.seats)}
              ${renderHostDetail("Registration", car.regNumber)}
              ${renderHostDetail("Pickup Location", car.location)}
              ${renderHostDetail("Insurance Start", car.insuranceStart)}
              ${renderHostDetail("Insurance End", car.insuranceEnd)}
              ${renderHostDetail("PUC Start", car.pucStart)}
              ${renderHostDetail("PUC End", car.pucEnd)}
              ${renderHostDetail("Owner Name", car.ownerName)}
              ${renderHostDetail("Owner Phone", car.ownerPhone)}
              ${renderHostDetail("Owner Email", car.userEmail)}
              ${renderHostDetail("Submitted", formatDate(car.createdAt))}
              ${renderHostDetail("Photo Count", knownPhotoCount)}
            </div>

            ${car.rejectionReason ? `<p style="margin:14px 0 0;padding:12px;border-left:3px solid #ef476f;background:rgba(239,71,111,.08);color:var(--sub);"><strong style="color:#ef476f;">Rejection reason:</strong> ${escapeHtml(car.rejectionReason)}</p>` : ""}

            <div style="margin-top:18px;">
              <strong style="display:block;margin-bottom:10px;">Submitted Vehicle Photos</strong>
              <div class="host-details-photo-grid" data-hid="${escapeHtml(car.id)}" style="display:flex;gap:12px;flex-wrap:wrap;">
                ${renderLegacyHostPhotos(car.id, legacyPhotos)}
                ${renderServerHostPhotos(car.id, cachedServerPhotos)}
                ${!legacyPhotos.length && !cachedServerPhotos.length ? `<span class="host-photo-loading" style="color:var(--sub);">Loading protected photos when details are opened...</span>` : ""}
              </div>
            </div>
          </td>
        </tr>

      `;
    }
  );

  html += `
        </tbody>
      </table>
    </div>
    <div style="padding:10px 16px;font-size:0.8rem;color:var(--kr-text-muted);display:flex;justify-content:space-between;align-items:center;background:rgba(6,10,16,0.45);border-top:1px solid var(--kr-border);border-radius:0 0 var(--kr-radius-md) var(--kr-radius-md);">
      <span>Showing all <strong>${cars.length}</strong> acquisition vehicles</span>
      <span style="font-size:0.75rem;color:var(--kr-cyan);font-weight:600;">Scrollable Table</span>
    </div>
  `;

  hostCarsTableWrap.innerHTML = html;
  attachHostCarEvents();
}

function renderHostDetail(label, value) {
  const display = value === undefined || value === null || value === ""
    ? "—"
    : value;

  return `
    <div class="host-document-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(display)}</strong>
    </div>`;
}

// Old Firebase Storage photos: public URL, no fetch needed, plain <img>.
function renderLegacyHostPhotos(carId, urls) {
  if (!urls.length) return "";

  return urls
    .map(
      (url, index) => {
        const isDirect = typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("assets/") || url.startsWith("images/"));
        const srcUrl = isDirect ? url : `/api/media/file.php?id=${encodeURIComponent(url)}`;
        const fallbackSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='90' viewBox='0 0 120 90'%3E%3Crect width='100%25' height='100%25' fill='%23121926' rx='8'/%3E%3Ctext x='50%25' y='50%25' fill='%237b8798' font-family='sans-serif' font-size='10' text-anchor='middle' dy='.3em'%3E${encodeURIComponent(url)}%3C/text%3E%3C/svg%3E`;

        return `
        <div
          class="host-photo-tile"
          style="position:relative;width:120px;height:90px;"
        >
          <img
            src="${escapeHtml(srcUrl)}"
            alt="Host car photo ${index + 1}"
            onerror="this.onerror=null;this.src='${fallbackSvg}';"
            style="
              width:100%;height:100%;object-fit:cover;
              border-radius:8px;border:1px solid var(--line);
            "
          />
          <button
            type="button"
            class="remove-host-photo-btn"
            data-hid="${escapeHtml(carId)}"
            data-source="legacy"
            data-url="${encodeURIComponent(url)}"
            style="
              position:absolute;top:-7px;right:-7px;width:24px;height:24px;
              border:none;border-radius:50%;background:#ef476f;color:white;
              cursor:pointer;
            "
          >×</button>
        </div>
      `;
      }
    )
    .join("");
}

// New media-server photos: private, so these only render once
// loadHostPhotosIntoCache() has actually fetched blob URLs for them —
// before that, cachedServerPhotos is empty and this renders nothing (the
// toggle handler fills it in and re-renders once the fetch completes).
function renderServerHostPhotos(carId, photos) {
  if (!photos.length) return "";

  return photos
    .map(
      (photo) => `
        <div
          class="host-photo-tile"
          style="position:relative;width:120px;height:90px;"
        >
          <img
            src="${escapeHtml(photo.blobUrl)}"
            alt="${escapeHtml(photo.originalName || "Host car photo")}"
            style="
              width:100%;height:100%;object-fit:cover;
              border-radius:8px;border:1px solid var(--line);
            "
          />
          <button
            type="button"
            class="remove-host-photo-btn"
            data-hid="${escapeHtml(carId)}"
            data-source="server"
            data-media-id="${escapeHtml(photo.id)}"
            style="
              position:absolute;top:-7px;right:-7px;width:24px;height:24px;
              border:none;border-radius:50%;background:#ef476f;color:white;
              cursor:pointer;
            "
          >×</button>
        </div>
      `
    )
    .join("");
}

// ============================================================================
// HOST CAR EVENTS
// ============================================================================

function attachHostCarEvents() {
  // SHOW DETAILS — every field submitted by the host plus protected photos.
  hostCarsTableWrap
    .querySelectorAll(".host-details-toggle-btn")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const carId = button.dataset.hid;
        const row = document.getElementById(button.dataset.target);
        if (!row) return;

        const opening = row.hidden;
        row.hidden = !opening;
        button.textContent = opening ? "Hide Details ▴" : "Show Details ▾";

        if (!opening || hostPhotoCache.has(carId)) return;

        const car = hostCarsData.find((item) => item.id === carId);
        if (!car) return;

        try {
          await loadHostPhotosIntoCache(car);
        } catch (error) {
          console.warn("HOST DETAIL PHOTO LOAD ERROR:", error);
        }

        renderHostCarsTable(hostCarsData);
        const reopened = document.getElementById(`host-details-${carId}`);
        if (reopened) reopened.hidden = false;
        const reopenedButton = hostCarsTableWrap.querySelector(
          `.host-details-toggle-btn[data-hid="${carId}"]`
        );
        if (reopenedButton) reopenedButton.textContent = "Hide Details ▴";
      });
    });

  // APPROVE
  hostCarsTableWrap
    .querySelectorAll(
      ".approve-host-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const id = button.dataset.hid;
          if (!id) {
            alert("Could not determine host car ID. Please refresh the page.");
            return;
          }

          try {
            button.disabled = true;
            button.textContent = "Approving...";

            try {
              await api.put(`/users/partner-cars/${encodeURIComponent(id)}/status`, {
                id,
                carId: id,
                status: "approved"
              });
            } catch (err) {
              await api.put(`/users/partner-cars`, {
                id,
                carId: id,
                status: "approved"
              });
            }

            const car = hostCarsData.find((item) => item.id === id || item.carId === id);
            if (car) {
              car.status = "approved";
            }

            updateHostCount();
            renderHostCarsTable(hostCarsData);
          } catch (error) {
            console.error("HOST APPROVAL ERROR:", error);
            button.disabled = false;
            button.textContent = "Approve";
            alert("Could not approve host car.\n\n" + error.message);
          }
        }
      );
    });

  // REJECT
  hostCarsTableWrap
    .querySelectorAll(".reject-host-btn")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.hid;
        if (!id) {
          alert("Could not determine host car ID. Please refresh the page.");
          return;
        }

        const reason = prompt("Reason for rejecting this host car:");
        if (reason === null) {
          return;
        }

        try {
          button.disabled = true;

          try {
            await api.put(`/users/partner-cars/${encodeURIComponent(id)}/status`, {
              id,
              carId: id,
              status: "rejected",
              rejectionReason: reason || "Listing rejected."
            });
          } catch (err) {
            await api.put(`/users/partner-cars`, {
              id,
              carId: id,
              status: "rejected",
              rejectionReason: reason || "Listing rejected."
            });
          }

          const car = hostCarsData.find((item) => item.id === id || item.carId === id);
          if (car) {
            car.status = "rejected";
          }

          updateHostCount();
          renderHostCarsTable(hostCarsData);
        } catch (error) {
          console.error("HOST REJECTION ERROR:", error);
          button.disabled = false;
          alert("Could not reject host car.\n\n" + error.message);
        }
        }
      );
    });

  // PHOTOS TOGGLE — lazily fetches server-hosted photos the first time a
  // given car's row is opened, then just shows/hides on subsequent clicks.
  hostCarsTableWrap
    .querySelectorAll(
      ".host-photo-toggle-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const carId = button.dataset.hid;
          const row = document.getElementById(button.dataset.target);

          if (!row) return;

          const wasHidden = row.hidden;
          row.hidden = !wasHidden;

          if (!wasHidden) {
            // just closed — nothing to fetch
            return;
          }

          if (hostPhotoCache.has(carId)) {
            // already loaded on a previous open — nothing to do
            return;
          }

          const grid = row.querySelector(".host-photo-grid");

          if (grid) {
            grid.insertAdjacentHTML(
              "beforeend",
              `<span class="host-photo-loading" style="color:var(--sub);">Loading photos…</span>`
            );
          }

          const car = hostCarsData.find((item) => item.id === carId);

          if (!car) return;

          try {
            await loadHostPhotosIntoCache(car);
          } catch (error) {
            console.warn("HOST PHOTO LOAD ERROR:", error);
          }

          // Re-render so the newly loaded photos (and the accurate count on
          // the toggle button) show up. The row stays open across the
          // re-render since renderHostCarsTable rebuilds `hidden` from
          // scratch — reopen it here.
          renderHostCarsTable(hostCarsData);

          const reopenedRow = document.getElementById(`host-photo-${carId}`);
          if (reopenedRow) reopenedRow.hidden = false;
        }
      );
    });

  // PHOTO UPLOAD trigger
  hostCarsTableWrap
    .querySelectorAll(
      ".host-photo-upload-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const input =
            hostCarsTableWrap.querySelector(
              `.host-photo-input[data-hid="${button.dataset.hid}"]`
            );

          if (input) {
            input.click();
          }
        }
      );
    });

  // FILE INPUT — uploads to the media server, not Firebase Storage
  hostCarsTableWrap
    .querySelectorAll(
      ".host-photo-input"
    )
    .forEach((input) => {
      input.addEventListener(
        "change",
        async () => {
          const files =
            Array.from(
              input.files ||
                []
            );

          if (!files.length) {
            return;
          }

          await uploadHostPhotos(
            input.dataset.hid,
            files
          );

          input.value =
            "";
        }
      );
    });

  // REMOVE PHOTO — legacy Firestore-array photos vs. server-hosted photos
  // are removed through two different paths (see data-source).
  hostCarsTableWrap
    .querySelectorAll(
      ".remove-host-photo-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const confirmed =
            confirm(
              "Remove this photo from the host car listing?"
            );

          if (!confirmed) {
            return;
          }

          const carId = button.dataset.hid;
          const source = button.dataset.source;

          button.disabled = true;

          try {
            if (source === "server") {
              await removeServerHostPhoto(carId, button.dataset.mediaId);
            } else {
              await removeLegacyHostPhoto(
                carId,
                decodeURIComponent(button.dataset.url)
              );
            }

            renderHostCarsTable(hostCarsData);

            const row = document.getElementById(`host-photo-${carId}`);
            if (row) row.hidden = false;

          } catch (error) {
            console.error(
              "PHOTO REMOVE ERROR:",
              error
            );

            button.disabled = false;

            alert(
              "Could not remove photo.\n\n" +
              error.message
            );
          }
        }
      );
    });
}

async function removeLegacyHostPhoto(carId, url) {
  const car = hostCarsData.find((item) => item.id === carId);
  if (!car) return;

  const photos = Array.isArray(car.photos) ? car.photos : [];
  const remaining = photos.filter((photo) => photo !== url);

  try {
    await api.put(`/users/partner-cars/${carId}/status`, { photos: remaining });
  } catch (_) {}

  car.photos = remaining;
}

async function removeServerHostPhoto(carId, mediaId) {
  try {
    await api.delete(`/media/${encodeURIComponent(mediaId)}`);
    invalidateHostPhotoCache(carId);
  } catch (err) {
    console.warn("Media delete warning:", err);
  }
}

function updateHostCount() {
  const pending =
    hostCarsData.filter(
      (car) =>
        car.status ===
        "pending_approval"
    ).length;

  const element =
    $("statPendingHosts");

  if (element) {
    element.textContent =
      pending;
  }
}

// Uploads to the local media server (category=partner_car_photo,
// relatedId=<car id>) instead of Firebase Storage — the admin's own ID
// token is attached, so these uploads land under the admin's uid on the
// server side (see the merge logic in fetchHostCarMedia).
async function uploadHostPhotos(
  hostId,
  files
) {
  const car =
    hostCarsData.find(
      (item) =>
        item.id === hostId
    );

  if (!car) {
    return;
  }

  if (!currentUser) {
    alert("You must be signed in to upload photos.");
    return;
  }

  const headers = await mediaAuthHeaders();
  const failures = [];

  for (const file of files) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "partner_car_photo");
      formData.append("relatedId", hostId);

      const response = await fetch(
        `${MEDIA_SERVER_URL}/api/media/upload`,
        { method: "POST", headers, body: formData }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Upload failed (${response.status}).`);
      }
    } catch (error) {
      console.error("HOST PHOTO UPLOAD ERROR:", error);
      failures.push(`${file.name}: ${error.message}`);
    }
  }

  invalidateHostPhotoCache(hostId);

  // Immediately reload so the new photos show up rather than waiting for
  // the next toggle-open.
  try {
    await loadHostPhotosIntoCache(car);
  } catch (error) {
    console.warn("HOST PHOTO RELOAD ERROR:", error);
  }

  renderHostCarsTable(hostCarsData);

  const row = document.getElementById(`host-photo-${hostId}`);
  if (row) row.hidden = false;

  if (failures.length) {
    alert(
      "Some photos could not be uploaded:\n\n" + failures.join("\n")
    );
  }
}

// ============================================================================
// RETURN MODAL CLOSE
// ============================================================================

function initialiseReturnModal() {
  const close =
    $("closeReturnModal");

  if (close) {
    close.addEventListener(
      "click",
      () => {
        hideModal(
          "returnModal"
        );
      }
    );
  }

  const modal =
    $("returnModal");

  if (modal) {
    modal.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          modal
        ) {
          hideModal(
            "returnModal"
          );
        }
      }
    );
  }
}

// ============================================================================
// ADMIN BOOKING CALENDAR & TIMELINE CONTROLLER
// ============================================================================

let adminCalYear = new Date().getFullYear();
let adminCalMonth = new Date().getMonth(); // 0 to 11
let adminCalViewMode = "grid"; // "grid" | "agenda"
let adminCalSearchQuery = "";
let adminCalStatusFilter = "all";
let adminCalVehicleFilter = "all";
let adminFleetVehicles = [];
let activeEditingBooking = null;
let activeDayScheduleDate = "";

const CAL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function parseFlexDate(value) {
  if (!value && value !== 0) return null;

  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.toMillis === 'function') return new Date(value.toMillis());
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === 'string') {
    let s = value.trim();
    if (!s || s === '—' || s === '-') return null;

    s = s.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');

    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)$/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10) - 1;
      const year = parseInt(dmy[3], 10);
      let hour = 0, min = 0, sec = 0;
      const rest = (dmy[4] || '').trim();
      const timeMatch = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch) {
        hour = parseInt(timeMatch[1], 10);
        min = parseInt(timeMatch[2], 10);
        sec = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
        if (timeMatch[4]) {
          const meridiem = timeMatch[4].toLowerCase();
          if (meridiem === 'pm' && hour < 12) hour += 12;
          if (meridiem === 'am' && hour === 12) hour = 0;
        }
      }
      const d = new Date(year, month, day, hour, min, sec);
      if (!isNaN(d.getTime())) return d;
    }

    const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(.*)$/);
    if (ymd) {
      const year = parseInt(ymd[1], 10);
      const month = parseInt(ymd[2], 10) - 1;
      const day = parseInt(ymd[3], 10);
      let hour = 0, min = 0, sec = 0;
      const rest = (ymd[4] || '').trim();
      const timeMatch = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch) {
        hour = parseInt(timeMatch[1], 10);
        min = parseInt(timeMatch[2], 10);
        sec = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
        if (timeMatch[4]) {
          const meridiem = timeMatch[4].toLowerCase();
          if (meridiem === 'pm' && hour < 12) hour += 12;
          if (meridiem === 'am' && hour === 12) hour = 0;
        }
      }
      const d = new Date(year, month, day, hour, min, sec);
      if (!isNaN(d.getTime())) return d;
    }

    const standard = new Date(s);
    if (!isNaN(standard.getTime())) return standard;
  }

  return null;
}

function normalizeCalendarBooking(bk) {
  if (!bk) return null;
  const id = String(bk.id || bk._id || bk.bookingId || bk.bookingNumber || '');
  const userName = bk.userName || bk.user_name || bk.customerName || bk.name || 'Customer';
  const userPhone = bk.userPhone || bk.user_phone || bk.phone || '';
  const userEmail = bk.userEmail || bk.user_email || bk.email || '';
  const carName = bk.carName || bk.car_name || bk.vehicleName || bk.vehicle_name || bk.vehicle || 'Vehicle';
  const carReg = bk.vehicleReg || bk.vehicle_reg || bk.carReg || bk.regNo || '';
  
  const rawPickup = bk.pickupDate || bk.pickup_date || bk.pickupDateTime || bk.bookingDate || bk.date || bk.createdAt || '';
  const rawDrop = bk.dropDate || bk.drop_date || bk.dropDateTime || bk.returnDate || bk.return_date || rawPickup;
  
  let pickupDate = parseFlexDate(rawPickup);
  let dropDate = parseFlexDate(rawDrop);
  if (!dropDate && pickupDate) dropDate = new Date(pickupDate);
  if (!pickupDate && dropDate) pickupDate = new Date(dropDate);
  
  const totalAmount = Number(bk.totalAmount ?? bk.total_amount ?? bk.finalAmount ?? bk.amount ?? bk.total ?? 0);
  const tokenPaid = Number(bk.advanceAmount ?? bk.advance_amount ?? bk.tokenAmount ?? bk.token_amount ?? bk.paymentAmount ?? bk.amountPaid ?? 0);
  const rawStatus = String(bk.status || bk.bookingStatus || bk.booking_status || 'confirmed').toLowerCase();
  
  // Calculate classification
  const now = new Date();
  let badgeCategory = 'upcoming';
  if (rawStatus === 'cancelled' || rawStatus === 'rejected' || rawStatus === 'failed') {
    badgeCategory = 'cancelled';
  } else if (rawStatus === 'completed' || rawStatus === 'returned') {
    badgeCategory = 'completed';
  } else if (rawStatus === 'pending_payment' || rawStatus === 'pending' || rawStatus === 'pending_verification' || rawStatus === 'awaiting_verification') {
    badgeCategory = 'pending';
  } else if (rawStatus === 'active' || rawStatus === 'in_trip' || rawStatus === 'picked_up') {
    badgeCategory = 'active';
  } else {
    // Confirmed / Paid
    if (pickupDate && dropDate && now >= pickupDate && now <= dropDate) {
      badgeCategory = 'active';
    } else if (pickupDate && now < pickupDate) {
      badgeCategory = 'upcoming';
    } else if (dropDate && now > dropDate) {
      badgeCategory = 'completed';
    } else {
      badgeCategory = 'upcoming';
    }
  }

  return {
    id,
    raw: bk,
    userName,
    userPhone,
    userEmail,
    carName,
    carReg,
    rawPickup,
    rawDrop,
    pickupDate,
    dropDate,
    totalAmount,
    tokenPaid,
    status: rawStatus,
    badgeCategory,
    notes: bk.notes || bk.pickupLocation || bk.pickup_location || ''
  };
}

function toLocalDateString(d) {
  if (!d || isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatCalTime(d) {
  if (!d || isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatCalDateTime(d) {
  if (!d || isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

function formatInputDateTime(d) {
  if (!d || isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initialiseAdminCalendar() {
  const prevBtn = $("adminCalPrevMonthBtn");
  const nextBtn = $("adminCalNextMonthBtn");
  const todayBtn = $("adminCalTodayBtn");
  const searchInput = $("adminCalSearchInput");
  const statusFilter = $("adminCalStatusFilter");
  const vehicleFilter = $("adminCalVehicleFilter");
  const viewGridBtn = $("adminCalViewGridBtn");
  const viewAgendaBtn = $("adminCalViewAgendaBtn");
  const addBookingBtn = $("adminCalAddBookingBtn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      adminCalMonth--;
      if (adminCalMonth < 0) {
        adminCalMonth = 11;
        adminCalYear--;
      }
      renderAdminCalendarView();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      adminCalMonth++;
      if (adminCalMonth > 11) {
        adminCalMonth = 0;
        adminCalYear++;
      }
      renderAdminCalendarView();
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener("click", () => {
      const now = new Date();
      adminCalYear = now.getFullYear();
      adminCalMonth = now.getMonth();
      renderAdminCalendarView();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      adminCalSearchQuery = (e.target.value || "").trim().toLowerCase();
      renderAdminCalendarView();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener("change", (e) => {
      adminCalStatusFilter = e.target.value || "all";
      renderAdminCalendarView();
    });
  }

  if (vehicleFilter) {
    vehicleFilter.addEventListener("change", (e) => {
      adminCalVehicleFilter = e.target.value || "all";
      renderAdminCalendarView();
    });
  }

  if (viewGridBtn && viewAgendaBtn) {
    viewGridBtn.addEventListener("click", () => {
      adminCalViewMode = "grid";
      viewGridBtn.classList.add("active");
      viewAgendaBtn.classList.remove("active");
      const gridWrap = $("adminCalGridContainer");
      const agendaWrap = $("adminCalAgendaContainer");
      if (gridWrap) { gridWrap.classList.remove("hidden"); gridWrap.hidden = false; }
      if (agendaWrap) { agendaWrap.classList.add("hidden"); agendaWrap.hidden = true; }
      renderAdminCalendarView();
    });

    viewAgendaBtn.addEventListener("click", () => {
      adminCalViewMode = "agenda";
      viewAgendaBtn.classList.add("active");
      viewGridBtn.classList.remove("active");
      const gridWrap = $("adminCalGridContainer");
      const agendaWrap = $("adminCalAgendaContainer");
      if (agendaWrap) { agendaWrap.classList.remove("hidden"); agendaWrap.hidden = false; }
      if (gridWrap) { gridWrap.classList.add("hidden"); gridWrap.hidden = true; }
      renderAdminCalendarView();
    });
  }

  if (addBookingBtn) {
    addBookingBtn.addEventListener("click", () => openAdminAddBookingModal());
  }

  // Day Bookings Schedule Modal setup
  const closeDayBtn = $("closeAdminDayBookingsModal");
  const dayAddBtn = $("adminDayAddBookingBtn");
  if (closeDayBtn) closeDayBtn.addEventListener("click", () => hideModal("adminDayBookingsModal"));
  if (dayAddBtn) {
    dayAddBtn.addEventListener("click", () => {
      hideModal("adminDayBookingsModal");
      openAdminAddBookingModal(activeDayScheduleDate);
    });
  }

  // Add Booking Modal setup
  const closeAddBtn = $("closeAdminAddBookingModal");
  const cancelAddBtn = $("cancelAddBookingBtn");
  const addForm = $("adminAddBookingForm");

  if (closeAddBtn) closeAddBtn.addEventListener("click", () => hideModal("adminAddBookingModal"));
  if (cancelAddBtn) cancelAddBtn.addEventListener("click", () => hideModal("adminAddBookingModal"));
  if (addForm) addForm.addEventListener("submit", handleAdminCreateBooking);

  // Edit Booking Modal setup
  const closeEditBtn = $("closeAdminEditBookingModal");
  const editForm = $("adminEditBookingForm");
  const cancelBkBtn = $("adminCancelBookingBtn");
  const deleteBkBtn = $("adminDeleteBookingBtn");

  if (closeEditBtn) closeEditBtn.addEventListener("click", () => hideModal("adminEditBookingModal"));
  if (editForm) editForm.addEventListener("submit", handleAdminSaveEditBooking);
  if (cancelBkBtn) cancelBkBtn.addEventListener("click", handleAdminCancelBookingAction);
  if (deleteBkBtn) deleteBkBtn.addEventListener("click", handleAdminDeleteBookingAction);

  // Close modals on overlay click
  ["adminAddBookingModal", "adminEditBookingModal", "adminDayBookingsModal"].forEach((modalId) => {
    const modalEl = $(modalId);
    if (modalEl) {
      modalEl.addEventListener("click", (e) => {
        if (e.target === modalEl) hideModal(modalId);
      });
    }
  });
}

export async function loadAdminCalendar() {
  try {
    const [bookingsRes, vehiclesRes] = await Promise.allSettled([
      api.get("/bookings"),
      api.get("/vehicles")
    ]);

    if (bookingsRes.status === "fulfilled" && bookingsRes.value && Array.isArray(bookingsRes.value.bookings)) {
      const rawBk = bookingsRes.value.bookings;
      const seenBk = new Set();
      bookingsData = [];
      rawBk.forEach((b) => {
        const key = String(b.bookingNumber || b.bookingId || b.id || "").trim().toUpperCase();
        if (key && !seenBk.has(key)) {
          seenBk.add(key);
          bookingsData.push(b);
        }
      });
    }

    if (vehiclesRes.status === "fulfilled" && vehiclesRes.value && Array.isArray(vehiclesRes.value.vehicles)) {
      const rawV = vehiclesRes.value.vehicles;
      const seenV = new Set();
      adminFleetVehicles = [];
      rawV.forEach((v) => {
        const reg = String(v.regNo || v.reg_no || "").trim().toUpperCase();
        const carId = String(v.carId || v.car_id || v.id || "").trim().toUpperCase();
        const key = (reg && reg !== "TBD") ? reg : carId;
        if (key && !seenV.has(key)) {
          seenV.add(key);
          adminFleetVehicles.push(v);
        }
      });
    }

    populateAdminVehicleDropdowns();
    renderAdminCalendarView();
  } catch (err) {
    console.error("Error loading calendar data:", err);
    renderAdminCalendarView();
  }
}

function populateAdminVehicleDropdowns() {
  const addSelect = $("addBkVehicleSelect");
  const editSelect = $("editBkVehicleSelect");
  const calVehFilter = $("adminCalVehicleFilter");
  
  let optionsHtml = `<option value="">-- Choose Fleet Vehicle --</option>`;
  let filterOptionsHtml = `<option value="all">All Vehicles (Fleet)</option>`;

  if (adminFleetVehicles && adminFleetVehicles.length > 0) {
    adminFleetVehicles.forEach((v) => {
      const name = `${v.brand || ""} ${v.model || ""}`.trim() || v.name || "Car";
      const reg = v.reg_no || v.regNo || v.id || "";
      const price = v.price_per_day || v.price || "";
      optionsHtml += `<option value="${escapeHtml(reg)}">${escapeHtml(name)} (${escapeHtml(reg)}) ${price ? "- ₹" + price + "/day" : ""}</option>`;
      filterOptionsHtml += `<option value="${escapeHtml(reg || name)}">${escapeHtml(name)} (${escapeHtml(reg)})</option>`;
    });
  }

  if (addSelect) addSelect.innerHTML = optionsHtml;
  if (editSelect) editSelect.innerHTML = optionsHtml;
  if (calVehFilter) {
    calVehFilter.innerHTML = filterOptionsHtml;
    calVehFilter.value = adminCalVehicleFilter;
  }
}

function getFilteredCalendarBookings() {
  const normalized = (bookingsData || []).map(normalizeCalendarBooking).filter(Boolean);

  return normalized.filter((b) => {
    // Status Filter
    if (adminCalStatusFilter !== "all") {
      if (adminCalStatusFilter === "active" && b.badgeCategory !== "active") return false;
      if (adminCalStatusFilter === "upcoming" && b.badgeCategory !== "upcoming") return false;
      if (adminCalStatusFilter === "completed" && b.badgeCategory !== "completed") return false;
      if (adminCalStatusFilter === "pending_payment" && b.badgeCategory !== "pending") return false;
      if (adminCalStatusFilter === "cancelled" && b.badgeCategory !== "cancelled") return false;
    }

    // Vehicle Filter (Per Car)
    if (adminCalVehicleFilter && adminCalVehicleFilter !== "all") {
      const vTarget = adminCalVehicleFilter.toLowerCase();
      const vReg = (b.carReg || "").toLowerCase();
      const vName = (b.carName || "").toLowerCase();
      if (vReg !== vTarget && !vName.includes(vTarget) && !vTarget.includes(vReg)) {
        return false;
      }
    }

    // Search Query
    if (adminCalSearchQuery) {
      const q = adminCalSearchQuery;
      const match =
        b.userName.toLowerCase().includes(q) ||
        b.userPhone.toLowerCase().includes(q) ||
        b.userEmail.toLowerCase().includes(q) ||
        b.carName.toLowerCase().includes(q) ||
        b.carReg.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });
}

function renderAdminCalendarView() {
  const titleEl = $("adminCalMonthTitle");
  if (titleEl) {
    let titleText = `${CAL_MONTH_NAMES[adminCalMonth]} ${adminCalYear}`;
    if (adminCalVehicleFilter && adminCalVehicleFilter !== "all") {
      titleText += ` · Filtered: ${adminCalVehicleFilter}`;
    }
    titleEl.textContent = titleText;
  }

  if (adminCalViewMode === "grid") {
    renderAdminCalendarGrid();
  } else {
    renderAdminCalendarAgenda();
  }
}

function renderAdminCalendarGrid() {
  const gridEl = $("adminCalGrid");
  if (!gridEl) return;

  const filteredBookings = getFilteredCalendarBookings();

  const firstDayIndex = new Date(adminCalYear, adminCalMonth, 1).getDay(); // 0 is Sun
  const daysInMonth = new Date(adminCalYear, adminCalMonth + 1, 0).getDate();
  const prevMonthDays = new Date(adminCalYear, adminCalMonth, 0).getDate();

  const today = new Date();
  const todayStr = toLocalDateString(today);

  let gridHtml = "";

  // 1. Previous month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dNum = prevMonthDays - i;
    const cellDate = new Date(adminCalYear, adminCalMonth - 1, dNum);
    gridHtml += renderCalendarCell(cellDate, dNum, true, todayStr, filteredBookings);
  }

  // 2. Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(adminCalYear, adminCalMonth, d);
    gridHtml += renderCalendarCell(cellDate, d, false, todayStr, filteredBookings);
  }

  // 3. Next month leading days to complete grid (multiples of 7)
  const totalCellsSoFar = firstDayIndex + daysInMonth;
  const remainingCells = (totalCellsSoFar % 7 === 0) ? 0 : 7 - (totalCellsSoFar % 7);
  for (let nextD = 1; nextD <= remainingCells; nextD++) {
    const cellDate = new Date(adminCalYear, adminCalMonth + 1, nextD);
    gridHtml += renderCalendarCell(cellDate, nextD, true, todayStr, filteredBookings);
  }

  gridEl.innerHTML = gridHtml;

  // Clicking an event pill opens Day Schedule Modal for that date
  gridEl.querySelectorAll(".cal-event-pill").forEach((pill) => {
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      const dateStr = pill.dataset.date;
      if (dateStr) {
        openAdminDayBookingsModal(dateStr);
      } else {
        const bid = pill.dataset.bid;
        const bk = bookingsData.find((item) => String(item.id || item.bookingId || item.bookingNumber) === String(bid));
        if (bk) openAdminEditBookingModal(bk);
      }
    });
  });

  // Clicking "+N more" button opens Day Schedule Modal
  gridEl.querySelectorAll(".cal-event-more").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dateStr = btn.dataset.date;
      if (dateStr) openAdminDayBookingsModal(dateStr);
    });
  });

  // Clicking day badge count opens Day Schedule Modal
  gridEl.querySelectorAll(".admin-cal-badge-count").forEach((badge) => {
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dateStr = badge.dataset.date;
      if (dateStr) openAdminDayBookingsModal(dateStr);
    });
  });

  // Clicking cell header opens Day Schedule Modal if bookings exist, else Add Booking
  gridEl.querySelectorAll(".admin-cal-cell-header").forEach((header) => {
    header.addEventListener("click", (e) => {
      e.stopPropagation();
      const dateStr = header.dataset.date;
      const count = parseInt(header.dataset.count || "0", 10);
      if (dateStr) {
        if (count > 0) {
          openAdminDayBookingsModal(dateStr);
        } else {
          openAdminAddBookingModal(dateStr);
        }
      }
    });
  });

  // Clicking anywhere on cell
  gridEl.querySelectorAll(".admin-cal-cell").forEach((cell) => {
    cell.addEventListener("click", (e) => {
      if (e.target.closest(".cal-event-pill") || e.target.closest(".cal-event-more") || e.target.closest(".admin-cal-badge-count") || e.target.closest(".admin-cal-cell-header")) {
        return;
      }
      const dateStr = cell.dataset.date;
      const count = parseInt(cell.dataset.count || "0", 10);
      if (dateStr) {
        if (count > 0) {
          openAdminDayBookingsModal(dateStr);
        } else {
          openAdminAddBookingModal(dateStr);
        }
      }
    });
  });
}

function renderCalendarCell(cellDate, dayNumber, isOtherMonth, todayStr, allBookings) {
  const cellDateStr = toLocalDateString(cellDate);
  const isToday = cellDateStr === todayStr;

  // Find bookings active on this date
  const cellDayStart = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate(), 0, 0, 0).getTime();
  const cellDayEnd = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate(), 23, 59, 59).getTime();

  const matchingBookings = allBookings.filter((b) => {
    if (!b.pickupDate) return false;
    const pTime = b.pickupDate.getTime();
    const dTime = b.dropDate ? b.dropDate.getTime() : pTime;
    return cellDayEnd >= pTime && cellDayStart <= dTime;
  });

  let classes = "admin-cal-cell";
  if (isOtherMonth) classes += " admin-cal-cell--other-month";
  if (isToday) classes += " admin-cal-cell--today";

  let pillsHtml = "";
  const maxDisplay = 2;
  const displayed = matchingBookings.slice(0, maxDisplay);

  displayed.forEach((b) => {
    const isPickupDay = b.pickupDate && toLocalDateString(b.pickupDate) === cellDateStr;
    const isDropDay = b.dropDate && toLocalDateString(b.dropDate) === cellDateStr;

    let flag = "";
    if (isPickupDay && isDropDay) {
      flag = `Pickup: ${formatCalTime(b.pickupDate)} - Return: ${formatCalTime(b.dropDate)}`;
    } else if (isPickupDay) {
      flag = `Pickup: ${formatCalTime(b.pickupDate)}`;
    } else if (isDropDay) {
      flag = `Return: ${formatCalTime(b.dropDate)}`;
    } else {
      flag = `Active Trip`;
    }

    pillsHtml += `
      <div class="cal-event-pill cal-event-pill--${escapeHtml(b.badgeCategory)}" data-bid="${escapeHtml(b.id)}" data-date="${cellDateStr}" title="Click to view booking details: ${escapeHtml(b.userName)} · ${escapeHtml(b.carName)} [₹${b.totalAmount}]">
        <div class="cal-event-user">
          <strong>${escapeHtml(b.userName)}</strong>
          <span style="font-size:10.5px;font-weight:700;color:var(--kr-cyan);">₹${Number(b.totalAmount).toLocaleString("en-IN")}</span>
        </div>
        <div class="cal-event-car">${escapeHtml(b.carName)} ${b.carReg ? `(${escapeHtml(b.carReg)})` : ""}</div>
        <div class="cal-event-time">${flag}</div>
      </div>
    `;
  });

  if (matchingBookings.length > maxDisplay) {
    pillsHtml += `
      <div class="cal-event-more" data-date="${cellDateStr}" role="button" tabindex="0" title="Click to view all ${matchingBookings.length} bookings for this day">
        +${matchingBookings.length - maxDisplay} more (view details)
      </div>
    `;
  }

  return `
    <div class="${classes}" data-date="${cellDateStr}" data-count="${matchingBookings.length}">
      <div class="admin-cal-cell-header" data-date="${cellDateStr}" data-count="${matchingBookings.length}" style="cursor:pointer;" title="${matchingBookings.length > 0 ? `Click to view schedule for this day (${matchingBookings.length} bookings)` : 'Click to add a booking for this day'}">
        <span class="admin-cal-day-num">${dayNumber}</span>
        ${matchingBookings.length > 0 ? `<span class="admin-cal-badge-count" data-date="${cellDateStr}" title="Click to view all ${matchingBookings.length} bookings for this day">${matchingBookings.length} ${matchingBookings.length === 1 ? 'Booking' : 'Bookings'}</span>` : ""}
      </div>
      <div class="cal-events-wrap">
        ${pillsHtml}
      </div>
    </div>
  `;
}

function openAdminDayBookingsModal(dateStr) {
  if (!dateStr) return;
  activeDayScheduleDate = dateStr;

  const parts = dateStr.split("-");
  let dateFormatted = dateStr;
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    dateFormatted = d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  const allBookings = getFilteredCalendarBookings();
  const dParts = dateStr.split("-");
  const cellDate = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
  const cellDayStart = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate(), 0, 0, 0).getTime();
  const cellDayEnd = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate(), 23, 59, 59).getTime();

  const matching = allBookings.filter((b) => {
    if (!b.pickupDate) return false;
    const pTime = b.pickupDate.getTime();
    const dTime = b.dropDate ? b.dropDate.getTime() : pTime;
    return cellDayEnd >= pTime && cellDayStart <= dTime;
  });

  const titleEl = $("adminDayBookingsTitle");
  if (titleEl) {
    titleEl.textContent = `Schedule: ${dateFormatted} (${matching.length} Bookings)`;
  }

  const listEl = $("adminDayBookingsList");
  if (listEl) {
    if (matching.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding: 32px 16px; color: var(--kr-text-secondary); background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
          <p style="margin:0 0 12px; font-size:1rem; color:#fff;">No bookings scheduled for this date.</p>
          <p style="margin:0; font-size:0.85rem; color:var(--kr-text-muted);">You can create a new booking using the button below.</p>
        </div>
      `;
    } else {
      let html = "";
      matching.forEach((b) => {
        const rawBk = bookingsData.find((item) => String(item.id || item.bookingId || item.bookingNumber) === String(b.id)) || b.raw || b;
        const statusLabel = b.badgeCategory.toUpperCase();
        const payStatus = rawBk.paymentStatus ? rawBk.paymentStatus.replace(/_/g, " ").toUpperCase() : "CONFIRMED";
        const payMethod = rawBk.paymentMethod || rawBk.method || "UPI";
        const payRef = rawBk.paymentRef || rawBk.utr || rawBk.transactionId || "";

        html += `
          <div class="day-schedule-item cal-agenda-card--${escapeHtml(b.badgeCategory)}">
            <!-- Header: Status + ID + Amount -->
            <div class="day-schedule-header">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span class="cal-status-tag cal-status-tag--${escapeHtml(b.badgeCategory)}">${statusLabel}</span>
                <span style="font-family:monospace; font-weight:700; color:var(--kr-cyan); font-size:0.9rem;">#${escapeHtml(b.id)}</span>
              </div>
              <div style="font-size: 1.15rem; font-weight: 800; color: #ffffff;">
                ₹${Number(b.totalAmount).toLocaleString("en-IN")}
              </div>
            </div>

            <!-- Details Grid: Customer, Vehicle, Timeline, Payment -->
            <div class="day-schedule-grid">
              <!-- Customer Info -->
              <div style="background: rgba(0,0,0,0.25); padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="font-size: 0.75rem; color: var(--kr-text-secondary); text-transform: uppercase; margin-bottom: 4px;">Customer Details</div>
                <strong style="color: #ffffff; font-size: 0.95rem; display:block; margin-bottom: 4px;">${escapeHtml(b.userName)}</strong>
                ${b.userPhone ? `<div style="font-size: 0.82rem; margin-bottom: 2px;"><a href="tel:${escapeHtml(b.userPhone)}" style="color:var(--kr-cyan); text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i class="ri-phone-fill"></i> ${escapeHtml(b.userPhone)}</a></div>` : ""}
                ${b.userEmail ? `<div style="font-size: 0.8rem;"><a href="mailto:${escapeHtml(b.userEmail)}" style="color:#a5d8ff; text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i class="ri-mail-fill"></i> ${escapeHtml(b.userEmail)}</a></div>` : ""}
              </div>

              <!-- Vehicle Info -->
              <div style="background: rgba(0,0,0,0.25); padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="font-size: 0.75rem; color: var(--kr-text-secondary); text-transform: uppercase; margin-bottom: 4px;">Vehicle Assigned</div>
                <strong style="color: #ffffff; font-size: 0.95rem; display:block; margin-bottom: 4px;">${escapeHtml(b.carName)}</strong>
                <div style="display:inline-block; font-family:monospace; background:rgba(79, 215, 255, 0.12); color:#4fd7ff; padding:2px 8px; border-radius:6px; font-size:0.8rem; border:1px solid rgba(79, 215, 255, 0.3);">
                  ${escapeHtml(b.carReg || "Registration Pending")}
                </div>
              </div>

              <!-- Trip Timeline -->
              <div style="background: rgba(0,0,0,0.25); padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="font-size: 0.75rem; color: var(--kr-text-secondary); text-transform: uppercase; margin-bottom: 4px;">Trip Dates & Times</div>
                <div style="font-size: 0.82rem; color: #ffffff; margin-bottom: 4px;">
                  <span style="color:#06d6a0; font-weight:700;">Pickup:</span> ${formatCalDateTime(b.pickupDate)}
                </div>
                <div style="font-size: 0.82rem; color: #ffffff;">
                  <span style="color:#ffd166; font-weight:700;">Return:</span> ${formatCalDateTime(b.dropDate)}
                </div>
              </div>

              <!-- Payment & Booking State -->
              <div style="background: rgba(0,0,0,0.25); padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="font-size: 0.75rem; color: var(--kr-text-secondary); text-transform: uppercase; margin-bottom: 4px;">Payment & Notes</div>
                <div style="font-size: 0.82rem; color: #ffffff; margin-bottom: 3px;">
                  <span style="color:var(--kr-text-secondary);">Status:</span> <strong>${escapeHtml(payStatus)}</strong>
                </div>
                <div style="font-size: 0.8rem; color: var(--kr-text-muted);">
                  ${escapeHtml(payMethod)} ${payRef ? `· Ref: ${escapeHtml(payRef)}` : ""}
                </div>
                ${b.notes ? `<div style="font-size: 0.78rem; color: #ffd166; margin-top:3px;">Note: ${escapeHtml(b.notes)}</div>` : ""}
              </div>
            </div>

            <!-- Action Toolbar for this Booking -->
            <div class="day-schedule-actions">
              <button type="button" class="btn btn-outline btn-sm day-modal-edit-btn" data-bid="${escapeHtml(b.id)}" style="padding: 6px 12px; font-size: 0.82rem; display:inline-flex; align-items:center; gap:5px;">
                <i class="ri-edit-line"></i> Edit Booking
              </button>
              <button type="button" class="btn btn-primary btn-sm day-modal-inv-btn" data-bid="${escapeHtml(b.id)}" style="padding: 6px 12px; font-size: 0.82rem; display:inline-flex; align-items:center; gap:5px;">
                <i class="ri-file-text-line"></i> Invoice
              </button>
              <button type="button" class="btn btn-dark btn-sm day-modal-receipt-btn" data-bid="${escapeHtml(b.id)}" style="padding: 6px 12px; font-size: 0.82rem; display:inline-flex; align-items:center; gap:5px;">
                <i class="ri-eye-line"></i> Receipt
              </button>
              </div>
          </div>
        `;
      });
      listEl.innerHTML = html;

      // Event handlers inside modal:
      listEl.querySelectorAll(".day-modal-edit-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const bid = btn.dataset.bid;
          const bk = bookingsData.find((item) => String(item.id || item.bookingId || item.bookingNumber) === String(bid));
          if (bk) {
            hideModal("adminDayBookingsModal");
            openAdminEditBookingModal(bk);
          }
        });
      });

      listEl.querySelectorAll(".day-modal-inv-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const bid = btn.dataset.bid;
          hideModal("adminDayBookingsModal");
          await openInvoiceEditorModal(bid, btn);
        });
      });

      listEl.querySelectorAll(".day-modal-receipt-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const bid = btn.dataset.bid;
          const bk = bookingsData.find((item) => String(item.id || item.bookingId || item.bookingNumber) === String(bid)) ||
                     paymentsData.find((item) => item.id === bid || item.bookingId === bid);
          if (bk) {
            hideModal("adminDayBookingsModal");
            openPaymentModal(bk);
          }
        });
      });

      
    }
  }

  showModal("adminDayBookingsModal");
}

function renderAdminCalendarAgenda() {
  const listEl = $("adminCalAgendaList");
  if (!listEl) return;

  const bookings = getFilteredCalendarBookings();

  if (!bookings || bookings.length === 0) {
    listEl.innerHTML = `
      <div class="cal-agenda-empty" style="text-align:center; padding: 48px 20px; color: var(--kr-text-secondary);">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px; opacity:0.5;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        <h4 style="color:#ffffff; margin:0 0 6px;">No Bookings Found</h4>
        <p style="font-size:0.9rem; margin:0 0 16px;">There are no reservations matching your current search or status filter.</p>
        <button type="button" class="btn btn-primary btn-sm" id="calAgendaAddBtn">+ Add New Booking</button>
      </div>
    `;
    const emptyAddBtn = $("calAgendaAddBtn");
    if (emptyAddBtn) emptyAddBtn.addEventListener("click", () => openAdminAddBookingModal());
    return;
  }

  // Sort chronologically by pickup date
  const sorted = [...bookings].sort((a, b) => {
    const tA = a.pickupDate ? a.pickupDate.getTime() : 0;
    const tB = b.pickupDate ? b.pickupDate.getTime() : 0;
    return tA - tB;
  });

  let html = "";
  sorted.forEach((b) => {
    const statusLabel = b.badgeCategory.toUpperCase();
    html += `
      <div class="cal-agenda-card cal-agenda-card--${escapeHtml(b.badgeCategory)}">
        <div class="cal-agenda-card__top">
          <span class="cal-status-tag cal-status-tag--${escapeHtml(b.badgeCategory)}">${statusLabel}</span>
          <span class="cal-agenda-id">#${escapeHtml(b.id.slice(0, 8))}</span>
          <span class="cal-agenda-price">₹${Number(b.totalAmount).toLocaleString("en-IN")}</span>
        </div>
        <div class="cal-agenda-card__main">
          <div class="cal-agenda-user">
            <strong>${escapeHtml(b.userName)}</strong>
            <span class="cal-agenda-sub">${escapeHtml(b.userPhone || b.userEmail || "No contact info")}</span>
          </div>
          <div class="cal-agenda-vehicle">
            <span class="cal-agenda-car-name">${escapeHtml(b.carName)}</span>
            ${b.carReg ? `<span class="cal-agenda-reg">(${escapeHtml(b.carReg)})</span>` : ""}
          </div>
        </div>
        <div class="cal-agenda-card__timeline">
          <div class="cal-timeline-item">
            <span class="cal-timeline-label">PICKUP / START:</span>
            <span class="cal-timeline-value">${formatCalDateTime(b.pickupDate)}</span>
          </div>
          <div class="cal-timeline-item">
            <span class="cal-timeline-label">RETURN / END:</span>
            <span class="cal-timeline-value">${formatCalDateTime(b.dropDate)}</span>
          </div>
        </div>
        <div class="cal-agenda-card__actions">
          <button type="button" class="btn btn-outline btn-sm edit-cal-bk-btn" data-bid="${escapeHtml(b.id)}">
            Edit &amp; Manage
          </button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;

  listEl.querySelectorAll(".edit-cal-bk-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const bid = btn.dataset.bid;
      const bk = bookingsData.find((item) => String(item.id || item.bookingId || item.bookingNumber) === String(bid));
      if (bk) {
        openAdminEditBookingModal(bk);
      }
    });
  });
}

function openAdminAddBookingModal(prefilledDateStr) {
  const form = $("adminAddBookingForm");
  if (form) form.reset();

  populateAdminVehicleDropdowns();

  const now = new Date();
  let pDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
  let rDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0);

  if (prefilledDateStr) {
    const parts = prefilledDateStr.split("-");
    if (parts.length === 3) {
      const yr = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10) - 1;
      const dy = parseInt(parts[2], 10);
      pDate = new Date(yr, mo, dy, 10, 0, 0);
      rDate = new Date(yr, mo, dy + 1, 10, 0, 0);
    }
  }

  const pickupInput = $("addBkPickupDate");
  const returnInput = $("addBkReturnDate");
  if (pickupInput) pickupInput.value = formatInputDateTime(pDate);
  if (returnInput) returnInput.value = formatInputDateTime(rDate);

  showModal("adminAddBookingModal");
}

async function handleAdminCreateBooking(e) {
  e.preventDefault();
  const name = $("addBkCustomerName")?.value.trim() || "";
  const phone = $("addBkCustomerPhone")?.value.trim() || "";
  const email = $("addBkCustomerEmail")?.value.trim() || "";
  const vehicleReg = $("addBkVehicleSelect")?.value.trim() || "";
  const pickupDate = $("addBkPickupDate")?.value || "";
  const dropDate = $("addBkReturnDate")?.value || "";
  const status = $("addBkStatus")?.value || "confirmed";
  const totalAmount = parseFloat($("addBkTotalAmount")?.value || "0") || 0;
  const notes = $("addBkNotes")?.value.trim() || "";

  if (!name || !phone || !pickupDate || !dropDate) {
    alert("Please fill in all required booking fields.");
    return;
  }

  const saveBtn = $("saveAddBookingBtn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Creating...";
  }

  try {
    const payload = {
      customerName: name,
      userName: name,
      userPhone: phone,
      userEmail: email,
      vehicleReg: vehicleReg,
      pickupDate: pickupDate,
      dropDate: dropDate,
      status: status,
      bookingStatus: status,
      totalAmount: totalAmount,
      baseAmount: totalAmount,
      location: notes || "Ghansoli Branch"
    };

    const res = await api.post("/bookings", payload);
    if (res && res.success) {
      hideModal("adminAddBookingModal");
      await loadAdminCalendar();
      if (typeof loadBookings === "function") loadBookings();
    } else {
      alert("Could not create booking: " + (res?.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Error creating booking:", err);
    alert("Error creating booking: " + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Create Booking";
    }
  }
}

function openAdminEditBookingModal(booking) {
  if (!booking) return;
  activeEditingBooking = booking;

  populateAdminVehicleDropdowns();

  const id = booking.id || booking.bookingId || booking.bookingNumber || "";
  const norm = normalizeCalendarBooking(booking);

  const titleEl = $("adminEditBookingTitle");
  if (titleEl) titleEl.textContent = `Edit Booking #${id.slice(0, 8)}`;

  const idInput = $("editBkId");
  if (idInput) idInput.value = id;

  const nameInput = $("editBkCustomerName");
  if (nameInput) nameInput.value = norm.userName;

  const phoneInput = $("editBkCustomerPhone");
  if (phoneInput) phoneInput.value = norm.userPhone;

  const emailInput = $("editBkCustomerEmail");
  if (emailInput) emailInput.value = norm.userEmail;

  const vehicleSelect = $("editBkVehicleSelect");
  if (vehicleSelect) vehicleSelect.value = norm.carReg || "";

  const pickupInput = $("editBkPickupDate");
  if (pickupInput && norm.pickupDate) pickupInput.value = formatInputDateTime(norm.pickupDate);

  const returnInput = $("editBkReturnDate");
  if (returnInput && norm.dropDate) returnInput.value = formatInputDateTime(norm.dropDate);

  const statusSelect = $("editBkStatus");
  if (statusSelect) {
    statusSelect.value = norm.status || "confirmed";
  }

  const amountInput = $("editBkTotalAmount");
  if (amountInput) amountInput.value = norm.totalAmount || 0;

  showModal("adminEditBookingModal");
}

async function handleAdminSaveEditBooking(e) {
  e.preventDefault();
  const id = $("editBkId")?.value.trim();
  if (!id) return;

  const name = $("editBkCustomerName")?.value.trim() || "";
  const phone = $("editBkCustomerPhone")?.value.trim() || "";
  const email = $("editBkCustomerEmail")?.value.trim() || "";
  const vehicleReg = $("editBkVehicleSelect")?.value.trim() || "";
  const pickupDate = $("editBkPickupDate")?.value || "";
  const dropDate = $("editBkReturnDate")?.value || "";
  const status = $("editBkStatus")?.value || "confirmed";
  const totalAmount = parseFloat($("editBkTotalAmount")?.value || "0") || 0;

  const saveBtn = $("saveEditBookingBtn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
  }

  try {
    const payload = {
      userName: name,
      userPhone: phone,
      userEmail: email,
      vehicleReg: vehicleReg,
      pickupDate: pickupDate,
      dropDate: dropDate,
      status: status,
      bookingStatus: status,
      totalAmount: totalAmount
    };

    const res = await api.put(`/bookings/detail.php?id=${encodeURIComponent(id)}`, payload);
    if (res && res.success) {
      hideModal("adminEditBookingModal");
      await loadAdminCalendar();
      if (typeof loadBookings === "function") loadBookings();
    } else {
      alert("Could not update booking: " + (res?.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Error saving booking:", err);
    alert("Error updating booking: " + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
    }
  }
}

async function handleAdminCancelBookingAction() {
  const id = $("editBkId")?.value.trim();
  if (!id) return;

  if (!confirm(`Are you sure you want to cancel booking #${id.slice(0, 8)}?`)) {
    return;
  }

  try {
    const res = await api.put(`/bookings/detail.php?id=${encodeURIComponent(id)}`, {
      status: "cancelled",
      bookingStatus: "cancelled"
    });
    if (res && res.success) {
      hideModal("adminEditBookingModal");
      await loadAdminCalendar();
      if (typeof loadBookings === "function") loadBookings();
    } else {
      alert("Could not cancel booking: " + (res?.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Error cancelling booking:", err);
    alert("Error cancelling booking: " + err.message);
  }
}

async function handleAdminDeleteBookingAction() {
  const id = $("editBkId")?.value.trim();
  if (!id) return;

  if (!confirm(`PERMANENT ACTION:\nAre you sure you want to completely DELETE booking #${id.slice(0, 8)}?\nThis cannot be undone.`)) {
    return;
  }

  try {
    const res = await api.delete(`/bookings/detail.php?id=${encodeURIComponent(id)}`);
    if (res && (res.success || res.status === 200)) {
      // Remove locally from state
      bookingsData = bookingsData.filter((b) => String(b.id || b.bookingId || b.bookingNumber) !== String(id));
      hideModal("adminEditBookingModal");
      renderAdminCalendarView();
      if (typeof loadBookings === "function") loadBookings();
      alert(`Booking #${id.slice(0, 8)} has been permanently deleted.`);
    } else {
      alert("Could not delete booking: " + (res?.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Error deleting booking:", err);
    alert("Error deleting booking: " + err.message);
  }
}

// ============================================================================
// GLOBAL ERROR LOGGING
// ============================================================================

window.addEventListener(
  "error",
  (event) => {
    console.error(
      "ADMIN PAGE ERROR:",
      event.error ||
        event.message
    );
  }
);

window.addEventListener(
  "unhandledrejection",
  (event) => {
    console.error(
      "ADMIN PROMISE ERROR:",
      event.reason
    );
  }
);

console.log(
  "KRUIZLY Admin JS loaded successfully."
);
// Add Customer Analytics calculation and render functions in js/admin.js

let custFilterFromDate = null;
let custFilterToDate = null;
let custQuickFilter = "all_time";

function initCustomerAnalyticsEvents() {
  const dateFrom = document.getElementById("custDateFrom");
  const dateTo = document.getElementById("custDateTo");
  const applyBtn = document.getElementById("custApplyFilterBtn");
  const resetBtn = document.getElementById("custResetFilterBtn");
  const quickPills = document.querySelectorAll(".cust-quick-pill");

  quickPills.forEach(pill => {
    pill.addEventListener("click", () => {
      custQuickFilter = pill.dataset.range;
      quickPills.forEach(p => p.classList.toggle("active", p === pill));

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      if (custQuickFilter === "today") {
        custFilterFromDate = todayStart;
        custFilterToDate = todayEnd;
      } else if (custQuickFilter === "yesterday") {
        const yestStart = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1);
        const yestEnd = new Date(todayEnd); yestEnd.setDate(yestEnd.getDate() - 1);
        custFilterFromDate = yestStart;
        custFilterToDate = yestEnd;
      } else if (custQuickFilter === "this_week") {
        const dayOfWeek = now.getDay(); // Sunday to Saturday as 1 week
        const startOfWeek = new Date(todayStart);
        startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
        custFilterFromDate = startOfWeek;
        custFilterToDate = todayEnd;
      } else if (custQuickFilter === "this_month") {
        custFilterFromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        custFilterToDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (custQuickFilter === "last_month") {
        custFilterFromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        custFilterToDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      } else if (custQuickFilter === "this_year") {
        custFilterFromDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        custFilterToDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      } else {
        custFilterFromDate = null;
        custFilterToDate = null;
      }

      if (dateFrom) dateFrom.value = custFilterFromDate ? custFilterFromDate.toISOString().slice(0, 10) : "";
      if (dateTo) dateTo.value = custFilterToDate ? custFilterToDate.toISOString().slice(0, 10) : "";

      renderCustomerAnalytics();
    });
  });

  applyBtn?.addEventListener("click", () => {
    custFilterFromDate = dateFrom?.value ? new Date(`${dateFrom.value}T00:00:00`) : null;
    custFilterToDate = dateTo?.value ? new Date(`${dateTo.value}T23:59:59`) : null;
    custQuickFilter = "custom";
    quickPills.forEach(p => p.classList.remove("active"));
    renderCustomerAnalytics();
  });

  resetBtn?.addEventListener("click", () => {
    if (dateFrom) dateFrom.value = "";
    if (dateTo) dateTo.value = "";
    custFilterFromDate = null;
    custFilterToDate = null;
    custQuickFilter = "all_time";
    quickPills.forEach(p => p.classList.toggle("active", p.dataset.range === "all_time"));
    renderCustomerAnalytics();
  });
}

function renderCustomerAnalytics() {
  const custTotalUsersEl = document.getElementById("custTotalUsers");
  const custTotalCustomersEl = document.getElementById("custTotalCustomers");
  const custMonthCustomersEl = document.getElementById("custMonthCustomers");
  const custNewCustomersMonthEl = document.getElementById("custNewCustomersMonth");
  const custRepeatCustomersEl = document.getElementById("custRepeatCustomers");
  const tbody = document.getElementById("custMonthlyTableBody");

  if (!custTotalUsersEl && !tbody) return;

  // Filter Bookings by Period
  const validBookings = bookingsData.filter(b => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    return bStat !== "cancelled" && bStat !== "rejected";
  });

  const periodBookings = validBookings.filter(b => {
    if (!custFilterFromDate && !custFilterToDate) return true;
    const pDate = parseDateOnly(b.pickupDate || b.createdAt);
    if (!pDate) return true;
    const pMs = pDate.getTime();
    const startMs = custFilterFromDate ? custFilterFromDate.getTime() : 0;
    const endMs = custFilterToDate ? custFilterToDate.getTime() : Infinity;
    return pMs >= startMs && pMs <= endMs;
  });

  // 1. Total Registered Users
  const totalUsersCount = usersData.length;
  if (custTotalUsersEl) custTotalUsersEl.textContent = String(totalUsersCount);

  // 2. Total Customers (Unique Users with at least 1 valid booking in period)
  const uniqueCustomerIds = new Set(periodBookings.map(b => (b.firebaseUid || b.userId || b.userEmail || b.userName).trim()).filter(Boolean));
  if (custTotalCustomersEl) custTotalCustomersEl.textContent = String(uniqueCustomerIds.size);

  // 3. This Month's Customers
  const now = new Date();
  const targetMonthDate = custFilterFromDate || now;
  const targetMonth = targetMonthDate.getMonth();
  const targetYear = targetMonthDate.getFullYear();

  const monthBookings = validBookings.filter(b => {
    const d = parseDateOnly(b.pickupDate || b.createdAt);
    return d && d.getMonth() === targetMonth && d.getFullYear() === targetYear;
  });
  const monthCustomerIds = new Set(monthBookings.map(b => (b.firebaseUid || b.userId || b.userEmail || b.userName).trim()).filter(Boolean));
  if (custMonthCustomersEl) custMonthCustomersEl.textContent = String(monthCustomerIds.size);

  // 4. New Customers This Month (First valid booking ever occurred in target month)
  const customerFirstBookingMap = new Map();
  validBookings.forEach(b => {
    const custId = (b.firebaseUid || b.userId || b.userEmail || b.userName).trim();
    if (!custId) return;
    const d = parseDateOnly(b.pickupDate || b.createdAt);
    if (!d) return;

    if (!customerFirstBookingMap.has(custId) || d < customerFirstBookingMap.get(custId)) {
      customerFirstBookingMap.set(custId, d);
    }
  });

  let newCustomersThisMonthCount = 0;
  customerFirstBookingMap.forEach((firstDate) => {
    if (firstDate.getMonth() === targetMonth && firstDate.getFullYear() === targetYear) {
      newCustomersThisMonthCount++;
    }
  });
  if (custNewCustomersMonthEl) custNewCustomersMonthEl.textContent = String(newCustomersThisMonthCount);

  // 5. Repeat Customers (Customers with > 1 valid booking)
  const customerBookingCountMap = new Map();
  periodBookings.forEach(b => {
    const custId = (b.firebaseUid || b.userId || b.userEmail || b.userName).trim();
    if (!custId) return;
    customerBookingCountMap.set(custId, (customerBookingCountMap.get(custId) || 0) + 1);
  });

  let repeatCount = 0;
  customerBookingCountMap.forEach((count) => {
    if (count > 1) repeatCount++;
  });
  if (custRepeatCustomersEl) custRepeatCustomersEl.textContent = String(repeatCount);

  // 6. Monthly Breakdown Table (Jan - Dec)
  if (tbody) {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const rows = monthNames.map((mName, mIdx) => {
      // New Registered Users in month
      const newUsersCount = usersData.filter(u => {
        const uDate = parseDateOnly(u.createdAt);
        return uDate && uDate.getMonth() === mIdx && uDate.getFullYear() === targetYear;
      }).length;

      // Bookings in month
      const mBookings = validBookings.filter(b => {
        const bDate = parseDateOnly(b.pickupDate || b.createdAt);
        return bDate && bDate.getMonth() === mIdx && bDate.getFullYear() === targetYear;
      });

      // Customers in month
      const mCusts = new Set(mBookings.map(b => (b.firebaseUid || b.userId || b.userEmail || b.userName).trim()).filter(Boolean));

      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px;">
          <td style="padding: 12px 14px;"><strong style="color:#ffffff;">${mName} ${targetYear}</strong></td>
          <td style="padding: 12px 14px; color:#4fd7ff;">${newUsersCount}</td>
          <td style="padding: 12px 14px; color:#06d6a0;"><strong>${mCusts.size}</strong></td>
          <td style="padding: 12px 14px; color:#ffffff;"><strong>${mBookings.length}</strong></td>
        </tr>`;
    });

    tbody.innerHTML = rows.join("");
  }
}

/* ============================================================
   BOOKINGS & RESERVATIONS ANALYTICS TAB CONTROLLER
   ============================================================ */

let bookAnFilterFromDate = null;
let bookAnFilterToDate = null;
let bookAnQuickFilter = "all_time";

function initBookingsAnalyticsEvents() {
  const quickPills = document.querySelectorAll(".bookan-quick-pill");
  const dateFrom = document.getElementById("bookAnDateFrom");
  const dateTo = document.getElementById("bookAnDateTo");
  const applyBtn = document.getElementById("bookAnApplyFilterBtn");
  const resetBtn = document.getElementById("bookAnResetFilterBtn");

  quickPills.forEach(pill => {
    pill.addEventListener("click", () => {
      quickPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      bookAnQuickFilter = pill.dataset.range;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      if (bookAnQuickFilter === "today") {
        bookAnFilterFromDate = todayStart;
        bookAnFilterToDate = todayEnd;
      } else if (bookAnQuickFilter === "yesterday") {
        bookAnFilterFromDate = new Date(todayStart.getTime() - 86400000);
        bookAnFilterToDate = new Date(todayEnd.getTime() - 86400000);
      } else if (bookAnQuickFilter === "this_week") {
        const day = todayStart.getDay();
        const diff = todayStart.getDate() - day + (day === 0 ? -6 : 1);
        bookAnFilterFromDate = new Date(todayStart.setDate(diff));
        bookAnFilterToDate = todayEnd;
      } else if (bookAnQuickFilter === "this_month") {
        bookAnFilterFromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        bookAnFilterToDate = todayEnd;
      } else if (bookAnQuickFilter === "last_month") {
        bookAnFilterFromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
        bookAnFilterToDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      } else if (bookAnQuickFilter === "this_year") {
        bookAnFilterFromDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
        bookAnFilterToDate = todayEnd;
      } else {
        bookAnFilterFromDate = null;
        bookAnFilterToDate = null;
      }

      if (dateFrom) dateFrom.value = bookAnFilterFromDate ? bookAnFilterFromDate.toISOString().slice(0, 10) : "";
      if (dateTo) dateTo.value = bookAnFilterToDate ? bookAnFilterToDate.toISOString().slice(0, 10) : "";

      renderBookingsAnalytics();
    });
  });

  applyBtn?.addEventListener("click", () => {
    bookAnFilterFromDate = dateFrom?.value ? new Date(`${dateFrom.value}T00:00:00`) : null;
    bookAnFilterToDate = dateTo?.value ? new Date(`${dateTo.value}T23:59:59`) : null;
    bookAnQuickFilter = "custom";
    quickPills.forEach(p => p.classList.remove("active"));
    renderBookingsAnalytics();
  });

  resetBtn?.addEventListener("click", () => {
    if (dateFrom) dateFrom.value = "";
    if (dateTo) dateTo.value = "";
    bookAnFilterFromDate = null;
    bookAnFilterToDate = null;
    bookAnQuickFilter = "all_time";
    quickPills.forEach(p => p.classList.toggle("active", p.dataset.range === "all_time"));
    renderBookingsAnalytics();
  });
}

function renderBookingsAnalytics() {
  const totalBookingsEl = document.getElementById("bookAnTotalBookings");
  const paidBookingsEl = document.getElementById("bookAnPaidBookings");
  const pendingVerifEl = document.getElementById("bookAnPendingVerification");
  const activeRentalsEl = document.getElementById("bookAnActiveRentals");
  const cancelledBookingsEl = document.getElementById("bookAnCancelledBookings");
  const tbody = document.getElementById("bookAnMonthlyTableBody");

  if (!totalBookingsEl && !tbody) return;

  // Filter Bookings by Selected Date Range
  const filteredBookings = bookingsData.filter(b => {
    if (!bookAnFilterFromDate && !bookAnFilterToDate) return true;
    const pDate = parseDateOnly(b.pickupDate || b.createdAt);
    if (!pDate) return true;
    const pMs = pDate.getTime();
    const startMs = bookAnFilterFromDate ? bookAnFilterFromDate.getTime() : 0;
    const endMs = bookAnFilterToDate ? bookAnFilterToDate.getTime() : Infinity;
    return pMs >= startMs && pMs <= endMs;
  });

  // 1. Total Bookings
  if (totalBookingsEl) totalBookingsEl.textContent = String(filteredBookings.length);

  // 2. Paid & Confirmed Bookings
  const paidList = filteredBookings.filter(b => {
    const pStat = String(b.paymentStatus || "").toLowerCase();
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    return pStat === "paid" || pStat === "advance_paid" || bStat === "confirmed" || bStat === "completed" || bStat === "verified";
  });
  if (paidBookingsEl) paidBookingsEl.textContent = String(paidList.length);

  // 3. Pending Payment Verification
  const pendingList = filteredBookings.filter(b => {
    const pStat = String(b.paymentStatus || "").toLowerCase();
    return pStat === "pending_verification" || pStat === "pending";
  });
  if (pendingVerifEl) pendingVerifEl.textContent = String(pendingList.length);

  // 4. Active / On-Road
  const nowMs = Date.now();
  const activeRentals = filteredBookings.filter(b => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    if (bStat === "cancelled" || bStat === "rejected") return false;
    const start = parseDateOnly(b.pickupDate)?.getTime() || 0;
    const end = parseDateOnly(b.dropDate)?.getTime() || Infinity;
    return start <= nowMs && end >= nowMs;
  });
  if (activeRentalsEl) activeRentalsEl.textContent = String(activeRentals.length);

  // 5. Cancelled / Rejected
  const cancelledList = filteredBookings.filter(b => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    const pStat = String(b.paymentStatus || "").toLowerCase();
    return bStat === "cancelled" || bStat === "rejected" || pStat === "rejected";
  });
  if (cancelledBookingsEl) cancelledBookingsEl.textContent = String(cancelledList.length);

  // 6. Monthly Breakdown Table
  if (tbody) {
    const now = new Date();
    const targetYear = bookAnFilterFromDate ? bookAnFilterFromDate.getFullYear() : now.getFullYear();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const rows = monthNames.map((mName, mIdx) => {
      const mBookings = bookingsData.filter(b => {
        const bDate = parseDateOnly(b.pickupDate || b.createdAt);
        return bDate && bDate.getMonth() === mIdx && bDate.getFullYear() === targetYear;
      });

      const mPaid = mBookings.filter(b => {
        const pStat = String(b.paymentStatus || "").toLowerCase();
        const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
        return pStat === "paid" || pStat === "advance_paid" || bStat === "confirmed" || bStat === "completed";
      });

      const mCancelled = mBookings.filter(b => {
        const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
        return bStat === "cancelled" || bStat === "rejected";
      });

      const mRevenue = mPaid.reduce((sum, b) => {
        const amt = Number(b.paymentAmountPaid || b.paymentAmount || b.totalAmount || b.amount || 0);
        return sum + (Number.isFinite(amt) ? amt : 0);
      }, 0);

      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px;">
          <td style="padding: 12px 14px;"><strong style="color:#ffffff;">${mName} ${targetYear}</strong></td>
          <td style="padding: 12px 14px; color:#4fd7ff;"><strong>${mBookings.length}</strong></td>
          <td style="padding: 12px 14px; color:#06d6a0;"><strong>${mPaid.length}</strong></td>
          <td style="padding: 12px 14px; color:#ff5c77;">${mCancelled.length}</td>
          <td style="padding: 12px 14px; color:#ffd166;"><strong>${formatINR(mRevenue)}</strong></td>
        </tr>`;
    });

    tbody.innerHTML = rows.join("");
  }
}
