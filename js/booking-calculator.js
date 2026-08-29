/**
 * js/booking-calculator.js
 * 
 * Single authoritative source of truth for duration and price calculations
 * across KRUIZLY (booking page, checkout/payment page, profile, invoices, and admin).
 */

/**
 * Universal Date/Time parser that handles:
 * - DD/MM/YYYY hh:mm AM/PM (e.g. "29/08/2026 12:04 PM")
 * - DD-MM-YYYY hh:mm AM/PM
 * - ISO YYYY-MM-DDTHH:mm
 * - Firestore Timestamps
 * - Flatpickr instances and inputs
 * - Standard JavaScript Date objects
 * 
 * @param {string|number|Date|Object} val
 * @returns {Date|null}
 */
export function parseDateTime(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  
  if (typeof val === "object" && typeof val.toDate === "function") {
    // Firestore Timestamp
    return val.toDate();
  }

  // If passed an HTMLInputElement with Flatpickr
  if (val && typeof val === "object") {
    if (val._flatpickr && Array.isArray(val._flatpickr.selectedDates) && val._flatpickr.selectedDates[0]) {
      return val._flatpickr.selectedDates[0];
    }
    if (typeof val.value === "string") {
      val = val.value;
    }
  }

  const stringVal = String(val).trim();
  if (!stringVal || stringVal === "—") return null;

  // 1. Check DD/MM/YYYY [HH:mm[:ss] [AM|PM]]
  const dmyMatch = stringVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (dmyMatch) {
    let day = parseInt(dmyMatch[1], 10);
    let month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    let hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    let minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    let seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    let ampm = dmyMatch[7] ? dmyMatch[7].toUpperCase() : null;

    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    const parsed = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // 2. Check ISO YYYY-MM-DD[THH:mm[:ss]]
  const isoMatch = stringVal.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
  if (isoMatch) {
    let year = parseInt(isoMatch[1], 10);
    let month = parseInt(isoMatch[2], 10) - 1;
    let day = parseInt(isoMatch[3], 10);
    let hours = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
    let minutes = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    let seconds = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;

    const parsed = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // 3. Fallback standard Date constructor
  const fallback = new Date(stringVal);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
}

/**
 * Calculates rental duration between pickup and drop date/time.
 * @param {string|Date} pickup
 * @param {string|Date} drop
 * @returns {{
 *   valid: boolean,
 *   error?: string,
 *   durationMs: number,
 *   durationHours: number,
 *   durationDays: number,
 *   formattedDuration: string,
 *   pickupDate: Date|null,
 *   dropDate: Date|null
 * }}
 */
export function calculateDuration(pickup, drop) {
  const pDate = parseDateTime(pickup);
  const dDate = parseDateTime(drop);

  if (!pDate || !dDate) {
    return {
      valid: false,
      error: "Please specify valid pickup and drop dates.",
      durationMs: 0,
      durationHours: 0,
      durationDays: 0,
      formattedDuration: "—",
      pickupDate: null,
      dropDate: null
    };
  }

  const durationMs = dDate.getTime() - pDate.getTime();

  if (durationMs <= 0) {
    return {
      valid: false,
      error: "Drop date & time must be after the pickup date & time.",
      durationMs: 0,
      durationHours: 0,
      durationDays: 0,
      formattedDuration: "—",
      pickupDate: pDate,
      dropDate: dDate
    };
  }

  // Exact hours with ceiling for partial hours
  const durationHours = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60)));
  // Days based on 24hr chunks
  const durationDays = Math.max(1, Math.ceil(durationHours / 24));

  const dayLabel = durationDays === 1 ? "1 Day" : `${durationDays} Days`;
  const formattedDuration = durationHours % 24 === 0
    ? dayLabel
    : `${dayLabel} (${durationHours} hrs)`;

  return {
    valid: true,
    durationMs,
    durationHours,
    durationDays,
    formattedDuration,
    pickupDate: pDate,
    dropDate: dDate
  };
}

/**
 * Computes authoritative price breakdown for a booking.
 * @param {Object} params
 * @param {Object} params.vehicle - Vehicle catalog item with pricing
 * @param {string|Date} params.pickup - Pickup date/time
 * @param {string|Date} params.drop - Drop date/time
 * @param {boolean} [params.withDriver=false] - Whether driver is requested
 * @param {Object|null} [params.coupon=null] - Validated coupon object
 * @param {string} [params.paymentPlan="advance"] - "advance" or "full"
 * @returns {Object} Full financial and duration breakdown
 */
