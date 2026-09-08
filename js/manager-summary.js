import {
  getCurrentUser,
  checkAuth,
  isManagerUser,
  isAdminUser,
  isExecutiveUser,
} from "./auth.js?v=20260908-v5";
import { api } from "./kruizly-api.js?v=20260908-v5";
import "./nav-helper.js?v=20260908-v5";

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
let filterToDate = null; // Date object or null

/**
 * Kruizly Standardized 7 Fleet Master
 */
export const ACTIVE_7_FLEETS = [
  {
    regNo: "ZIP008",
    brand: "Kia",
    model: "Carens",
    year: 2025,
    category: "MPV",
    transmission: "Manual",
    fuel: "Diesel",
    seats: 6,
    image: "assets/fleet/Kia Carens.png",
    priceDay: 4500,
  },
  {
    regNo: "MH03DA3808",
    brand: "Mahindra",
    model: "XUV500",
    year: 2018,
    category: "SUV",
    transmission: "Manual",
    fuel: "Diesel",
    seats: 7,
    image: "assets/fleet/Mahindra XUV500.png",
    priceDay: 4500,
  },
  {
    regNo: "ZIP007",
    brand: "Jeep",
    model: "Compass",
    year: 2020,
    category: "SUV",
    transmission: "Manual",
    fuel: "Diesel",
    seats: 5,
    image: "assets/fleet/Jeep Compass.png",
    priceDay: 5500,
  },
  {
    regNo: "ZIP010",
    brand: "Mahindra",
    model: "Scorpio N",
    year: 2025,
    category: "SUV",
    transmission: "Manual",
    fuel: "Diesel",
    seats: 7,
    image: "assets/fleet/Mahindra Scorpio N.png",
    priceDay: 5500,
  },
  {
    regNo: "ZIP011",
    brand: "Mahindra",
    model: "Thar",
    year: 2025,
    category: "SUV",
    transmission: "Manual",
    fuel: "Diesel",
    seats: 4,
    image: "assets/fleet/Mahindra Thar.png",
    priceDay: 5500,
  },
  {
    regNo: "ZIP033",
    brand: "Toyota",
    model: "Innova Crysta",
    year: 2021,
    category: "MPV",
    transmission: "Manual",
    fuel: "Diesel",
    seats: 7,
    image: "assets/fleet/Toyota Innova Crysta.png",
    priceDay: 5500,
  },
  {
    regNo: "ZIP012",
    brand: "Mahindra",
    model: "Thar Roxx",
    year: 2025,
    category: "SUV",
    transmission: "Automatic",
    fuel: "Diesel",
    seats: 5,
    image: "assets/fleet/Mahindra Thar.png",
    priceDay: 8000,
  },
];

/**
 * Robustly matches any booking to one of the 7 active fleet vehicles
 */
