// server/routes/coupons.js
"use strict";

const express = require("express");
const db = require("../config/database");
const { requireAuth, requireRole, optionalAuth } = require("../middleware/auth");

const router = express.Router();

function formatCoupon(c) {
  return {
    id: c.code,
    dbId: c.id,
    code: c.code,
    type: c.type,
    discountType: c.discount_type,
    val: Number(c.discount_value),
    discountValue: Number(c.discount_value),
    minOrder: Number(c.min_order),
    minimumBookingAmount: Number(c.min_order),
    maxDiscount: Number(c.max_discount),
    label: c.label || c.code,
    description: c.description || c.label,
    usageLimit: c.usage_limit,
    usedCount: c.used_count,
    active: c.active === 1,
    status: c.status,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  };
}

/**
 * POST /api/coupons/validate
 * Server-side validation of discount code
 */
router.post("/validate", optionalAuth, async (req, res) => {
  const { code, bookingAmount } = req.body || {};
  const cleanCode = String(code || "").trim().toUpperCase();
  const subtotal = Number(bookingAmount || 0);

  if (!cleanCode) {
    return res.status(400).json({ success: false, error: "Coupon code is required." });
  }

  try {
    const [coupons] = await db.query("SELECT * FROM coupons WHERE code = ? LIMIT 1", [cleanCode]);

    if (!coupons.length) {
      return res.status(404).json({ success: false, error: "Invalid coupon code." });
    }

    const coupon = coupons[0];

    // Status check
    if (coupon.active !== 1 || coupon.status !== "active") {
      return res.status(400).json({ success: false, error: "This coupon is currently inactive or expired." });
    }

    // Minimum order check
    if (subtotal > 0 && Number(coupon.min_order) > 0 && subtotal < Number(coupon.min_order)) {
      return res.status(400).json({
        success: false,
        error: `Minimum booking amount of ₹${coupon.min_order.toLocaleString("en-IN")} required for this coupon.`
      });
    }

    // Usage limit check
    if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) {
      return res.status(400).json({ success: false, error: "This coupon has reached its maximum total usage limit." });
    }

    // Single use per user check
    if (req.user?.firebaseUid) {
      const [usageRows] = await db.query(
        "SELECT id FROM coupon_usage WHERE firebase_uid = ? AND coupon_code = ? LIMIT 1",
        [req.user.firebaseUid, cleanCode]
      );

      if (usageRows.length > 0) {
        return res.status(400).json({
          success: false,
          error: "You have already used this coupon code. Limit: 1 per customer."
        });
      }
    }

    // Calculate discount
    let discountAmount = 0;
    const discountVal = Number(coupon.discount_value);

    if (coupon.type === "percentage" || coupon.discount_type === "percentage") {
      discountAmount = Math.round((subtotal * discountVal) / 100);
      if (Number(coupon.max_discount) > 0) {
        discountAmount = Math.min(discountAmount, Number(coupon.max_discount));
      }
    } else {
      discountAmount = discountVal;
    }

    discountAmount = Math.min(discountAmount, subtotal > 0 ? subtotal : discountAmount);

    res.json({
      success: true,
      valid: true,
      coupon: formatCoupon(coupon),
      discountAmount,
      message: `Coupon '${cleanCode}' applied successfully!`
    });
  } catch (err) {
    console.error("[POST /api/coupons/validate error]", err);
    res.status(500).json({ success: false, error: "Failed to validate coupon." });
  }
});

/**
 * GET /api/coupons
 * List coupons (public: active only, staff: all)
 */
router.get("/", optionalAuth, async (req, res) => {
  try {
    const isStaff = req.user && (req.user.role === "admin" || req.user.role === "manager");
    const sql = isStaff
      ? "SELECT * FROM coupons ORDER BY id ASC"
      : "SELECT * FROM coupons WHERE active = 1 AND status = 'active' ORDER BY id ASC";

    const rows = await db.query(sql);
    const coupons = rows.map(formatCoupon);

    res.json({ success: true, count: coupons.length, coupons });
  } catch (err) {
    console.error("[GET /api/coupons error]", err);
    res.status(500).json({ success: false, error: "Failed to list coupons." });
  }
});

/**
 * POST /api/coupons
 * Admin: Create coupon
 */
router.post("/", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const body = req.body || {};
  const code = String(body.code || body.id || "").trim().toUpperCase();
  const type = body.type || body.discountType || "flat";
  const discountVal = Number(body.discountValue ?? body.val ?? 0);
  const minOrder = Number(body.minOrder ?? body.minimumBookingAmount ?? 0);
  const maxDiscount = Number(body.maxDiscount ?? 0);
  const label = body.label || `${code} Special`;
  const description = body.description || label;
  const active = body.active === false ? 0 : 1;
  const status = body.status || (active ? "active" : "inactive");

  if (!code) {
    return res.status(400).json({ success: false, error: "Coupon code is required." });
  }

  try {
    await db.query(
      `INSERT INTO coupons (
        code, type, discount_type, discount_value, min_order, max_discount,
        label, description, active, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        type = VALUES(type),
        discount_type = VALUES(discount_type),
        discount_value = VALUES(discount_value),
        min_order = VALUES(min_order),
        max_discount = VALUES(max_discount),
        label = VALUES(label),
        description = VALUES(description),
        active = VALUES(active),
        status = VALUES(status),
        updated_at = CURRENT_TIMESTAMP`,
      [code, type, type, discountVal, minOrder, maxDiscount, label, description, active, status]
    );

    res.status(201).json({ success: true, message: `Coupon '${code}' saved successfully.` });
  } catch (err) {
    console.error("[POST /api/coupons error]", err);
    res.status(500).json({ success: false, error: "Failed to save coupon." });
  }
});

/**
 * PUT /api/coupons/:code
 * Admin: Update coupon status
 */
router.put("/:code", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const code = String(req.params.code || "").trim().toUpperCase();
  const { active, status } = req.body || {};

  try {
    await db.query(
      `UPDATE coupons
       SET active = COALESCE(?, active),
           status = COALESCE(?, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE code = ?`,
      [active !== undefined ? (active ? 1 : 0) : null, status || null, code]
    );

    res.json({ success: true, message: `Coupon '${code}' updated.` });
  } catch (err) {
    console.error("[PUT /api/coupons/:code error]", err);
    res.status(500).json({ success: false, error: "Failed to update coupon." });
  }
});

/**
 * DELETE /api/coupons/:code
 * Admin: Delete coupon
 */
router.delete("/:code", requireAuth, requireRole("admin"), async (req, res) => {
  const code = String(req.params.code || "").trim().toUpperCase();
  try {
    await db.query("DELETE FROM coupons WHERE code = ?", [code]);
    res.json({ success: true, message: `Coupon '${code}' deleted.` });
  } catch (err) {
    console.error("[DELETE /api/coupons/:code error]", err);
    res.status(500).json({ success: false, error: "Failed to delete coupon." });
  }
});

module.exports = router;
