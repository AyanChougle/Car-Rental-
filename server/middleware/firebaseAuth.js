// server/middleware/firebaseAuth.js
"use strict";

const admin = require("../firebaseAdmin");
const db = require("../config/database");

// In-memory user cache with 60s TTL to prevent database hammering on high-frequency requests
const userCache = new Map();
const USER_CACHE_TTL_MS = 60_000;

/**
 * Fetch or auto-provision MySQL user record corresponding to Firebase UID
 * @param {object} decoded - Decoded Firebase JWT token
 * @returns {Promise<object>} User object from MySQL
 */
async function resolveMySqlUser(decoded) {
  const uid = decoded.uid;
  const cached = userCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const email = decoded.email || `${uid}@kruizly.com`;
  const name = decoded.name || (decoded.email ? decoded.email.split("@")[0] : "User");

  try {
    const rows = await db.query(
      `SELECT id, firebase_uid, email, name, phone, age, role, status,
              license_status, aadhar_status, pan_status, ip_address
       FROM users
       WHERE firebase_uid = ?
       LIMIT 1`,
      [uid]
    );

    let userRecord = rows?.[0];

    if (!userRecord) {
      // Auto-provision initial customer profile in MySQL
      const insertResult = await db.query(
        `INSERT INTO users (firebase_uid, email, name, role, status)
         VALUES (?, ?, ?, 'customer', 'active')
         ON DUPLICATE KEY UPDATE email = VALUES(email)`,
        [uid, email, name]
      );

      const newId = insertResult.insertId;
      userRecord = {
        id: newId,
        firebase_uid: uid,
        email,
        name,
        phone: null,
        age: null,
        role: "customer",
        status: "active",
        license_status: "not_submitted",
        aadhar_status: "not_submitted",
        pan_status: "not_submitted"
      };
    }

    const userData = {
      userId: userRecord.id,
      firebaseUid: userRecord.firebase_uid,
      uid: userRecord.firebase_uid,
      email: userRecord.email,
      name: userRecord.name,
      phone: userRecord.phone,
      role: userRecord.role || "customer",
      status: userRecord.status || "active",
      licenseStatus: userRecord.license_status,
      aadharStatus: userRecord.aadhar_status,
      panStatus: userRecord.pan_status
    };

    userCache.set(uid, {
      user: userData,
      expiresAt: Date.now() + USER_CACHE_TTL_MS
    });

    return userData;
  } catch (err) {
    console.error("[firebaseAuth] Database lookup error:", err.message);
    // Fallback minimal user object if DB temporarily unavailable
    return {
      userId: null,
      firebaseUid: uid,
      uid,
      email,
      name,
      role: "customer",
      status: "active"
    };
  }
}

/**
 * Invalidate user cache on profile/role update
 * @param {string} firebaseUid 
 */
function invalidateUserCache(firebaseUid) {
  if (firebaseUid) {
    userCache.delete(firebaseUid);
  }
}

/**
 * requireAuth middleware: validates Bearer token and populates req.user
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Authentication required. Missing Bearer token in Authorization header."
    });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const user = await resolveMySqlUser(decoded);

    if (user.status === "blocked" || user.status === "suspended") {
      return res.status(403).json({
        success: false,
        error: "Your account is currently suspended. Please contact support."
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "Invalid, expired, or revoked authentication token.",
      detail: err.message
    });
  }
}

/**
 * optionalAuth middleware: attaches req.user if token is valid, otherwise proceeds as guest
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = await resolveMySqlUser(decoded);
  } catch (_) {
    req.user = null;
  }
  next();
}

/**
 * requireRole middleware: enforces role authorization
 * @param  {...string} allowedRoles 
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required."
      });
    }

    const userRole = req.user.role || "customer";

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Insufficient permissions for this resource."
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireRole,
  invalidateUserCache,
  resolveMySqlUser
};