export function matchBookingToFleet(b) {
  const regRaw = String(b.vehicleReg || b.regNo || "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]/g, "");
  const nameRaw = String(b.vehicleName || b.carName || "")
    .trim()
    .toUpperCase();

  // 1. Direct registration match
  if (regRaw) {
    for (const f of ACTIVE_7_FLEETS) {
      const fReg = f.regNo.toUpperCase().replace(/[\s\-_]/g, "");
      if (regRaw === fReg || regRaw.includes(fReg) || fReg.includes(regRaw)) {
        return f.regNo;
      }
    }
    // Legacy alias check (e.g. ZIP013 or 3808 maps to XUV500)
    if (
      regRaw.includes("ZIP013") ||
      regRaw.includes("3808") ||
      regRaw.includes("MH03DA3808")
    ) {
      return "MH03DA3808";
    }
  }

  // 2. Keyword match on car name (in order of specificity)
  if (nameRaw.includes("ROXX")) return "ZIP012";
  if (nameRaw.includes("THAR")) return "ZIP011";
  if (nameRaw.includes("INNOVA") || nameRaw.includes("CRYSTA")) return "ZIP033";
  if (nameRaw.includes("SCORPIO")) return "ZIP010";
  if (nameRaw.includes("COMPASS") || nameRaw.includes("JEEP")) return "ZIP007";
  if (nameRaw.includes("CARENS") || nameRaw.includes("KIA")) return "ZIP008";
  if (
    nameRaw.includes("XUV") ||
    nameRaw.includes("500") ||
    nameRaw.includes("700")
  )
    return "MH03DA3808";

  // 3. Fallback matching by model or brand substring
  for (const f of ACTIVE_7_FLEETS) {
    if (
      nameRaw &&
      (nameRaw.includes(f.model.toUpperCase()) ||
        nameRaw.includes(f.brand.toUpperCase()))
    ) {
      return f.regNo;
    }
  }

  return null;
}

function setVisible(element, visible) {
  if (!element) return;
  element.hidden = !visible;
  if (visible) {
    element.removeAttribute("hidden");
    element.style.setProperty("display", "flex", "important");
  } else {
    element.setAttribute("hidden", "");
    element.style.setProperty("display", "none", "important");
  }
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
  return `₹${Math.round(number).toLocaleString("en-IN")}`;
}

function formatDateDisplay(dateObj) {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return "—";
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

function bookingAmount(b) {
  return (
    Number(b.totalAmount ?? b.amount ?? b.finalAmount ?? b.total ?? 0) || 0
  );
}

function isVerifiedRevenue(b) {
  const pStat = String(b.paymentStatus || "").toLowerCase();
  const bStat = String(b.status || b.bookingStatus || "").toLowerCase();

  if (pStat === "rejected" || bStat === "cancelled" || bStat === "rejected") {
    return false;
  }
  return (
    pStat === "paid" ||
    pStat === "verified" ||
    pStat === "advance_paid" ||
    bStat === "confirmed" ||
    bStat === "completed" ||
    bStat === "active"
  );
}

/* ============================================================
   DATE FILTERING LOGIC
   ============================================================ */

function setQuickFilter(type) {
  activeQuickFilter = type;
  quickPills.forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.range === type);
  });

  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

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
    startOfWeek.setDate(
      startOfWeek.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
    ); // Mon
    filterFromDate = startOfWeek;
    filterToDate = todayEnd;
  } else if (type === "this_month") {
    filterFromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    filterToDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
  } else if (type === "last_month") {
    filterFromDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
      0,
      0,
      0,
      0,
    );
    filterToDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );
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
    dateFromInput.value = filterFromDate
      ? filterFromDate.toISOString().slice(0, 10)
      : "";
  }
  if (dateToInput) {
    dateToInput.value = filterToDate
      ? filterToDate.toISOString().slice(0, 10)
      : "";
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
  quickPills.forEach((pill) => pill.classList.remove("active"));
  renderDashboard();
}

