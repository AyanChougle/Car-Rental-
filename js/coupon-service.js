/**
 * js/coupon-service.js
 * 
 * Authoritative Firebase Firestore coupon validation, suggestion catalog,
 * and multi-coupon lifecycle management for KRUIZLY.
 */

import { auth, db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

export const DEFAULT_COUPONS = [
  {
    id: "WELCOME500",
    code: "WELCOME500",
    label: "₹500 Flat Off",
    discountType: "flat",
    discountValue: 500,
    minimumBookingAmount: 0,
    description: "₹500 Flat Off",
    status: "active",
    active: true
  },
  {
    id: "FIRST500",
    code: "FIRST500",
    label: "₹500 Flat Off",
    discountType: "flat",
    discountValue: 500,
    minimumBookingAmount: 0,
    description: "₹500 Flat Off",
    status: "active",
    active: true
  },
  {
    id: "KRUIZLY10",
    code: "KRUIZLY10",
    label: "10% Off Rental",
    discountType: "percent",
    discountValue: 10,
    minimumBookingAmount: 0,
    description: "10% Off Rental",
    status: "active",
    active: true
  },
  {
    id: "KRUIZLY20",
    code: "KRUIZLY20",
    label: "20% Off Rental",
    discountType: "percent",
    discountValue: 20,
    minimumBookingAmount: 0,
    description: "20% Off Rental",
    status: "active",
    active: true
  }
];

/**
 * Fetches all active available coupons for suggestion in the UI.
 * @param {number} [rentalTotal=0]
 * @returns {Promise<Array<Object>>}
 */
export async function getAvailableCoupons(rentalTotal = 0) {
  try {
    const q = query(collection(db, "coupons"), where("active", "==", true));
    const snap = await getDocs(q);
    let list = [];

    if (!snap.empty) {
      list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      list = [...DEFAULT_COUPONS];
    }

    return list.map(c => {
      const minAmount = Number(c.minimumBookingAmount || c.minOrder || 0);
      const isEligible = rentalTotal <= 0 || rentalTotal >= minAmount;
      const type = c.discountType || c.type || "flat";
      const val = Number(c.discountValue || c.val || 0);
      const badge = c.badge || (type === "percent" ? `${val}% OFF` : `SAVE ₹${val}`);
      return {
        ...c,
        code: String(c.code || c.id).toUpperCase(),
        discountType: type,
        discountValue: val,
        minimumBookingAmount: minAmount,
        isEligible,
        badge,
        label: c.label || (type === "percent" ? `${val}% Off` : `₹${val} Flat Off`),
        description: c.description || (minAmount > 0 ? `Min booking ₹${minAmount.toLocaleString("en-IN")}` : "No min booking")
      };
    });
  } catch (err) {
    console.warn("[coupon-service] Could not fetch Firestore coupons, using defaults:", err.message);
    return DEFAULT_COUPONS.map(c => ({
      ...c,
      isEligible: rentalTotal <= 0 || rentalTotal >= c.minimumBookingAmount
    }));
  }
}

/**
 * Validates a coupon against Firestore and local rules.
 * Supports multi-coupon validation (ensuring same coupon isn't added twice).
 * @param {Object} params
 * @param {string} params.code - Coupon code entered by user
 * @param {number} params.bookingAmount - Total rental charges
 * @param {string} [params.userId] - Current Firebase user UID (optional for guest preview)
 * @param {Array<Object>} [params.appliedCoupons] - List of currently applied coupons
 * @returns {Promise<{ valid: boolean, error?: string, coupon?: Object }>}
 */
export async function validateCoupon({ code, bookingAmount, userId, appliedCoupons = [] }) {
  const cleanCode = String(code || "").trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, error: "Please enter a coupon code." };
  }

  // Prevent duplicate application
  if (Array.isArray(appliedCoupons) && appliedCoupons.some(c => String(c.code).toUpperCase() === cleanCode)) {
    return { valid: false, error: `Coupon ${cleanCode} is already applied.` };
  }

  try {
    let couponData = null;
    let couponDocId = cleanCode;

    // 1. Try Firestore fetch
    try {
      const couponSnap = await getDoc(doc(db, "coupons", cleanCode));
      if (couponSnap.exists()) {
        couponData = couponSnap.data();
      } else {
        const q = query(collection(db, "coupons"), where("code", "==", cleanCode));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          const found = qSnap.docs[0];
          couponData = found.data();
          couponDocId = found.id;
        }
      }
    } catch (fsErr) {
      console.warn("[coupon-service] Firestore read fallback:", fsErr.message);
    }

    // 2. Fallback to default catalog if not in Firestore
    if (!couponData) {
      const fallbackMatch = DEFAULT_COUPONS.find(c => c.code === cleanCode);
      if (fallbackMatch) {
        couponData = { ...fallbackMatch };
      }
    }

    if (!couponData) {
      return { valid: false, error: `Invalid coupon code "${cleanCode}".` };
    }

    // 3. Active status check
    const isActive = couponData.active !== false && couponData.status !== "inactive";
    if (!isActive) {
      return { valid: false, error: `Coupon ${cleanCode} is currently inactive.` };
    }

    // 4. Date validity check
    const now = new Date();
    if (couponData.validFrom) {
      const fromDate = typeof couponData.validFrom.toDate === "function"
        ? couponData.validFrom.toDate()
        : new Date(couponData.validFrom);
      if (!isNaN(fromDate.getTime()) && now < fromDate) {
        return { valid: false, error: `Coupon promotion starts on ${fromDate.toLocaleDateString()}.` };
      }
    }

    if (couponData.validUntil) {
      const untilDate = typeof couponData.validUntil.toDate === "function"
        ? couponData.validUntil.toDate()
        : new Date(couponData.validUntil);
      if (!isNaN(untilDate.getTime()) && now > untilDate) {
        return { valid: false, error: `Coupon ${cleanCode} has expired.` };
      }
    }

    // 5. Global Usage Limit check
    const usageLimit = Number(couponData.usageLimit || 0);
    const usedCount = Number(couponData.usedCount || 0);
    if (usageLimit > 0 && usedCount >= usageLimit) {
      return { valid: false, error: "This coupon has reached its maximum usage limit." };
    }

    // 6. Minimum Booking Amount check
    const minAmount = Number(couponData.minimumBookingAmount || couponData.minOrder || 0);
    const currentRental = Number(bookingAmount || 0);
    if (minAmount > 0 && currentRental < minAmount) {
      return {
        valid: false,
        error: `Minimum booking amount of ₹${minAmount.toLocaleString("en-IN")} required to use ${cleanCode}. (Current rental: ₹${currentRental.toLocaleString("en-IN")})`
      };
    }

    // 7. Single-User Usage check (if authenticated)
    const currentUid = userId || auth.currentUser?.uid;
    if (currentUid) {
      try {
        const usageQuery = query(
          collection(db, "couponUsage"),
          where("couponCode", "==", cleanCode),
          where("userId", "==", currentUid)
        );
        const usageSnap = await getDocs(usageQuery);
        if (!usageSnap.empty) {
          return {
            valid: false,
            error: `You have already used coupon ${cleanCode} on a previous booking.`
          };
        }
      } catch (permErr) {
        // non-blocking
      }
    }

    // Normalize coupon object
    const discountType = couponData.discountType || couponData.type || "flat";
    const discountValue = Number(couponData.discountValue ?? couponData.val ?? 0);
    const maxDiscount = Number(couponData.maxDiscount || 0);
    const label = couponData.label || (discountType === "percent" ? `${discountValue}% Off` : `₹${discountValue} Flat Off`);

    return {
      valid: true,
      coupon: {
        id: couponDocId,
        code: cleanCode,
        discountType,
        discountValue,
        maxDiscount,
        minimumBookingAmount: minAmount,
        label,
        description: couponData.description || "",
        active: true
      }
    };
  } catch (err) {
    console.error("[coupon-service] Validation error:", err);
    // Last-resort fallback match
    const fallbackMatch = DEFAULT_COUPONS.find(c => c.code === cleanCode);
    if (fallbackMatch) {
      const minAmount = Number(fallbackMatch.minimumBookingAmount || 0);
      if (Number(bookingAmount || 0) < minAmount) {
        return {
          valid: false,
          error: `Minimum booking amount of ₹${minAmount.toLocaleString("en-IN")} required.`
        };
      }
      return { valid: true, coupon: fallbackMatch };
    }
    return {
      valid: false,
      error: `Could not verify coupon "${cleanCode}". Please try again.`
    };
  }
}

