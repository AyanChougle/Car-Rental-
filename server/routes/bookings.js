// server/routes/bookings.js
"use strict";

const express = require("express");
const db = require("../config/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

function formatBookingRow(b) {
  let returnInspection = null;
  let metadata = {};
  try {
    returnInspection = typeof b.return_inspection === "string" ? JSON.parse(b.return_inspection) : b.return_inspection;
  } catch (_) {}
  try {
    metadata = typeof b.metadata === "string" ? JSON.parse(b.metadata) : (b.metadata || {});
  } catch (_) {}

  return {
    id: b.booking_id,
    bookingId: b.booking_id,
    bookingNumber: b.booking_number || b.booking_id,
    userId: b.firebase_uid,
    userDbId: b.user_id,
    firebaseUid: b.firebase_uid,
    userName: b.user_name,
    userEmail: b.user_email,
    userPhone: b.user_phone,
    carId: b.car_id,
    vehicleName: b.vehicle_name,
    vehicleReg: b.vehicle_reg,
    vehicleCategory: b.vehicle_category,
    pickupDate: b.pickup_date,
    dropDate: b.drop_date,
    pickupLocation: b.pickup_location,
    dropLocation: b.drop_location,
    location: b.pickup_location,
    duration: b.duration,
    days: b.days,
    hours: b.hours,
    durationDays: b.days,
    withDriver: b.with_driver === 1,
    baseAmount: Number(b.base_amount),
    dayRate: Number(b.day_rate),
    hourlyRate: Number(b.hourly_rate),
    driverRate: Number(b.driver_rate),
    driverHourlyRate: Number(b.driver_hourly_rate),
    deliveryFee: Number(b.delivery_fee),
    insuranceFee: Number(b.insurance_fee),
    couponCode: b.coupon_code,
    couponDiscount: Number(b.coupon_discount),
    totalAmount: Number(b.total_amount),
    finalAmount: Number(b.final_amount),
    rentalTotal: Number(b.total_amount),
    securityDeposit: Number(b.security_deposit),
    paymentPlan: b.payment_plan,
    paymentAmount: Number(b.payment_amount),
    paymentAmountPaid: Number(b.payment_amount_paid),
    advanceAmount: Number(b.advance_amount),
    remainingBalance: Number(b.remaining_balance),
    remainingAmount: Number(b.remaining_amount),
    paymentMethod: b.payment_method,
    paymentMode: b.payment_mode,
    paymentRef: b.payment_ref,
    paymentStatus: b.payment_status,
    status: b.status,
    bookingStatus: b.booking_status,
    paymentScreenshotMediaId: b.payment_screenshot_media_id,
    paymentScreenshotCategory: b.payment_screenshot_category,
    paymentScreenshotURL: b.payment_screenshot_url,
    paymentScreenshotDataUrl: b.payment_screenshot_url,
    paymentSubmittedAt: b.payment_submitted_at,
    paymentSubmittedBy: b.payment_submitted_by,
    paymentVerifiedAt: b.payment_verified_at,
    paymentVerifiedBy: b.payment_verified_by,
    pickupStatus: b.pickup_status,
    pickupAt: b.pickup_at,
    pickupHandledBy: b.pickup_handled_by,
    pickupNotes: b.pickup_notes,
    pickupOdometer: b.pickup_odometer,
    pickupFuelLevel: b.pickup_fuel_level,
    pickupFastagBalance: b.pickup_fastag_balance,
    pickupPaymentCollected: Number(b.pickup_payment_collected),
    pickupPaymentCollectedAt: b.pickup_payment_collected_at,
    pickupPaymentCollectedBy: b.pickup_payment_collected_by,
    startOdometer: b.start_odometer,
    endOdometer: b.end_odometer,
    odometerStart: b.start_odometer,
    odometerEnd: b.end_odometer,
    startFastag: b.start_fastag,
    returnFastag: b.return_fastag,
    fastagStart: b.start_fastag,
    fastagReturn: b.return_fastag,
    returnInspection,
    metadata,
    createdAt: b.created_at,
    updatedAt: b.updated_at
  };
}

/**
 * POST /api/bookings
 * Create a new booking reservation
 */
router.post("/", requireAuth, async (req, res) => {
  const b = req.body || {};
  const bookingId = String(b.bookingId || b.bookingNumber || Math.floor(10000000 + Math.random() * 90000000));
  const bookingNumber = String(b.bookingNumber || bookingId);

  const num = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  try {
    // Get MySQL user ID
    const [userRows] = await db.query(
      "SELECT id FROM users WHERE firebase_uid = ? LIMIT 1",
      [req.user.firebaseUid]
    );
    const userId = userRows?.[0]?.id || null;

    // Execute within a database transaction
    await db.transaction(async (conn) => {
      // 1. Insert booking
      await conn.query(
        `INSERT INTO bookings (
          booking_id, booking_number, user_id, firebase_uid, user_name, user_email, user_phone,
          car_id, vehicle_name, vehicle_reg, vehicle_category, pickup_date, drop_date,
          pickup_location, drop_location, duration, days, hours, with_driver, base_amount,
          day_rate, hourly_rate, driver_rate, driver_hourly_rate, delivery_fee, insurance_fee,
          coupon_code, coupon_discount, total_amount, final_amount, security_deposit,
          payment_plan, payment_amount, payment_amount_paid, advance_amount, remaining_balance,
          remaining_amount, payment_method, payment_mode, payment_ref, payment_status, status,
          booking_status, payment_screenshot_media_id, payment_screenshot_category,
          payment_screenshot_url, payment_submitted_at, payment_submitted_by, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          payment_status = VALUES(payment_status),
          status = VALUES(status),
          booking_status = VALUES(booking_status),
          payment_ref = VALUES(payment_ref),
          payment_screenshot_url = VALUES(payment_screenshot_url),
          payment_submitted_at = VALUES(payment_submitted_at),
          updated_at = CURRENT_TIMESTAMP`,
        [
          bookingId,
          bookingNumber,
          userId,
          req.user.firebaseUid,
          b.userName || req.user.name || "Customer",
          b.userEmail || req.user.email || "",
          b.userPhone || req.user.phone || null,
          b.carId || b.vehicleReg || null,
          b.vehicleName || "KRUIZLY Vehicle",
          b.vehicleReg || null,
          b.vehicleCategory || "sedan",
          b.pickupDate || new Date().toISOString(),
          b.dropDate || new Date().toISOString(),
          b.pickupLocation || b.location || "Gavson Business Park, Ghansoli",
          b.dropLocation || b.location || "Gavson Business Park, Ghansoli",
          b.duration || "1 Day",
          num(b.days, 1),
          num(b.hours, 24),
          b.withDriver ? 1 : 0,
          num(b.baseAmount, 0),
          num(b.dayRate, 0),
          num(b.hourlyRate, 0),
          num(b.driverRate, 0),
          num(b.driverHourlyRate, 0),
          num(b.deliveryFee, 0),
          num(b.insuranceFee, 0),
          b.couponCode || null,
          num(b.couponDiscount, 0),
          num(b.totalAmount, 0),
          num(b.finalAmount ?? b.totalAmount, 0),
          num(b.securityDeposit, 0),
          b.paymentPlan || "full",
          num(b.paymentAmount, 0),
          num(b.paymentAmountPaid, 0),
          num(b.advanceAmount, 0),
          num(b.remainingBalance ?? b.remainingAmount, 0),
          num(b.remainingAmount ?? b.remainingBalance, 0),
          b.paymentMethod || "upi",
          b.paymentMode || null,
          b.paymentRef || null,
          b.paymentStatus || "pending_payment",
          b.status || "pending_payment",
          b.bookingStatus || "pending_payment",
          b.paymentScreenshotMediaId || null,
          b.paymentScreenshotCategory || "payment_screenshot",
          b.paymentScreenshotDataUrl || b.paymentScreenshotURL || null,
          b.paymentRef ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
          b.paymentRef ? req.user.firebaseUid : null,
          JSON.stringify(b.metadata || {})
        ]
      );

      // 2. If coupon applied, track usage in coupon_usage
      if (b.couponCode && num(b.couponDiscount, 0) > 0) {
        const [couponRows] = await conn.query(
          "SELECT id FROM coupons WHERE code = ? LIMIT 1",
          [String(b.couponCode).toUpperCase().trim()]
        );
        if (couponRows.length > 0) {
          const couponId = couponRows[0].id;
          await conn.query(
            `INSERT INTO coupon_usage (coupon_id, coupon_code, user_id, firebase_uid, booking_id, discount_applied)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE discount_applied = VALUES(discount_applied)`,
            [couponId, String(b.couponCode).toUpperCase().trim(), userId, req.user.firebaseUid, bookingId, num(b.couponDiscount, 0)]
          );
          await conn.query(
            "UPDATE coupons SET used_count = used_count + 1 WHERE id = ?",
            [couponId]
          );
        }
      }
    });

    res.status(201).json({
      success: true,
      message: "Booking reservation created successfully.",
      bookingId,
      bookingNumber
    });
  } catch (err) {
    console.error("[POST /api/bookings error]", err);
    res.status(500).json({ success: false, error: "Failed to create booking." });
  }
});

/**
 * GET /api/bookings/my-bookings
 * Get current user's bookings
 */
router.get("/my-bookings", requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT * FROM bookings
       WHERE firebase_uid = ?
       ORDER BY created_at DESC`,
      [req.user.firebaseUid]
    );

    const bookings = rows.map(formatBookingRow);
    res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    console.error("[GET /api/bookings/my-bookings error]", err);
    res.status(500).json({ success: false, error: "Failed to fetch bookings." });
  }
});

/**
 * GET /api/bookings
 * Staff: List all bookings with filters
 */
router.get("/", requireAuth, requireRole("admin", "manager", "executive"), async (req, res) => {
  const { dateFrom, dateTo, status, search, limit, offset } = req.query || {};

  try {
    let sql = "SELECT * FROM bookings WHERE 1=1";
    const params = [];

    if (status && status !== "all") {
      sql += " AND (status = ? OR booking_status = ? OR payment_status = ?)";
      params.push(status, status, status);
    }

    if (dateFrom) {
      sql += " AND (created_at >= ? OR pickup_date >= ?)";
      params.push(`${dateFrom} 00:00:00`, dateFrom);
    }

    if (dateTo) {
      sql += " AND (created_at <= ? OR pickup_date <= ?)";
      params.push(`${dateTo} 23:59:59`, dateTo);
    }

    if (search) {
      sql += " AND (booking_id LIKE ? OR user_name LIKE ? OR user_email LIKE ? OR user_phone LIKE ? OR vehicle_name LIKE ? OR payment_ref LIKE ?)";
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    sql += " ORDER BY created_at DESC";

    const rows = await db.query(sql, params);
    const bookings = rows.map(formatBookingRow);

    res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    console.error("[GET /api/bookings error]", err);
    res.status(500).json({ success: false, error: "Failed to fetch bookings." });
  }
});

/**
 * GET /api/bookings/:bookingId
 * Get specific booking
 */
router.get("/:bookingId", requireAuth, async (req, res) => {
  const bookingId = String(req.params.bookingId || "").trim();

  try {
    const rows = await db.query(
      "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
      [bookingId, bookingId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Booking not found." });
    }

    const booking = rows[0];
    const isStaff = ["admin", "manager", "executive"].includes(req.user.role);
    const isOwner = booking.firebase_uid === req.user.firebaseUid;

    if (!isStaff && !isOwner) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    res.json({ success: true, booking: formatBookingRow(booking) });
  } catch (err) {
    console.error("[GET /api/bookings/:bookingId error]", err);
    res.status(500).json({ success: false, error: "Failed to fetch booking." });
  }
});

/**
 * PUT /api/bookings/:bookingId
 * Update booking fields (handover, inspection, status, odometers)
 */
router.put("/:bookingId", requireAuth, async (req, res) => {
  const bookingId = String(req.params.bookingId || "").trim();
  const b = req.body || {};

  try {
    const [existing] = await db.query(
      "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
      [bookingId, bookingId]
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, error: "Booking not found." });
    }

    const current = existing[0];
    const isStaff = ["admin", "manager", "executive"].includes(req.user.role);
    const isOwner = current.firebase_uid === req.user.firebaseUid;

    if (!isStaff && !isOwner) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    const updates = [];
    const params = [];

    const setField = (col, val) => {
      if (val !== undefined) {
        updates.push(`${col} = ?`);
        params.push(val);
      }
    };

    setField("status", b.status);
    setField("booking_status", b.bookingStatus || b.status);
    setField("payment_status", b.paymentStatus);
    setField("payment_ref", b.paymentRef);
    setField("payment_mode", b.paymentMode);
    setField("payment_amount_paid", b.paymentAmountPaid !== undefined ? Number(b.paymentAmountPaid) : undefined);
    setField("remaining_balance", b.remainingBalance !== undefined ? Number(b.remainingBalance) : undefined);
    setField("pickup_status", b.pickupStatus);
    setField("pickup_notes", b.pickupNotes);
    setField("pickup_odometer", b.pickupOdometer ? String(b.pickupOdometer) : undefined);
    setField("pickup_fuel_level", b.pickupFuelLevel ? String(b.pickupFuelLevel) : undefined);
    setField("pickup_fastag_balance", b.pickupFastagBalance ? String(b.pickupFastagBalance) : undefined);
    setField("start_odometer", b.startOdometer || b.odometerStart ? String(b.startOdometer || b.odometerStart) : undefined);
    setField("end_odometer", b.endOdometer || b.odometerEnd ? String(b.endOdometer || b.odometerEnd) : undefined);
    setField("start_fastag", b.startFastag || b.fastagStart ? String(b.startFastag || b.fastagStart) : undefined);
    setField("return_fastag", b.returnFastag || b.fastagReturn ? String(b.returnFastag || b.fastagReturn) : undefined);

    if (b.pickupHandledBy) setField("pickup_handled_by", b.pickupHandledBy);
    if (b.pickupAt) setField("pickup_at", b.pickupAt);
    if (b.returnInspection !== undefined) {
      setField("return_inspection", JSON.stringify(b.returnInspection));
    }

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(current.booking_id);

      await db.query(
        `UPDATE bookings SET ${updates.join(", ")} WHERE booking_id = ?`,
        params
      );
    }

    res.json({ success: true, message: "Booking updated successfully." });
  } catch (err) {
    console.error("[PUT /api/bookings/:bookingId error]", err);
    res.status(500).json({ success: false, error: "Failed to update booking." });
  }
});

/**
 * POST /api/bookings/:bookingId/cancel
 * Cancel booking, mark payment refunded, restore vehicle availability, and release coupons
 */
router.post("/:bookingId/cancel", requireAuth, async (req, res) => {
  const bookingId = String(req.params.bookingId || "").trim();

  try {
    const [bRows] = await db.query(
      "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
      [bookingId, bookingId]
    );

    if (!bRows.length) {
      return res.status(404).json({ success: false, error: "Booking not found." });
    }

    const b = bRows[0];
    const isStaff = ["admin", "manager", "executive"].includes(req.user.role);
    const isOwner = b.firebase_uid === req.user.firebaseUid;

    if (!isStaff && !isOwner) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    if (b.status === "cancelled") {
      return res.json({ success: true, message: "Booking is already cancelled." });
    }

    const refundAmount = Number(b.payment_amount_paid || b.advance_amount || 0);

    await db.transaction(async (conn) => {
      // 1. Cancel booking and mark payment refunded
      await conn.query(
        `UPDATE bookings SET
          status = 'cancelled',
          booking_status = 'cancelled',
          payment_status = IF(payment_amount_paid > 0 OR advance_amount > 0, 'refunded', 'cancelled'),
          remaining_balance = 0,
          remaining_amount = 0,
          updated_at = CURRENT_TIMESTAMP
         WHERE booking_id = ?`,
        [b.booking_id]
      );

      // 2. Mark payments as refunded
      if (refundAmount > 0) {
        await conn.query(
          `UPDATE payments SET
            status = 'refunded',
            refund_amount = ?,
            refund_reason = 'Booking cancelled by user/admin',
            updated_at = CURRENT_TIMESTAMP
           WHERE booking_id = ?`,
          [refundAmount, b.booking_id]
        );
      }

      // 3. Free vehicle availability
      if (b.vehicle_reg) {
        await conn.query(
          `UPDATE vehicles SET
            available = 1,
            status = 'available',
            updated_at = CURRENT_TIMESTAMP
           WHERE reg_no = ?`,
          [b.vehicle_reg]
        );
      }

      // 4. Release coupon usage
      if (b.coupon_code) {
        await conn.query(
          "DELETE FROM coupon_usage WHERE booking_id = ? AND firebase_uid = ?",
          [b.booking_id, b.firebase_uid]
        );
        await conn.query(
          "UPDATE coupons SET used_count = GREATEST(0, used_count - 1) WHERE code = ?",
          [b.coupon_code]
        );
      }
    });

    res.json({
      success: true,
      message: "Booking cancelled successfully. Payment marked as refunded and vehicle availability restored.",
      bookingId: b.booking_id,
      refundAmount
    });
  } catch (err) {
    console.error("[POST /api/bookings/:bookingId/cancel error]", err);
    res.status(500).json({ success: false, error: "Failed to cancel booking." });
  }
});

module.exports = router;