function isBookingInPeriod(b, startRange, endRange) {
  if (!startRange && !endRange) return true;

  const bStart = parseDate(b.pickupDate || b.startDate || b.createdAt);
  const bEnd = parseDate(
    b.dropDate || b.endDate || b.pickupDate || b.createdAt,
  );

  if (!bStart && !bEnd) return true;

  const startMs = startRange ? startRange.getTime() : 0;
  const endMs = endRange ? endRange.getTime() : Infinity;

  const tripStartMs = bStart ? bStart.getTime() : bEnd ? bEnd.getTime() : 0;
  const tripEndMs = bEnd
    ? bEnd.getTime()
    : bStart
      ? bStart.getTime()
      : Infinity;

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
      const fromStr = filterFromDate
        ? formatDateDisplay(filterFromDate)
        : "Beginning";
      const toStr = filterToDate ? formatDateDisplay(filterToDate) : "Present";
      periodLabel.textContent = `${fromStr} — ${toStr}`;
    }
  }

  // Filter Bookings for Selected Period
  const periodBookings = rawBookings.filter((b) =>
    isBookingInPeriod(b, filterFromDate, filterToDate),
  );
  const verifiedBookings = periodBookings.filter((b) => isVerifiedRevenue(b));

  // KPI 1: TOTAL REVENUE
  const totalRevenue = verifiedBookings.reduce(
    (sum, b) => sum + bookingAmount(b),
    0,
  );
  const kpiTotalRevenueEl = document.getElementById("kpiTotalRevenue");
  if (kpiTotalRevenueEl)
    kpiTotalRevenueEl.textContent = formatINR(totalRevenue);

  // KPI 2: ACTIVE TRIPS
  const now = new Date();
  const activeTripsCount = rawBookings.filter((b) => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    if (bStat === "cancelled" || bStat === "rejected") return false;
    const bStart = parseDate(b.pickupDate || b.startDate);
    const bEnd = parseDate(b.dropDate || b.endDate);
    const isPickedUp = b.pickupStatus === "picked_up" || bStat === "active";
    if (isPickedUp && bStat !== "completed") return true;
    if (bStart && bEnd && bStart <= now && bEnd >= now && bStat !== "completed")
      return true;
    return false;
  }).length;
  const kpiActiveTripsEl = document.getElementById("kpiActiveTrips");
  if (kpiActiveTripsEl) kpiActiveTripsEl.textContent = String(activeTripsCount);

  // KPI 3: COMPLETED TRIPS
  const completedTripsCount = periodBookings.filter((b) => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    return bStat === "completed";
  }).length;
  const kpiCompletedTripsEl = document.getElementById("kpiCompletedTrips");
  if (kpiCompletedTripsEl)
    kpiCompletedTripsEl.textContent = String(completedTripsCount);

  // KPI 4: REVENUE THIS MONTH (Month represented by selected range or current month)
  const targetMonthDate = filterFromDate || now;
  const targetMonth = targetMonthDate.getMonth();
  const targetYear = targetMonthDate.getFullYear();

  const monthRevenue = rawBookings
    .filter((b) => {
      if (!isVerifiedRevenue(b)) return false;
      const d = parseDate(b.pickupDate || b.createdAt);
      return (
        d && d.getMonth() === targetMonth && d.getFullYear() === targetYear
      );
    })
    .reduce((sum, b) => sum + bookingAmount(b), 0);

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const kpiRevenueThisMonthEl = document.getElementById("kpiRevenueThisMonth");
  const kpiRevenueMonthSubEl = document.getElementById("kpiRevenueMonthSub");
  if (kpiRevenueThisMonthEl)
    kpiRevenueThisMonthEl.textContent = formatINR(monthRevenue);
  if (kpiRevenueMonthSubEl)
    kpiRevenueMonthSubEl.textContent = `${monthNames[targetMonth]} ${targetYear} Revenue`;

  // KPI 5: TOTAL BOOKINGS
  const totalBookingsCount = periodBookings.filter((b) => {
    const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
    return bStat !== "cancelled" && bStat !== "rejected";
  }).length;
  const kpiTotalBookingsEl = document.getElementById("kpiTotalBookings");
  if (kpiTotalBookingsEl)
    kpiTotalBookingsEl.textContent = String(totalBookingsCount);

  // KPI 6: AVERAGE OCCUPANCY (%)
  // Formula: Booked Vehicle-Days / (Available Fleet Count * Days in Period)
  let periodDays = 30;
  if (filterFromDate && filterToDate) {
    const diffMs = filterToDate.getTime() - filterFromDate.getTime();
    periodDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  } else if (rawBookings.length) {
    const dates = rawBookings
      .map((b) => parseDate(b.pickupDate || b.createdAt))
      .filter(Boolean);
    if (dates.length) {
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
      const diffMs = maxDate.getTime() - minDate.getTime();
      periodDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }
  }

  const activeFleetCount = ACTIVE_7_FLEETS.length; // Exactly 7 active fleets
  const totalAvailableVehicleDays = activeFleetCount * periodDays;

  let totalBookedVehicleDays = 0;
  verifiedBookings.forEach((b) => {
    const days = Math.max(1, Number(b.days) || 1);
    totalBookedVehicleDays += days;
  });

  const occupancyPct = Math.min(
    100,
    Math.round((totalBookedVehicleDays / totalAvailableVehicleDays) * 100),
  );
  const kpiAvgOccupancyEl = document.getElementById("kpiAvgOccupancy");
  if (kpiAvgOccupancyEl) kpiAvgOccupancyEl.textContent = `${occupancyPct}%`;

  // KPI 7: PER FLEET AMOUNT (Average revenue per vehicle)
  const perFleetAmount = activeFleetCount ? totalRevenue / activeFleetCount : 0;
  const kpiPerFleetAmountEl = document.getElementById("kpiPerFleetAmount");
  if (kpiPerFleetAmountEl) {
    kpiPerFleetAmountEl.innerHTML = `${formatINR(perFleetAmount)} <span style="font-size:12px;font-weight:600;color:var(--sub);">/ vehicle</span>`;
  }

  /* ============================================================
     FLEET PERFORMANCE TABLE CALCULATIONS (7 FLEETS)
     ============================================================ */

  // Initialize strictly with Kruizly's 7 active fleet vehicles
  const vehicleStatsMap = new Map();
  ACTIVE_7_FLEETS.forEach((f) => {
    vehicleStatsMap.set(f.regNo, {
      carName: `${f.brand} ${f.model}`,
      regNo: f.regNo,
      brand: f.brand,
      model: f.model,
      category: f.category,
      image: f.image,
      priceDay: f.priceDay,
      bookingsCount: 0,
      bookedDays: 0,
      revenue: 0,
      bookingDatesList: [],
    });
  });

  let unmappedRevenue = 0;
  let unmappedCount = 0;

  verifiedBookings.forEach((b) => {
    const matchedReg = matchBookingToFleet(b);
    let entry = matchedReg ? vehicleStatsMap.get(matchedReg) : null;

    if (!entry) {
      unmappedRevenue += bookingAmount(b);
      unmappedCount += 1;
      const fallbackKey = "UNMAPPED";
      if (!vehicleStatsMap.has(fallbackKey)) {
        vehicleStatsMap.set(fallbackKey, {
          carName: b.vehicleName || "Unassigned Fleet Vehicle",
          regNo: b.vehicleReg || "Unmapped",
          brand: "Kruizly",
          model: "Fleet",
          category: "General",
          image: "assets/fleet/Kia Carens.png",
          priceDay: 4500,
          bookingsCount: 0,
          bookedDays: 0,
          revenue: 0,
          bookingDatesList: [],
        });
      }
      entry = vehicleStatsMap.get(fallbackKey);
    }

    entry.bookingsCount += 1;
    const days = Math.max(1, Number(b.days) || 1);
    entry.bookedDays += days;
    const amt = bookingAmount(b);
    entry.revenue += amt;

    const pDate = parseDate(b.pickupDate);
    const dDate = parseDate(b.dropDate);
    if (pDate && dDate) {
      entry.bookingDatesList.push(
        `${formatDateDisplay(pDate)} — ${formatDateDisplay(dDate)}`,
      );
    }
  });

  const reconciliationNoticeEl = document.getElementById(
    "reconciliationNotice",
  );
  if (reconciliationNoticeEl) {
    if (unmappedRevenue > 0) {
      reconciliationNoticeEl.style.display = "inline-block";
      reconciliationNoticeEl.textContent = `${unmappedCount} Unmapped Booking(s): ${formatINR(unmappedRevenue)}`;
    } else {
      reconciliationNoticeEl.style.display = "none";
    }
  }

  const fleetList = Array.from(vehicleStatsMap.values());

  // KPI 8: PER FLEET REVENUE % (Top vehicle share)
  let topVehicle = null;
  fleetList.forEach((v) => {
    if (!topVehicle || v.revenue > topVehicle.revenue) {
      topVehicle = v;
    }
  });

  const topSharePct =
    totalRevenue && topVehicle
      ? Math.round((topVehicle.revenue / totalRevenue) * 100)
      : 0;
  const kpiFleetRevShareEl = document.getElementById("kpiFleetRevShare");
  const kpiFleetRevShareSubEl = document.getElementById("kpiFleetRevShareSub");
  if (kpiFleetRevShareEl) kpiFleetRevShareEl.textContent = `${topSharePct}%`;
  if (kpiFleetRevShareSubEl) {
    kpiFleetRevShareSubEl.textContent =
      topVehicle && topVehicle.revenue
        ? `${topVehicle.carName} contribution`
        : "Share of total revenue";
  }

  // TOP PERFORMER CARD
  const topCarNameEl = document.getElementById("topCarName");
  const topCarStatsEl = document.getElementById("topCarStats");
  if (topCarNameEl)
    topCarNameEl.textContent =
      topVehicle && topVehicle.revenue
        ? topVehicle.carName
        : "No bookings in period";
  if (topCarStatsEl) {
    topCarStatsEl.textContent =
      topVehicle && topVehicle.revenue
        ? `${formatINR(topVehicle.revenue)} · ${topVehicle.bookingsCount} Bookings (${topVehicle.bookedDays} Days)`
        : "₹0 · 0 Bookings";
  }

  // SALES PERFORMANCE CARDS
  const todayStartMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const daySales = rawBookings
    .filter((b) => {
      if (!isVerifiedRevenue(b)) return false;
      const d = parseDate(b.pickupDate || b.createdAt);
      return d && d.getTime() >= todayStartMs;
    })
    .reduce((sum, b) => sum + bookingAmount(b), 0);

  const startOfWeekMs =
    todayStartMs - (now.getDay() === 0 ? 6 : now.getDay() - 1) * 86400000;
  const weekSales = rawBookings
    .filter((b) => {
      if (!isVerifiedRevenue(b)) return false;
      const d = parseDate(b.pickupDate || b.createdAt);
      return d && d.getTime() >= startOfWeekMs;
    })
    .reduce((sum, b) => sum + bookingAmount(b), 0);

  const startOfMonthMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).getTime();
  const monthSales = rawBookings
    .filter((b) => {
      if (!isVerifiedRevenue(b)) return false;
      const d = parseDate(b.pickupDate || b.createdAt);
      return d && d.getTime() >= startOfMonthMs;
    })
    .reduce((sum, b) => sum + bookingAmount(b), 0);

  const overallSales = rawBookings
    .filter((b) => isVerifiedRevenue(b))
    .reduce((sum, b) => sum + bookingAmount(b), 0);

  document.getElementById("salesDay") &&
    (document.getElementById("salesDay").textContent = formatINR(daySales));
  document.getElementById("salesWeek") &&
    (document.getElementById("salesWeek").textContent = formatINR(weekSales));
  document.getElementById("salesMonth") &&
    (document.getElementById("salesMonth").textContent = formatINR(monthSales));
  document.getElementById("salesOverall") &&
    (document.getElementById("salesOverall").textContent =
      formatINR(overallSales));

  // FLEET TABLE SORTING
  const sortMode = fleetSortSelect ? fleetSortSelect.value : "revenue";
  fleetList.sort((a, b) => {
    if (sortMode === "bookings") return b.bookingsCount - a.bookingsCount;
    if (sortMode === "days") return b.bookedDays - a.bookedDays;
    if (sortMode === "avg") {
      const avgA = a.bookingsCount ? a.revenue / a.bookingsCount : 0;
      const avgB = b.bookingsCount ? b.revenue / b.bookingsCount : 0;
      return avgB - avgA;
    }
    if (sortMode === "car") return a.carName.localeCompare(b.carName);
    return b.revenue - a.revenue; // Default revenue DESC
  });

  // FLEET TOTALS
  const fleetTotalBookings = fleetList.reduce(
    (sum, item) => sum + item.bookingsCount,
    0,
  );
  const fleetTotalDays = fleetList.reduce(
    (sum, item) => sum + item.bookedDays,
    0,
  );
  const fleetTotalRevenue = fleetList.reduce(
    (sum, item) => sum + item.revenue,
    0,
  );
  const fleetAvgRevenue = fleetTotalBookings
    ? Math.round(fleetTotalRevenue / fleetTotalBookings)
    : 0;

  // 1. POPULATE PROMINENT TOP TOTAL FLEET SUMMARY BAR (DIRECTLY ABOVE TABLE)
  const topFleetTotalRevenueEl = document.getElementById(
    "topFleetTotalRevenue",
  );
  const topFleetTotalBookingsEl = document.getElementById(
    "topFleetTotalBookings",
  );
  const topFleetTotalDaysEl = document.getElementById("topFleetTotalDays");
  const topFleetAvgRevenueEl = document.getElementById("topFleetAvgRevenue");

  if (topFleetTotalRevenueEl)
    topFleetTotalRevenueEl.textContent = formatINR(fleetTotalRevenue);
  if (topFleetTotalBookingsEl)
    topFleetTotalBookingsEl.textContent = String(fleetTotalBookings);
  if (topFleetTotalDaysEl)
    topFleetTotalDaysEl.textContent = `${fleetTotalDays} Days`;
  if (topFleetAvgRevenueEl)
    topFleetAvgRevenueEl.textContent = formatINR(fleetAvgRevenue);

  // 2. POPULATE STICKY TOP TOTAL ROW IN THE TABLE HEADER
  const thFleetTotalBookingsEl = document.getElementById(
    "thFleetTotalBookings",
  );
  const thFleetTotalDaysEl = document.getElementById("thFleetTotalDays");
  const thFleetTotalRevenueEl = document.getElementById("thFleetTotalRevenue");
  const thFleetAvgRevenueEl = document.getElementById("thFleetAvgRevenue");
  const thFleetGrandTotalEl = document.getElementById("thFleetGrandTotal");

  if (thFleetTotalBookingsEl)
    thFleetTotalBookingsEl.textContent = `${fleetTotalBookings} Bookings`;
  if (thFleetTotalDaysEl)
    thFleetTotalDaysEl.textContent = `${fleetTotalDays} days`;
  if (thFleetTotalRevenueEl)
    thFleetTotalRevenueEl.textContent = formatINR(fleetTotalRevenue);
  if (thFleetAvgRevenueEl)
    thFleetAvgRevenueEl.textContent = `${formatINR(fleetAvgRevenue)} / booking`;
  if (thFleetGrandTotalEl)
    thFleetGrandTotalEl.textContent = formatINR(fleetTotalRevenue);

  // 3. RENDER FLEET TABLE BODY
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
      tbody.innerHTML = fleetList
        .map((item) => {
          const avgRev = item.bookingsCount
            ? Math.round(item.revenue / item.bookingsCount)
            : 0;
          return `
          <tr style="transition: background 0.15s ease;">
            <td><strong style="color: #4fd7ff; font-size: 1.05rem;">${item.bookingsCount}</strong></td>
            <td><strong style="color: #ffffff;">${escapeHtml(item.carName)}</strong></td>
            <td style="color: var(--sub); font-family: monospace; font-size: 12.5px;">${escapeHtml(item.regNo)}</td>
            <td>
              <span style="color:#06d6a0; font-weight:700;">${item.bookedDays} days</span>
              ${item.bookingDatesList.length ? `<br><small style="color:var(--sub); font-size:11px;">${escapeHtml(item.bookingDatesList.slice(0, 2).join(", "))}${item.bookingDatesList.length > 2 ? ` (+${item.bookingDatesList.length - 2} more)` : ""}</small>` : ""}
            </td>
            <td><strong style="color:#ffffff;">${formatINR(item.revenue)}</strong></td>
            <td style="color: var(--sub);">${formatINR(avgRev)} <small style="font-size:11px;">/ booking</small></td>
            <td><strong style="color:#4fd7ff;">${formatINR(item.revenue)}</strong></td>
          </tr>`;
        })
        .join("");
    }
  }

  // 4. RENDER RECONCILIATION SUMMARY FOOTER ROW
  if (tfoot) {
    tfoot.innerHTML = `
      <tr style="font-size: 14px; font-weight: 800; color: #ffffff; background: rgba(255, 255, 255, 0.03); border-top: 2px solid rgba(255, 255, 255, 0.18);">
        <td style="padding: 14px;"><strong style="color:#4fd7ff;">${fleetTotalBookings} Bookings</strong></td>
        <td style="padding: 14px;" colspan="2">TOTAL FLEET RECONCILIATION</td>
        <td style="padding: 14px; color:#06d6a0;">${fleetTotalDays} Booked Days</td>
        <td style="padding: 14px;"><strong style="color:#ffffff;">${formatINR(fleetTotalRevenue)}</strong></td>
        <td style="padding: 14px; color:var(--sub);">${formatINR(fleetAvgRevenue)} Avg</td>
        <td style="padding: 14px;"><strong style="color:#4fd7ff; font-size:1.05rem;">${formatINR(fleetTotalRevenue)}</strong></td>
      </tr>`;
  }

  // ============================================================
  // TAB 3: BOOKINGS ANALYTICS TAB RENDERING
  // ============================================================
  const tabBookingsCountEl = document.getElementById("tabBookingsCount");
  const tabBookingsActiveEl = document.getElementById("tabBookingsActive");
  const tabBookingsCompletedEl = document.getElementById(
    "tabBookingsCompleted",
  );
  const tabBookingsTotalDaysEl = document.getElementById(
    "tabBookingsTotalDays",
  );
  const mgrBookingsTableBody = document.getElementById("mgrBookingsTableBody");

  if (tabBookingsCountEl)
    tabBookingsCountEl.textContent = String(validPeriodBookings.length);
  if (tabBookingsActiveEl)
    tabBookingsActiveEl.textContent = String(activeTripsCount);
  if (tabBookingsCompletedEl)
    tabBookingsCompletedEl.textContent = String(completedTripsCount);
  if (tabBookingsTotalDaysEl)
    tabBookingsTotalDaysEl.textContent = `${totalBookedVehicleDays} Days`;

  if (mgrBookingsTableBody) {
    if (!verifiedBookings.length) {
      mgrBookingsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 24px; text-align: center; color: var(--sub);">
            No verified bookings found for this reporting period.
          </td>
        </tr>`;
    } else {
      mgrBookingsTableBody.innerHTML = verifiedBookings
        .slice(0, 30)
        .map((b) => {
          const pDate = parseDate(b.pickupDate);
          const dDate = parseDate(b.dropDate);
          const dateStr =
            pDate && dDate
              ? `${formatDateDisplay(pDate)} — ${formatDateDisplay(dDate)}`
              : "—";
          const amt = bookingAmount(b);
          const bStat = String(
            b.status || b.bookingStatus || "confirmed",
          ).toUpperCase();
          return `
          <tr>
            <td><strong style="color:#4fd7ff; font-family:monospace;">${escapeHtml(b.bookingNumber || b.bookingId || `#${b.id}`)}</strong></td>
            <td><span style="color:#ffffff; font-weight:700;">${escapeHtml(b.userName || b.resolvedUserName || "Customer")}</span></td>
            <td><span style="color:#ffd166; font-weight:600;">${escapeHtml(b.vehicleName || b.carName || "Kruizly Fleet")}</span></td>
            <td style="color:var(--sub); font-size:12.5px;">${escapeHtml(dateStr)}</td>
            <td style="color:#06d6a0; font-weight:700;">${Math.max(1, Number(b.days) || 1)} Days</td>
            <td><strong style="color:#ffffff;">${formatINR(amt)}</strong></td>
            <td><span class="badge" style="background:rgba(6, 214, 160, 0.15); color:#06d6a0; border:1px solid rgba(6, 214, 160, 0.3); padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700;">${escapeHtml(bStat)}</span></td>
          </tr>`;
        })
        .join("");
    }
  }

  // ============================================================
  // TAB 4: OPERATIONS & 7 FLEETS RECONCILIATION RENDERING
  // ============================================================
  const tabOpsOccupancyEl = document.getElementById("tabOpsOccupancy");
  const tabOpsPerVehicleEl = document.getElementById("tabOpsPerVehicle");
  const tabOpsReconciledStatusEl = document.getElementById(
    "tabOpsReconciledStatus",
  );
  const mgrOpsFleetGrid = document.getElementById("mgrOpsFleetGrid");

  if (tabOpsOccupancyEl) tabOpsOccupancyEl.textContent = `${occupancyPct}%`;
  if (tabOpsPerVehicleEl)
    tabOpsPerVehicleEl.textContent = formatINR(perFleetAmount);
  if (tabOpsReconciledStatusEl) {
    if (unmappedRevenue === 0) {
      tabOpsReconciledStatusEl.textContent = "100% Balanced";
      tabOpsReconciledStatusEl.style.color = "#06d6a0";
    } else {
      tabOpsReconciledStatusEl.textContent = `${formatINR(unmappedRevenue)} Pending Audit`;
      tabOpsReconciledStatusEl.style.color = "#ffd166";
    }
  }

  if (mgrOpsFleetGrid) {
    mgrOpsFleetGrid.innerHTML = ACTIVE_7_FLEETS.map((f) => {
      const stat = vehicleStatsMap.get(f.regNo) || {
        bookingsCount: 0,
        bookedDays: 0,
        revenue: 0,
      };
      const carOccupancy = periodDays
        ? Math.min(100, Math.round((stat.bookedDays / periodDays) * 100))
        : 0;
      return `
        <div class="card" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--sub);">${escapeHtml(f.brand)} · ${escapeHtml(f.category)}</div>
              <strong style="font-size: 15px; color: #ffffff;">${escapeHtml(f.model)}</strong>
              <div style="font-family: monospace; font-size: 12px; color: #4fd7ff; margin-top: 2px;">${escapeHtml(f.regNo)}</div>
            </div>
            <span class="badge" style="background: rgba(6, 214, 160, 0.12); color: #06d6a0; border: 1px solid rgba(6, 214, 160, 0.25); font-size: 11px; padding: 3px 8px; border-radius: 6px; font-weight: 700;">Active</span>
          </div>
          <div style="margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
              <span style="color: var(--sub);">Period Utilization</span>
              <strong style="color: #06d6a0;">${carOccupancy}%</strong>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 999px; overflow: hidden;">
              <div style="width: ${carOccupancy}%; height: 100%; background: #06d6a0; border-radius: 999px;"></div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 12px;">
            <div>
              <span style="color: var(--sub);">Bookings: </span>
              <strong style="color: #ffffff;">${stat.bookingsCount}</strong>
            </div>
            <div>
              <span style="color: var(--sub);">Revenue: </span>
              <strong style="color: #4fd7ff;">${formatINR(stat.revenue)}</strong>
            </div>
          </div>
        </div>`;
    }).join("");
  }
}

/* ============================================================
   DATA LOADING & EVENT LISTENERS
   ============================================================ */

async function loadManagerData() {
  try {
    const [bookingsRes, vehiclesRes] = await Promise.allSettled([
      api.get("/bookings"),
      api.get("/vehicles"),
    ]);

    if (bookingsRes.status === "fulfilled" && bookingsRes.value) {
      const res = bookingsRes.value;
      rawBookings = Array.isArray(res.bookings)
        ? res.bookings
        : Array.isArray(res.data)
          ? res.data
          : [];
    }

    if (vehiclesRes.status === "fulfilled" && vehiclesRes.value) {
      const res = vehiclesRes.value;
      rawVehicles = Array.isArray(res.vehicles)
        ? res.vehicles
        : Array.isArray(res.data)
          ? res.data
          : [];
    }
  } catch (err) {
    console.error("Manager summary data fetch error:", err);
  }

  renderDashboard();
}

function initTabNavigation() {
  const tabBtns = document.querySelectorAll(".mgr-tab-btn");
  const sections = {
    revenue: document.getElementById("mgrSectionRevenue"),
    fleet: document.getElementById("mgrSectionFleet"),
    bookings: document.getElementById("mgrSectionBookings"),
    operations: document.getElementById("mgrSectionOperations"),
  };

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-mgr-tab");
      tabBtns.forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      Object.entries(sections).forEach(([key, sec]) => {
        if (!sec) return;
        if (key === targetTab) {
          sec.style.display = "block";
        } else {
          sec.style.display = "none";
        }
      });
    });
  });
}

function initEventListeners() {
  initTabNavigation();

  quickPills.forEach((pill) => {
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