export function calculateBookingPrice({
  vehicle,
  pickup,
  drop,
  withDriver = false,
  coupon = null,
  paymentPlan = "advance"
}) {
  const duration = calculateDuration(pickup, drop);

  if (!duration.valid || !vehicle) {
    return {
      valid: false,
      error: duration.error || "Vehicle information required.",
      duration
    };
  }

  const hours = duration.durationHours;
  const days = duration.durationDays;

  // Rate determination: hourly rate preferred, fallback to daily / 24
  const priceDay = Number(vehicle.priceDay || 0);
  const hourlyRate = Number(vehicle.priceHour || (priceDay > 0 ? priceDay / 24 : 0));

  const driverPriceDay = Number(vehicle.driverPrice || 2000);
  const driverHourlyRate = Number(vehicle.driverPriceHour || (driverPriceDay > 0 ? driverPriceDay / 24 : 83.33));

  const rentalTotal = Math.round(hours * hourlyRate);
  const driverTotal = withDriver ? Math.round(hours * driverHourlyRate) : 0;
  const securityDeposit = Number(vehicle.securityDeposit || 0);

  // Authoritative coupon discount calculation (supports single coupon and multi-coupon stacking)
  let couponDiscount = 0;
  const appliedCoupons = [];

  const couponList = Array.isArray(coupon)
    ? coupon
    : (coupon ? [coupon] : []);

  let remainingRentalForDiscount = rentalTotal;

  for (const c of couponList) {
    if (!c || c.active === false || c.status === "inactive") continue;
    const minOrder = Number(c.minimumBookingAmount || c.minOrder || 0);
    const type = c.discountType || c.type || "flat";
    const val = Number(c.discountValue || c.val || 0);
    const maxCap = Number(c.maxDiscount || 0);

    if (rentalTotal >= minOrder) {
      let thisDiscount = 0;
      if (type === "percent" || type === "percentage") {
        thisDiscount = Math.round((rentalTotal * Math.min(100, Math.max(0, val))) / 100);
        if (maxCap > 0 && thisDiscount > maxCap) {
          thisDiscount = maxCap;
        }
      } else {
        thisDiscount = Math.max(0, val);
      }

      thisDiscount = Math.min(remainingRentalForDiscount, thisDiscount);
      if (thisDiscount > 0) {
        couponDiscount += thisDiscount;
        remainingRentalForDiscount = Math.max(0, remainingRentalForDiscount - thisDiscount);
        appliedCoupons.push({
          code: String(c.code || "").toUpperCase(),
          discountType: type,
          discountValue: val,
          discountAmount: thisDiscount,
          label: c.label || (type === "percent" ? `${val}% Off` : `₹${val} Flat Off`),
          description: c.description || ""
        });
      }
    }
  }

  const couponApplied = appliedCoupons[0] || null;

  const finalAmount = Math.max(0, rentalTotal + driverTotal + securityDeposit - couponDiscount);
  const normalizedPlan = paymentPlan === "full" ? "full" : "advance";
  const advanceAmount = normalizedPlan === "advance" ? Math.min(500, finalAmount) : finalAmount;
  const remainingAmount = Math.max(0, finalAmount - advanceAmount);

  return {
    valid: true,
    duration,
    days,
    hours,
    withDriver: Boolean(withDriver),
    hourlyRate,
    priceDay,
    driverHourlyRate,
    driverPriceDay,
    rentalTotal,
    driverTotal,
    securityDeposit,
    couponDiscount,
    couponApplied,
    appliedCoupons,
    finalAmount,
    totalAmount: finalAmount,
    paymentPlan: normalizedPlan,
    advanceAmount,
    paymentAmount: advanceAmount,
    remainingAmount,
    remainingBalance: remainingAmount
  };
}

/**
 * Format currency helper in INR (₹)
 * @param {number} val
 * @returns {string}
 */
export function formatCurrency(val) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(Number(val) || 0);
}

/**
 * Formats a Date object into human-readable date & time (e.g. "29 Aug 2026, 10:00 AM")
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatHumanDateTime(dateVal) {
  const d = parseDateTime(dateVal);
  if (!d) return "—";

  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}
