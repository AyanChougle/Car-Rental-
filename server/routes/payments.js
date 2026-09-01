// server/routes/payments.js
"use strict";

const express = require("express");
const db = require("../config/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/payments/submit
 * User submits manual UPI UTR & payment screenshot
 */
router.post("/submit", requireAuth, async (req, res) => {
  const {
    bookingId,
    amount,
    method,
    utr,
    screenshotMediaId,
    screenshotUrl
  } = req.body || {};

  const cleanBookingId = String(bookingId || "").trim();
  const cleanUtr = String(utr || "").trim();
  const numAmount = Number(amount || 0);

  if (!cleanBookingId) {
    return res.status(400).json({ success: false, error: "Booking ID is required." });
  }

  if (!cleanUtr && !screenshotUrl && !screenshotMediaId) {
    return res.status(400).json({
      success: false,
      error: "Payment proof required. Please provide UTR number or upload a screenshot."
    });
  }

  try {
    const [userRows] = await db.query(
      "SELECT id FROM users WHERE firebase_uid = ? LIMIT 1",
      [req.user.firebaseUid]
    );
    const userId = userRows?.[0]?.id || null;

    await db.transaction(async (conn) => {
      // 1. Insert or update payment record
      await conn.query(
        `INSERT INTO payments (
          booking_id, user_id, firebase_uid, amount, currency, method,
          utr, screenshot_media_id, screenshot_url, status
        ) VALUES (?, ?, ?, ?, 'INR', ?, ?, ?, ?, 'pending_verification')
        ON DUPLICATE KEY UPDATE
          amount = VALUES(amount),
          utr = VALUES(utr),
          screenshot_url = VALUES(screenshot_url),
          status = 'pending_verification',
          updated_at = CURRENT_TIMESTAMP`,
        [
          cleanBookingId,
          userId,
          req.user.firebaseUid,
          numAmount,
          method || "upi",
          cleanUtr || null,
          screenshotMediaId || null,
          screenshotUrl || null
        ]
      );

      // 2. Update booking status
      await conn.query(
        `UPDATE bookings SET
          payment_ref = COALESCE(?, payment_ref),
          payment_status = 'pending_verification',
          status = 'pending_verification',
          booking_status = 'pending_verification',
          payment_screenshot_media_id = COALESCE(?, payment_screenshot_media_id),
          payment_screenshot_url = COALESCE(?, payment_screenshot_url),
          payment_submitted_at = CURRENT_TIMESTAMP,
          payment_submitted_by = ?,
          payment_amount_paid = IF(payment_amount_paid > 0, payment_amount_paid, ?),
          updated_at = CURRENT_TIMESTAMP
         WHERE booking_id = ?`,
        [
          cleanUtr || null,
          screenshotMediaId || null,
          screenshotUrl || null,
          req.user.firebaseUid,
          numAmount,
          cleanBookingId
        ]
      );
    });

    res.json({
      success: true,
      message: "Payment proof submitted successfully. Your booking is under verification."
    });
  } catch (err) {
    console.error("[POST /api/payments/submit error]", err);
    res.status(500).json({ success: false, error: "Failed to submit payment proof." });
  }
});

/**
 * GET /api/payments
 * Admin/Staff: List all payment submissions
 */
router.get("/", requireAuth, requireRole("admin", "manager", "executive"), async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT p.*, b.vehicle_name, b.user_name, b.user_email, b.user_phone, b.total_amount, b.payment_plan
       FROM payments p
       LEFT JOIN bookings b ON p.booking_id = b.booking_id
       ORDER BY p.created_at DESC`
    );

    res.json({ success: true, count: rows.length, payments: rows });
  } catch (err) {
    console.error("[GET /api/payments error]", err);
    res.status(500).json({ success: false, error: "Failed to list payments." });
  }
});

/**
 * POST /api/payments/:id/verify
 * Admin/Staff: Approve or Reject a payment
 */
router.post("/:id/verify", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const paymentId = req.params.id;
  const { action, reason, bookingId } = req.body || {}; // action: approve, reject

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ success: false, error: "Action must be 'approve' or 'reject'." });
  }

  try {
    const [pRows] = await db.query(
      "SELECT * FROM payments WHERE id = ? OR booking_id = ? ORDER BY id DESC LIMIT 1",
      [paymentId, bookingId || paymentId]
    );

    if (!pRows.length) {
      return res.status(404).json({ success: false, error: "Payment record not found." });
    }

    const payment = pRows[0];
    const targetBookingId = payment.booking_id;
    const isApproved = action === "approve";

    await db.transaction(async (conn) => {
      // 1. Update payment status
      await conn.query(
        `UPDATE payments SET
          status = ?,
          rejection_reason = ?,
          verified_at = CURRENT_TIMESTAMP,
          verified_by = ?
         WHERE id = ?`,
        [
          isApproved ? "verified" : "rejected",
          isApproved ? null : (reason || "Payment could not be verified."),
          req.user.firebaseUid,
          payment.id
        ]
      );

      // 2. Fetch booking to check payment plan
      const [bRows] = await conn.query(
        "SELECT * FROM bookings WHERE booking_id = ? LIMIT 1",
        [targetBookingId]
      );

      if (bRows.length) {
        const booking = bRows[0];
        const newPaymentStatus = isApproved
          ? (booking.payment_plan === "advance" ? "advance_paid" : "paid")
          : "rejected";
        const newBookingStatus = isApproved ? "confirmed" : "pending_payment";

        await conn.query(
          `UPDATE bookings SET
            payment_status = ?,
            status = ?,
            booking_status = ?,
            payment_verified_at = CURRENT_TIMESTAMP,
            payment_verified_by = ?,
            updated_at = CURRENT_TIMESTAMP
           WHERE booking_id = ?`,
          [
            newPaymentStatus,
            newBookingStatus,
            newBookingStatus,
            req.user.firebaseUid,
            targetBookingId
          ]
        );
      }
    });

    res.json({
      success: true,
      message: `Payment ${isApproved ? "approved and booking confirmed" : "marked as rejected"}.`,
      bookingId: targetBookingId
    });
  } catch (err) {
    console.error("[POST /api/payments/:id/verify error]", err);
    res.status(500).json({ success: false, error: "Failed to verify payment." });
  }
});

module.exports = router;