/**
 * Permanently records coupon consumption in Firestore inside a secure transaction.
 * MUST be called only after payment/booking confirmation.
 * @param {Object} params
 * @param {string} params.couponCode
 * @param {string} params.userId
 * @param {string} params.bookingId
 * @param {number} params.discountAmount
 * @returns {Promise<{ success: boolean, error?: string }>} 
 */
export async function recordCouponUsage({ couponCode, userId, bookingId, discountAmount }) {
  const cleanCode = String(couponCode || "").trim().toUpperCase();
  if (!cleanCode || !userId || !bookingId) {
    return { success: false, error: "Missing required booking details for coupon record." };
  }

  const usageDocId = cleanCode + "_" + userId + "_" + bookingId;
  const usageRef = doc(db, "couponUsage", usageDocId);
  const couponRef = doc(db, "coupons", cleanCode);

  try {
    await runTransaction(db, async (transaction) => {
      const existingUsage = await transaction.get(usageRef);
      if (existingUsage.exists()) {
        return;
      }

      transaction.set(usageRef, {
        usageId: usageDocId,
        couponCode: cleanCode,
        userId,
        bookingId,
        discountAmount: Number(discountAmount || 0),
        usedAt: serverTimestamp()
      });

      const couponDoc = await transaction.get(couponRef);
      if (couponDoc.exists()) {
        transaction.update(couponRef, {
          usedCount: increment(1),
          updatedAt: serverTimestamp()
        });
      }
    });

    return { success: true };
  } catch (error) {
    console.error("[coupon-service] Failed to record atomic coupon usage:", error);
    return { success: false, error: error.message };
  }
}