import { getCurrentUser, checkAuth, isManagerUser, isAdminUser, isExecutiveUser } from "./auth.js?v=20260907-v2";
import { api } from "./kruizly-api.js?v=20260907-v5";
import "./nav-helper.js";

/* ============================================================
   KRUIZLY MANAGER SUMMARY DASHBOARD
   Read-only business analytics, revenue tracking, and fleet performance
   ============================================================ */

const content = document.getElementById("managerContent");
const denied = document.getElementById("managerAccessDenied");

// Date Filters
const dateFromInput = document.getElementById("mgrDateFrom");
const dateToInput = document.getElementById("mgrDateTo");
const applyFilterBtn = document.getElementById("mgrApplyFilterBtn");
const resetFilterBtn = document.getElementById("mgrResetFilterBtn");
const periodLabel = document.getElementById("mgrPeriodLabel");
const quickPills = document.querySelectorAll(".mgr-quick-pill");
const fleetSortSelect = document.getElementById("mgrFleetSortSelect");

// Data State
let rawBookings = [];
let rawVehicles = [];
let activeQuickFilter = "all_time";
let filterFromDate = null; // Date object or null
let filterToDate = null;   // Date object or null

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

function parseDate(value) {
  const millis = toMillis(value);
  return millis ? new Date(millis) : null;
}

function formatINR(value) {
  const number = Number(value || 0);
  return `?${Math.round(number).toLocaleString("en-IN")}`;
}

