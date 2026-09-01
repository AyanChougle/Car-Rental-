// server/routes/users.js
"use strict";

const express = require("express");
const db = require("../config/database");
const { requireAuth, requireRole, invalidateUserCache } = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/users/me
 * Retrieve current authenticated user profile from MySQL
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, firebase_uid, email, name, phone, age, role, status,
              license_status, aadhar_status, pan_status, ip_address,
              metadata, created_at, updated_at
       FROM users
       WHERE firebase_uid = ?
       LIMIT 1`,
      [req.user.firebaseUid]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: "User record not found." });
    }

    const user = rows[0];
    let metadata = {};
    try {
      metadata = typeof user.metadata === "string" ? JSON.parse(user.metadata) : (user.metadata || {});
    } catch (_) {}

    res.json({
      success: true,
      user: {
        id: user.id,
        uid: user.firebase_uid,
        firebaseUid: user.firebase_uid,
        email: user.email,
        name: user.name,
        phone: user.phone,
        age: user.age,
        role: user.role,
        status: user.status,
        licenseStatus: user.license_status,
        aadharStatus: user.aadhar_status,
        panStatus: user.pan_status,
        ipAddress: user.ip_address,
        licenseURL: metadata.licenseURL || metadata.licenseFrontURL || null,
        licenseFrontURL: metadata.licenseFrontURL || null,
        licenseBackURL: metadata.licenseBackURL || null,
        aadharURL: metadata.aadharURL || metadata.aadharFrontURL || null,
        aadharFrontURL: metadata.aadharFrontURL || null,
        aadharBackURL: metadata.aadharBackURL || null,
        panFrontURL: metadata.panFrontURL || null,
        panBackURL: metadata.panBackURL || null,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });
  } catch (err) {
    console.error("[GET /api/users/me error]", err);
    res.status(500).json({ success: false, error: "Failed to fetch user profile." });
  }
});

/**
 * POST /api/users/sync
 * Sync Firebase Auth credentials into MySQL users table on login
 */
router.post("/sync", requireAuth, async (req, res) => {
  const { name, phone, age } = req.body || {};
  const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || null;

  try {
    await db.query(
      `INSERT INTO users (firebase_uid, email, name, phone, age, role, status, ip_address)
       VALUES (?, ?, ?, ?, ?, 'customer', 'active', ?)
       ON DUPLICATE KEY UPDATE
         email = VALUES(email),
         name = COALESCE(VALUES(name), name),
         phone = COALESCE(VALUES(phone), phone),
         age = COALESCE(VALUES(age), age),
         ip_address = COALESCE(VALUES(ip_address), ip_address),
         updated_at = CURRENT_TIMESTAMP`,
      [
        req.user.firebaseUid,
        req.user.email,
        name || req.user.name,
        phone || null,
        age ? Number(age) : null,
        ipAddress
      ]
    );

    invalidateUserCache(req.user.firebaseUid);

    const [rows] = await db.query(
      `SELECT id, firebase_uid, email, name, phone, age, role, status,
              license_status, aadhar_status, pan_status
       FROM users WHERE firebase_uid = ? LIMIT 1`,
      [req.user.firebaseUid]
    );

    res.json({
      success: true,
      message: "User synchronized successfully.",
      user: rows[0] || req.user
    });
  } catch (err) {
    console.error("[POST /api/users/sync error]", err);
    res.status(500).json({ success: false, error: "Failed to sync user." });
  }
});

/**
 * PUT /api/users/me
 * Update personal profile information
 */
router.put("/me", requireAuth, async (req, res) => {
  const { name, phone, age } = req.body || {};

  try {
    await db.query(
      `UPDATE users
       SET name = COALESCE(?, name),
           phone = COALESCE(?, phone),
           age = COALESCE(?, age),
           updated_at = CURRENT_TIMESTAMP
       WHERE firebase_uid = ?`,
      [name || null, phone || null, age ? Number(age) : null, req.user.firebaseUid]
    );

    invalidateUserCache(req.user.firebaseUid);

    res.json({ success: true, message: "Profile updated successfully." });
  } catch (err) {
    console.error("[PUT /api/users/me error]", err);
    res.status(500).json({ success: false, error: "Failed to update profile." });
  }
});

/**
 * GET /api/users
 * Admin/Staff: List all registered users
 */
router.get("/", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, firebase_uid, email, name, phone, age, role, status,
              license_status, aadhar_status, pan_status, ip_address,
              metadata, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );

    const users = rows.map((u) => {
      let meta = {};
      try {
        meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata || {});
      } catch (_) {}

      return {
        id: u.firebase_uid,
        dbId: u.id,
        uid: u.firebase_uid,
        email: u.email,
        name: u.name,
        phone: u.phone,
        age: u.age,
        role: u.role,
        status: u.status,
        licenseStatus: u.license_status,
        aadharStatus: u.aadhar_status,
        panStatus: u.pan_status,
        ipAddress: u.ip_address,
        licenseURL: meta.licenseURL || meta.licenseFrontURL || null,
        licenseFrontURL: meta.licenseFrontURL || null,
        licenseBackURL: meta.licenseBackURL || null,
        aadharURL: meta.aadharURL || meta.aadharFrontURL || null,
        aadharFrontURL: meta.aadharFrontURL || null,
        aadharBackURL: meta.aadharBackURL || null,
        panFrontURL: meta.panFrontURL || null,
        panBackURL: meta.panBackURL || null,
        createdAt: u.created_at,
        updatedAt: u.updated_at
      };
    });

    res.json({ success: true, count: users.length, users });
  } catch (err) {
    console.error("[GET /api/users error]", err);
    res.status(500).json({ success: false, error: "Failed to list users." });
  }
});

/**
 * PUT /api/users/:uid/role
 * Admin: Update user role (admin, manager, executive, customer, host)
 */
router.put("/:uid/role", requireAuth, requireRole("admin"), async (req, res) => {
  const targetUid = String(req.params.uid || "").trim();
  const { role, status } = req.body || {};

  const allowedRoles = ["customer", "admin", "manager", "executive", "host"];
  if (role && !allowedRoles.includes(role)) {
    return res.status(400).json({ success: false, error: "Invalid role specified." });
  }

  try {
    await db.query(
      `UPDATE users
       SET role = COALESCE(?, role),
           status = COALESCE(?, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE firebase_uid = ?`,
      [role || null, status || null, targetUid]
    );

    invalidateUserCache(targetUid);

    res.json({ success: true, message: `User permissions updated.` });
  } catch (err) {
    console.error("[PUT /api/users/:uid/role error]", err);
    res.status(500).json({ success: false, error: "Failed to update user role." });
  }
});

/**
 * GET /api/users/partner-cars
 * List all partner/host car listings
 */
router.get("/partner-cars", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT * FROM partner_cars ORDER BY created_at DESC`
    );

    const partnerCars = rows.map((c) => {
      let photos = [];
      try {
        photos = typeof c.photos === "string" ? JSON.parse(c.photos) : (c.photos || []);
      } catch (_) {}

      return {
        id: c.id,
        carId: c.car_id,
        userId: c.firebase_uid,
        userName: c.user_name,
        userPhone: c.user_phone,
        userEmail: c.user_email,
        brand: c.brand,
        model: c.model,
        year: c.year,
        regNo: c.reg_no,
        transmission: c.transmission,
        fuel: c.fuel,
        city: c.city,
        expectedPrice: c.expected_price,
        status: c.status,
        photos,
        rejectionReason: c.rejection_reason,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      };
    });

    res.json({ success: true, count: partnerCars.length, partnerCars });
  } catch (err) {
    console.error("[GET /api/users/partner-cars error]", err);
    res.status(500).json({ success: false, error: "Failed to fetch partner cars." });
  }
});

/**
 * PUT /api/users/partner-cars/:id/status
 * Approve/reject partner car listing
 */
router.put("/partner-cars/:id/status", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const carId = req.params.id;
  const { status, rejectionReason } = req.body || {};

  try {
    await db.query(
      `UPDATE partner_cars
       SET status = ?,
           rejection_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? OR car_id = ?`,
      [status, rejectionReason || null, carId, carId]
    );

    res.json({ success: true, message: `Partner car status updated to ${status}.` });
  } catch (err) {
    console.error("[PUT /api/users/partner-cars/:id/status error]", err);
    res.status(500).json({ success: false, error: "Failed to update partner car status." });
  }
});

module.exports = router;
