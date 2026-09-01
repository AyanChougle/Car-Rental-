/**
 * js/coupon-service.js
 * 
 * Production server-side coupon validation and suggestion catalog for KRUIZLY.
 * Authoritative source: Hostinger MySQL Backend API (/api/coupons).
 */

import { api } from "./kruizly-api.js";

/**
 * Fetches active available coupons from backend database for suggestions in UI.
 * @param {number} [rentalTotal=0]
 * @returns {Promise<Array<Object>>}
 */
export async function getAvailableCoupons(rentalTotal = 0) {
  try {
    const res = await api.get("/coupons");
    const coupons = Array.isArray(res.coupons) ? res.coupons : [];

    return coupons.map((c) => {
      const minAmount = Number(c.minOrder || c.minimumBookingAmount || 0);
      const isEligible = rentalTotal <= 0 || rentalTotal >= minAmount;
      const type = c.discountType || c.type || "flat";
      const val = Number(c.discountValue || c.val || 0);
      const badge = type === "percentage" || type === "percent" ? `${val}% OFF` : `SAVE ₹${val}`;

      return {
        ...c,
        code: String(c.code).toUpperCase(),
        discountType: type === "percentage" || type === "percent" ? "percent" : "flat",
        discountValue: val,
        minimumBookingAmount: minAmount,
        isEligible,
        badge,
        label: c.label || (type === "percentage" || type === "percent" ? `${val}% Off` : `₹${val} Flat Off`),
        description: c.description || (minAmount > 0 ? `Min booking ₹${minAmount.toLocaleString("en-IN")}` : "No min booking")
      };
    });
  } catch (err) {
    console.warn("[coupon-service] Could not fetch server coupons:", err.message);
    return [];
  }
}

/**
 * Validates a coupon server-side via POST /api/coupons/validate.
 * Enforces single-use per user, minimum booking, expiry, and active status in MySQL.
 * @param {Object} params
 * @param {string} params.code - Coupon code entered by user
 * @param {number} params.bookingAmount - Total rental charges
 * @param {string} [params.userId] - Current user UID
 * @param {Array<Object>} [params.appliedCoupons] - List of currently applied coupons
 * @returns {Promise<{ valid: boolean, error?: string, coupon?: Object }>}
 */
export async function validateCoupon({ code, bookingAmount, userId, appliedCoupons = [] }) {
  const cleanCode = String(code || "").trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, error: "Please enter a coupon code." };
  }

  // Prevent duplicate application
  if (Array.isArray(appliedCoupons) && appliedCoupons.some((c) => String(c.code).toUpperCase() === cleanCode)) {
    return { valid: false, error: `Coupon ${cleanCode} is already applied.` };
  }

  try {
    const res = await api.post("/coupons/validate", {
      code: cleanCode,
      bookingAmount: Number(bookingAmount || 0)
    });

    if (!res.valid) {
      return { valid: false, error: res.error || `Invalid coupon code "${cleanCode}".` };
    }

    const c = res.coupon;
    const type = c.discountType === "percentage" || c.discountType === "percent" || c.type === "percentage" ? "percent" : "flat";
    const val = Number(c.discountValue || c.val || 0);

    return {
      valid: true,
      coupon: {
        ...c,
        code: cleanCode,
        discountType: type,
        discountValue: val,
        minimumBookingAmount: Number(c.minOrder || 0),
        label: c.label || `${cleanCode} Applied`,
        description: c.description || "",
        discountAmount: Number(res.discountAmount || 0)
      }
    };
  } catch (err) {
    return { valid: false, error: err.message || "Failed to validate coupon." };
  }
}

/**
 * Calculates total discount amount from applied coupons.
 * @param {Array<Object>} coupons 
 * @param {number} baseAmount 
 * @returns {number}
 */
export function calculateMultiCouponDiscount(coupons = [], baseAmount = 0) {
  if (!Array.isArray(coupons) || coupons.length === 0 || baseAmount <= 0) return 0;

  let totalDiscount = 0;
  let remaining = baseAmount;

  for (const c of coupons) {
    let disc = 0;
    const type = c.discountType || c.type || "flat";
    const val = Number(c.discountValue || c.val || 0);

    if (type === "percent" || type === "percentage") {
      disc = Math.round((baseAmount * val) / 100);
      if (Number(c.maxDiscount) > 0) {
        disc = Math.min(disc, Number(c.maxDiscount));
      }
    } else {
      disc = val;
    }

    disc = Math.min(disc, remaining);
    totalDiscount += disc;
    remaining -= disc;
  }

  return Math.min(totalDiscount, baseAmount);
}

/**
 * Records coupon usage during booking creation.
 */
export async function recordCouponUsage({ userId, bookingId, appliedCoupons = [] }) {
  // Handled automatically server-side in POST /api/bookings inside MySQL transaction!
  return true;
}
