// server/routes/verification.js
"use strict";

const express = require("express");
const crypto = require("crypto");
const db = require("../config/database");
const { requireAuth, requireRole, invalidateUserCache } = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/verification/submit
 * Submit user KYC documents
 */
router.post("/submit", requireAuth, async (req, res) => {
  const {
    licenseNumber, licenseFrontMediaId, licenseBackMediaId,
    aadharNumber, aadharFrontMediaId, aadharBackMediaId,
    panNumber, panFrontMediaId, panBackMediaId,
    selfieMediaId, fullName, phone
  } = req.body || {};

  const verificationId = `VER-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

  try {
    const [userRows] = await db.query("SELECT id FROM users WHERE firebase_uid = ? LIMIT 1", [req.user.firebaseUid]);
    const userId = userRows?.[0]?.id || null;

    const licenseStatus = (licenseFrontMediaId || licenseNumber) ? "pending" : "not_submitted";
    const aadharStatus = (aadharFrontMediaId || aadharNumber) ? "pending" : "not_submitted";
    const panStatus = (panFrontMediaId || panNumber) ? "pending" : "not_submitted";

    await db.transaction(async (conn) => {
      await conn.query(
        `INSERT INTO verification (
          verification_id, user_id, firebase_uid, full_name, phone,
          license_number, license_front_media_id, license_back_media_id, license_status,
          aadhar_number, aadhar_front_media_id, aadhar_back_media_id, aadhar_status,
          pan_number, pan_front_media_id, pan_back_media_id, pan_status,
          selfie_media_id, overall_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          verificationId, userId, req.user.firebaseUid,
          fullName || req.user.name, phone || req.user.phone,
          licenseNumber || null, licenseFrontMediaId || null, licenseBackMediaId || null, licenseStatus,
          aadharNumber || null, aadharFrontMediaId || null, aadharBackMediaId || null, aadharStatus,
          panNumber || null, panFrontMediaId || null, panBackMediaId || null, panStatus,
          selfieMediaId || null
        ]
      );

      // Update user document statuses
      await conn.query(
        `UPDATE users SET
          license_status = IF(? != 'not_submitted', ?, license_status),
          aadhar_status = IF(? != 'not_submitted', ?, aadhar_status),
          pan_status = IF(? != 'not_submitted', ?, pan_status),
          updated_at = CURRENT_TIMESTAMP
         WHERE firebase_uid = ?`,
        [licenseStatus, licenseStatus, aadharStatus, aadharStatus, panStatus, panStatus, req.user.firebaseUid]
      );
    });

    invalidateUserCache(req.user.firebaseUid);

    res.status(201).json({
      success: true,
      message: "Identity verification submitted for review.",
      verificationId
    });
  } catch (err) {
    console.error("[POST /api/verification/submit error]", err);
    res.status(500).json({ success: false, error: "Failed to submit verification." });
  }
});

/**
 * GET /api/verification/me
 * Get current user verification details
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT * FROM verification
       WHERE firebase_uid = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.firebaseUid]
    );

    res.json({ success: true, verification: rows[0] || null });
  } catch (err) {
    console.error("[GET /api/verification/me error]", err);
    res.status(500).json({ success: false, error: "Failed to fetch verification status." });
  }
});

/**
 * GET /api/verification
 * Admin: List all submitted KYC verifications
 */
router.get("/", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT v.*, u.name as user_name, u.email as user_email
       FROM verification v
       LEFT JOIN users u ON v.firebase_uid = u.firebase_uid
       ORDER BY v.created_at DESC`
    );

    res.json({ success: true, count: rows.length, verifications: rows });
  } catch (err) {
    console.error("[GET /api/verification error]", err);
    res.status(500).json({ success: false, error: "Failed to list verifications." });
  }
});

/**
 * POST /api/verification/:id/review
 * Admin: Approve / Reject document verification
 */
router.post("/:id/review", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const verificationId = String(req.params.id || "").trim();
  const { docType, status, reason } = req.body || {}; // docType: license, aadhar, pan, overall | status: verified, rejected

  if (!["verified", "rejected"].includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid status. Must be 'verified' or 'rejected'." });
  }

  try {
    const [verRows] = await db.query(
      "SELECT * FROM verification WHERE verification_id = ? OR id = ? LIMIT 1",
      [verificationId, verificationId]
    );

    if (!verRows.length) {
      return res.status(404).json({ success: false, error: "Verification record not found." });
    }

    const ver = verRows[0];
    const userUid = ver.firebase_uid;

    await db.transaction(async (conn) => {
      let docCol = null;
      if (docType === "license") docCol = "license_status";
      else if (docType === "aadhar") docCol = "aadhar_status";
      else if (docType === "pan") docCol = "pan_status";
      else docCol = "overall_status";

      await conn.query(
        `UPDATE verification SET
          ${docCol} = ?,
          rejection_reason = IF(? = 'rejected', ?, rejection_reason),
          verified_at = CURRENT_TIMESTAMP,
          verified_by = ?
         WHERE id = ?`,
        [status, status, reason || null, req.user.firebaseUid, ver.id]
      );

      // Update user record
      if (docCol !== "overall_status") {
        await conn.query(
          `UPDATE users SET
            ${docCol} = ?,
            updated_at = CURRENT_TIMESTAMP
           WHERE firebase_uid = ?`,
          [status, userUid]
        );
      }
    });

    invalidateUserCache(userUid);

    res.json({ success: true, message: `Document marked as ${status}.` });
  } catch (err) {
    console.error("[POST /api/verification/:id/review error]", err);
    res.status(500).json({ success: false, error: "Failed to review verification." });
  }
});

module.exports = router;