function formatDateDisplay(dateObj) {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return "—";
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

function bookingAmount(b) {
  return Number(b.totalAmount ?? b.amount ?? b.finalAmount ?? b.total ?? 0) || 0;
}

function isVerifiedRevenue(b) {
  const pStat = String(b.paymentStatus || "").toLowerCase();
  const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
  
  if (pStat === "rejected" || bStat === "cancelled" || bStat === "rejected") {
    return false;
  }
  return pStat === "paid" || pStat === "verified" || pStat === "advance_paid" || bStat === "confirmed" || bStat === "completed" || bStat === "active";
}

/* ============================================================
   DATE FILTERING LOGIC
   ============================================================ */

function setQuickFilter(type) {
  activeQuickFilter = type;
  quickPills.forEach(pill => {
    pill.classList.toggle("active", pill.dataset.range === type);
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (type === "today") {
    filterFromDate = todayStart;
    filterToDate = todayEnd;
  } else if (type === "yesterday") {
    const yestStart = new Date(todayStart);
    yestStart.setDate(yestStart.getDate() - 1);
    const yestEnd = new Date(todayEnd);
    yestEnd.setDate(yestEnd.getDate() - 1);
    filterFromDate = yestStart;
    filterToDate = yestEnd;
  } else if (type === "this_week") {
    const dayOfWeek = now.getDay(); // 0 is Sunday
    const startOfWeek = new Date(todayStart);
    startOfWeek.setDate(startOfWeek.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // Mon
    filterFromDate = startOfWeek;
    filterToDate = todayEnd;
  } else if (type === "this_month") {
    filterFromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    filterToDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (type === "last_month") {
    filterFromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    filterToDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (type === "this_year") {
    filterFromDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    filterToDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else {
    // All Time
    filterFromDate = null;
    filterToDate = null;
  }

  updateDateInputs();
  renderDashboard();
}

function updateDateInputs() {
  if (dateFromInput) {
    dateFromInput.value = filterFromDate ? filterFromDate.toISOString().slice(0, 10) : "";
  }
  if (dateToInput) {
    dateToInput.value = filterToDate ? filterToDate.toISOString().slice(0, 10) : "";
  }
}

function applyCustomDateInputs() {
  const fromVal = dateFromInput?.value;
  const toVal = dateToInput?.value;

  if (fromVal) {
    filterFromDate = new Date(`${fromVal}T00:00:00`);
  } else {
    filterFromDate = null;
  }

  if (toVal) {
    filterToDate = new Date(`${toVal}T23:59:59`);
  } else {
    filterToDate = null;
  }

  activeQuickFilter = "custom";
  quickPills.forEach(pill => pill.classList.remove("active"));
  renderDashboard();
}

function isBookingInPeriod(b, startRange, endRange) {
  if (!startRange && !endRange) return true;

  const bStart = parseDate(b.pickupDate || b.startDate || b.createdAt);
  const bEnd = parseDate(b.dropDate || b.endDate || b.pickupDate || b.createdAt);

  if (!bStart && !bEnd) return true;

  const startMs = startRange ? startRange.getTime() : 0;
  const endMs = endRange ? endRange.getTime() : Infinity;

  const tripStartMs = bStart ? bStart.getTime() : (bEnd ? bEnd.getTime() : 0);
  const tripEndMs = bEnd ? bEnd.getTime() : (bStart ? bStart.getTime() : Infinity);

  // Overlap condition: tripStart <= endRange AND tripEnd >= startRange
  return tripStartMs <= endMs && tripEndMs >= startMs;
}

/* ============================================================
   MAIN DASHBOARD RENDERER
   ============================================================ */

function renderDashboard() {
  if (!content) return;

  // Period label update
  if (periodLabel) {
    if (!filterFromDate && !filterToDate) {
      periodLabel.textContent = "All Time";
    } else {
      const fromStr = filterFromDate ? formatDateDisplay(filterFromDate) : "Beginning";
      const toStr = filterToDate ? formatDateDisplay(filterToDate) : "Present";
      periodLabel.textContent = `${fromStr} ? ${toStr}`;
    }
  }

  // Filter Bookings for Selected Period
  const periodBookings = rawBookings.filter(b => isBookingInPeriod(b, filterFromDate, filterToDate));
  const verifiedBookings = periodBookings.filter(b => isVerifiedRevenue(b));

  // KPI 1: TOTAL REVENUE
  const totalRevenue = verifiedBookings.reduce((sum, b) => sum + bookingAmount(b), 0);
  const kpiTotalRevenueEl = document.getElementById("kpiTotalRevenue");
  if (kpiTotalRevenueEl) kpiTotalRevenueEl.textContent = formatINR(totalRevenue);

  // KPI 2: ACTIVE TRIPS
  const now = new Date();
  const activeTripsCount = rawBookings.filter(b => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    if (bStat === "cancelled" || bStat === "rejected") return false;
    const bStart = parseDate(b.pickupDate || b.startDate);
    const bEnd = parseDate(b.dropDate || b.endDate);
    const isPickedUp = b.pickupStatus === "picked_up" || bStat === "active";
    if (isPickedUp && bStat !== "completed") return true;
    if (bStart && bEnd && bStart <= now && bEnd >= now && bStat !== "completed") return true;
    return false;
  }).length;
  const kpiActiveTripsEl = document.getElementById("kpiActiveTrips");
  if (kpiActiveTripsEl) kpiActiveTripsEl.textContent = String(activeTripsCount);

  // KPI 3: COMPLETED TRIPS
  const completedTripsCount = periodBookings.filter(b => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    return bStat === "completed";
  }).length;
  const kpiCompletedTripsEl = document.getElementById("kpiCompletedTrips");
  if (kpiCompletedTripsEl) kpiCompletedTripsEl.textContent = String(completedTripsCount);

  // KPI 4: REVENUE THIS MONTH (Month represented by selected range or current month)
  const targetMonthDate = filterFromDate || now;
  const targetMonth = targetMonthDate.getMonth();
  const targetYear = targetMonthDate.getFullYear();
  
  const monthRevenue = rawBookings.filter(b => {
    if (!isVerifiedRevenue(b)) return false;
    const d = parseDate(b.pickupDate || b.createdAt);
    return d && d.getMonth() === targetMonth && d.getFullYear() === targetYear;
  }).reduce((sum, b) => sum + bookingAmount(b), 0);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const kpiRevenueThisMonthEl = document.getElementById("kpiRevenueThisMonth");
  const kpiRevenueMonthSubEl = document.getElementById("kpiRevenueMonthSub");
  if (kpiRevenueThisMonthEl) kpiRevenueThisMonthEl.textContent = formatINR(monthRevenue);
  if (kpiRevenueMonthSubEl) kpiRevenueMonthSubEl.textContent = `${monthNames[targetMonth]} ${targetYear} Revenue`;

  // KPI 5: TOTAL BOOKINGS
  const totalBookingsCount = periodBookings.filter(b => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    return bStat !== "cancelled" && bStat !== "rejected";
  }).length;
  const kpiTotalBookingsEl = document.getElementById("kpiTotalBookings");
  if (kpiTotalBookingsEl) kpiTotalBookingsEl.textContent = String(totalBookingsCount);

  // KPI 6: AVERAGE OCCUPANCY (%)
  // Formula: Booked Vehicle-Days / (Available Fleet Count * Days in Period)
  let periodDays = 30;
  if (filterFromDate && filterToDate) {
    const diffMs = filterToDate.getTime() - filterFromDate.getTime();
    periodDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  } else if (rawBookings.length) {
    const dates = rawBookings.map(b => parseDate(b.pickupDate || b.createdAt)).filter(Boolean);
    if (dates.length) {
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      const diffMs = maxDate.getTime() - minDate.getTime();
      periodDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }
  }

  const activeFleetCount = Math.max(1, rawVehicles.length || 10);
  const totalAvailableVehicleDays = activeFleetCount * periodDays;
  
  let totalBookedVehicleDays = 0;
  verifiedBookings.forEach(b => {
    const days = Math.max(1, Number(b.days) || 1);
    totalBookedVehicleDays += days;
  });

  const occupancyPct = Math.min(100, Math.round((totalBookedVehicleDays / totalAvailableVehicleDays) * 100));
  const kpiAvgOccupancyEl = document.getElementById("kpiAvgOccupancy");
  if (kpiAvgOccupancyEl) kpiAvgOccupancyEl.textContent = `${occupancyPct}%`;

  // KPI 7: PER FLEET AMOUNT (Average revenue per vehicle)
  const perFleetAmount = activeFleetCount ? (totalRevenue / activeFleetCount) : 0;
  const kpiPerFleetAmountEl = document.getElementById("kpiPerFleetAmount");
  if (kpiPerFleetAmountEl) {
    kpiPerFleetAmountEl.innerHTML = `${formatINR(perFleetAmount)} <span style="font-size:13px;font-weight:600;color:var(--sub);">/ vehicle</span>`;
  }

  /* ============================================================
     FLEET PERFORMANCE TABLE CALCULATIONS
     ============================================================ */

  // Group verified bookings by vehicle regNo / vehicleName
  const vehicleStatsMap = new Map();

  // Initialize from vehicles catalog
  rawVehicles.forEach(v => {
    const key = (v.regNo || v.reg_no || v.model || v.brand || "UNKNOWN").trim().toUpperCase();
    vehicleStatsMap.set(key, {
      carName: `${v.brand || ""} ${v.model || ""}`.trim() || "Vehicle",
      regNo: v.regNo || v.reg_no || "—",
      bookingsCount: 0,
      bookedDays: 0,
      revenue: 0,
      bookingDatesList: []
    });
  });

  let unmappedRevenue = 0;

  verifiedBookings.forEach(b => {
    const reg = (b.vehicleReg || b.regNo || "").trim().toUpperCase();
    const name = (b.vehicleName || b.carName || "Rental Vehicle").trim();
    const key = reg || name.toUpperCase();

    let entry = vehicleStatsMap.get(key);
    if (!entry) {
      // Find matching entry by partial name
      for (const [k, v] of vehicleStatsMap.entries()) {
        if (k.includes(reg) || v.carName.toUpperCase().includes(name.toUpperCase())) {
          entry = v;
          break;
        }
      }
    }

    if (!entry) {
      entry = {
        carName: name,
        regNo: reg || "Not Assigned",
        bookingsCount: 0,
        bookedDays: 0,
        revenue: 0,
        bookingDatesList: []
      };
      vehicleStatsMap.set(key, entry);
    }

    entry.bookingsCount += 1;
    const days = Math.max(1, Number(b.days) || 1);
    entry.bookedDays += days;
    const amt = bookingAmount(b);
    entry.revenue += amt;

    const pDate = parseDate(b.pickupDate);
    const dDate = parseDate(b.dropDate);
    if (pDate && dDate) {
      entry.bookingDatesList.push(`${formatDateDisplay(pDate)} ? ${formatDateDisplay(dDate)}`);
    }
  });

  const fleetList = Array.from(vehicleStatsMap.values());

  // KPI 8: PER FLEET REVENUE % (Top vehicle share)
  let topVehicle = null;
  fleetList.forEach(v => {
    if (!topVehicle || v.revenue > topVehicle.revenue) {
      topVehicle = v;
    }
  });

  const topSharePct = (totalRevenue && topVehicle) ? Math.round((topVehicle.revenue / totalRevenue) * 100) : 0;
  const kpiFleetRevShareEl = document.getElementById("kpiFleetRevShare");
  const kpiFleetRevShareSubEl = document.getElementById("kpiFleetRevShareSub");
  if (kpiFleetRevShareEl) kpiFleetRevShareEl.textContent = `${topSharePct}%`;
  if (kpiFleetRevShareSubEl) {
    kpiFleetRevShareSubEl.textContent = topVehicle && topVehicle.revenue ? `${topVehicle.carName} contribution` : "Share of total revenue";
  }

  // TOP PERFORMER CARD
  const topCarNameEl = document.getElementById("topCarName");
  const topCarStatsEl = document.getElementById("topCarStats");
  if (topCarNameEl) topCarNameEl.textContent = topVehicle && topVehicle.revenue ? topVehicle.carName : "No bookings in period";
  if (topCarStatsEl) {
    topCarStatsEl.textContent = topVehicle && topVehicle.revenue
      ? `${formatINR(topVehicle.revenue)} · ${topVehicle.bookingsCount} Bookings (${topVehicle.bookedDays} Days)`
      : "?0 · 0 Bookings";
  }

  // SALES PERFORMANCE CARDS
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daySales = rawBookings.filter(b => {
    if (!isVerifiedRevenue(b)) return false;
    const d = parseDate(b.pickupDate || b.createdAt);
    return d && d.getTime() >= todayStartMs;
  }).reduce((sum, b) => sum + bookingAmount(b), 0);

  const startOfWeekMs = todayStartMs - (now.getDay() === 0 ? 6 : now.getDay() - 1) * 86400000;
  const weekSales = rawBookings.filter(b => {
    if (!isVerifiedRevenue(b)) return false;
    const d = parseDate(b.pickupDate || b.createdAt);
    return d && d.getTime() >= startOfWeekMs;
  }).reduce((sum, b) => sum + bookingAmount(b), 0);

  const startOfMonthMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthSales = rawBookings.filter(b => {
    if (!isVerifiedRevenue(b)) return false;
    const d = parseDate(b.pickupDate || b.createdAt);
    return d && d.getTime() >= startOfMonthMs;
  }).reduce((sum, b) => sum + bookingAmount(b), 0);

  const overallSales = rawBookings.filter(b => isVerifiedRevenue(b)).reduce((sum, b) => sum + bookingAmount(b), 0);

  document.getElementById("salesDay") && (document.getElementById("salesDay").textContent = formatINR(daySales));
  document.getElementById("salesWeek") && (document.getElementById("salesWeek").textContent = formatINR(weekSales));
  document.getElementById("salesMonth") && (document.getElementById("salesMonth").textContent = formatINR(monthSales));
  document.getElementById("salesOverall") && (document.getElementById("salesOverall").textContent = formatINR(overallSales));

  // FLEET TABLE SORTING
  const sortMode = fleetSortSelect ? fleetSortSelect.value : "revenue";
  fleetList.sort((a, b) => {
    if (sortMode === "bookings") return b.bookingsCount - a.bookingsCount;
    if (sortMode === "days") return b.bookedDays - a.bookedDays;
    if (sortMode === "avg") {
      const avgA = a.bookingsCount ? (a.revenue / a.bookingsCount) : 0;
      const avgB = b.bookingsCount ? (b.revenue / b.bookingsCount) : 0;
      return avgB - avgA;
    }
    if (sortMode === "car") return a.carName.localeCompare(b.carName);
    return b.revenue - a.revenue; // Default revenue DESC
  });

  // RENDER FLEET TABLE BODY
  const tbody = document.getElementById("mgrFleetTableBody");
  const tfoot = document.getElementById("mgrFleetTableFoot");

  if (tbody) {
    if (!fleetList.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 24px; text-align: center; color: var(--sub);">
            No fleet performance data available for the selected period.
          </td>
        </tr>`;
    } else {
      tbody.innerHTML = fleetList.map(item => {
        const avgRev = item.bookingsCount ? Math.round(item.revenue / item.bookingsCount) : 0;
        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13.5px; transition: background 0.15s ease;">
            <td style="padding: 14px;"><strong style="color: #4fd7ff;">${item.bookingsCount}</strong></td>
            <td style="padding: 14px;"><strong style="color: #ffffff;">${escapeHtml(item.carName)}</strong></td>
            <td style="padding: 14px; color: var(--sub); font-family: monospace; font-size: 12.5px;">${escapeHtml(item.regNo)}</td>
            <td style="padding: 14px;">
              <span style="color:#06d6a0; font-weight:700;">${item.bookedDays} days</span>
              ${item.bookingDatesList.length ? `<br><small style="color:var(--sub); font-size:11px;">${escapeHtml(item.bookingDatesList.slice(0, 2).join(", "))}${item.bookingDatesList.length > 2 ? ` (+${item.bookingDatesList.length - 2} more)` : ""}</small>` : ""}
            </td>
            <td style="padding: 14px;"><strong style="color:#ffffff;">${formatINR(item.revenue)}</strong></td>
            <td style="padding: 14px; color: var(--sub);">${formatINR(avgRev)} <small style="font-size:11px;">/ booking</small></td>
            <td style="padding: 14px;"><strong style="color:#4fd7ff;">${formatINR(item.revenue)}</strong></td>
          </tr>`;
      }).join("");
    }
  }

  // RENDER RECONCILIATION SUMMARY FOOTER ROW
  const fleetTotalBookings = fleetList.reduce((sum, item) => sum + item.bookingsCount, 0);
  const fleetTotalDays = fleetList.reduce((sum, item) => sum + item.bookedDays, 0);
  const fleetTotalRevenue = fleetList.reduce((sum, item) => sum + item.revenue, 0);
  const fleetAvgRevenue = fleetTotalBookings ? Math.round(fleetTotalRevenue / fleetTotalBookings) : 0;

  if (tfoot) {
    tfoot.innerHTML = `
      <tr style="font-size: 14px; color: #ffffff; padding: 14px 0;">
        <td style="padding: 14px;"><strong style="color:#4fd7ff;">${fleetTotalBookings} Bookings</strong></td>
        <td style="padding: 14px;" colspan="2">TOTAL FLEET RECONCILIATION</td>
        <td style="padding: 14px; color:#06d6a0;">${fleetTotalDays} Booked Days</td>
        <td style="padding: 14px;"><strong style="color:#ffffff;">${formatINR(fleetTotalRevenue)} Revenue</strong></td>
        <td style="padding: 14px; color:var(--sub);">${formatINR(fleetAvgRevenue)} Avg</td>
        <td style="padding: 14px;"><strong style="color:#4fd7ff; font-size:1.05rem;">${formatINR(fleetTotalRevenue)} Total</strong></td>
      </tr>`;
  }
}

/* ============================================================
   DATA LOADING & EVENT LISTENERS
   ============================================================ */

async function loadManagerData() {
  if (content) {
    content.innerHTML = `<div class="card manager-panel manager-state" style="padding:32px;text-align:center;color:var(--sub);">Loading Kruizly executive business analytics...</div>`;
  }

  try {
    const [bookingsRes, vehiclesRes] = await Promise.allSettled([
      api.get("/bookings"),
      api.get("/vehicles")
    ]);

    if (bookingsRes.status === "fulfilled" && bookingsRes.value) {
      const res = bookingsRes.value;
      rawBookings = Array.isArray(res.bookings) ? res.bookings : (Array.isArray(res.data) ? res.data : []);
    }

    if (vehiclesRes.status === "fulfilled" && vehiclesRes.value) {
      const res = vehiclesRes.value;
      rawVehicles = Array.isArray(res.vehicles) ? res.vehicles : (Array.isArray(res.data) ? res.data : []);
    }
  } catch (err) {
    console.error("Manager summary data fetch error:", err);
  }

  // Restore dashboard HTML structure if needed
  if (content && (!document.getElementById("kpiTotalRevenue") || !document.getElementById("mgrFleetTableBody"))) {
    window.location.reload();
    return;
  }

  renderDashboard();
}

function initEventListeners() {
  quickPills.forEach(pill => {
    pill.addEventListener("click", () => {
      setQuickFilter(pill.dataset.range);
    });
  });

  applyFilterBtn?.addEventListener("click", () => {
    applyCustomDateInputs();
  });

  resetFilterBtn?.addEventListener("click", () => {
    if (dateFromInput) dateFromInput.value = "";
    if (dateToInput) dateToInput.value = "";
    setQuickFilter("all_time");
  });

  fleetSortSelect?.addEventListener("change", () => {
    renderDashboard();
  });
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
  if (isManagerUser(user) || isAdminUser(user) || isExecutiveUser(user)) {
    setVisible(denied, false);
    setVisible(content, true);
    initEventListeners();
    await loadManagerData();
  } else {
    setVisible(denied, true);
  }
}

initManagerSummary();
