// server/routes/media.js
"use strict";

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { fileTypeFromFile } = require("file-type");
const db = require("../config/database");
const { requireAuth, requireRole, optionalAuth } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_ROOT = process.env.MEDIA_UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const TEMP_UPLOAD_ROOT = path.join(UPLOAD_ROOT, "_tmp");

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
fs.mkdirSync(TEMP_UPLOAD_ROOT, { recursive: true });

console.log(`[media] Hostinger Media Storage Root: ${UPLOAD_ROOT}`);

const ALLOWED_MIME = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["application/pdf", "pdf"],
  ["video/mp4", "mp4"],
  ["video/quicktime", "mov"],
  ["video/webm", "webm"]
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_UPLOAD_ROOT);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const rand = crypto.randomBytes(12).toString("hex");
    cb(null, `tmp-${rand}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES }
});

function sanitize(val, fallback = "default") {
  return String(val || "").trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || fallback;
}

/**
 * POST /api/media/upload
 * Multi-category file upload storing to Hostinger filesystem & MySQL media table
 */
router.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded." });
  }

  const tempPath = req.file.path;
  const category = String(req.body.category || "personal_media").toLowerCase();
  const relatedId = sanitize(req.body.relatedId || req.body.bookingId || req.body.verificationId || req.user.firebaseUid);
  const docType = req.body.docType || null;
  const docSide = req.body.docSide || null;

  try {
    // 1. Verify file MIME type
    const detected = await fileTypeFromFile(tempPath).catch(() => null);
    const mime = detected?.mime || req.file.mimetype;

    if (!ALLOWED_MIME.has(mime) && !mime.startsWith("image/") && mime !== "application/pdf") {
      try { fs.unlinkSync(tempPath); } catch (_) {}
      return res.status(400).json({ success: false, error: `Unsupported file format (${mime}).` });
    }

    const ext = ALLOWED_MIME.get(mime) || (detected?.ext || "bin");

    // 2. Determine target subdirectory on Hostinger server
    let subDir = "personal";
    if (category.startsWith("license_") || category.startsWith("aadhar_") || category.startsWith("pan_") || category === "verification") {
      subDir = path.join("verification", relatedId);
    } else if (category === "payment_screenshot" || category.startsWith("inspection_") || category.startsWith("booking_")) {
      subDir = path.join("bookings", relatedId);
    } else if (category.startsWith("vehicle_") || category === "partner_car_photo") {
      subDir = path.join("vehicles", relatedId);
    } else {
      subDir = path.join("users", req.user.firebaseUid);
    }

    const targetDir = path.join(UPLOAD_ROOT, subDir);
    fs.mkdirSync(targetDir, { recursive: true });

    const safeStoredName = `${category}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
    const finalFilePath = path.join(targetDir, safeStoredName);
    const relativeStoragePath = path.join(subDir, safeStoredName).replace(/\\/g, "/");

    // 3. Move from temp to final destination
    fs.renameSync(tempPath, finalFilePath);

    // 4. Look up MySQL user id
    const [uRows] = await db.query("SELECT id FROM users WHERE firebase_uid = ? LIMIT 1", [req.user.firebaseUid]);
    const userId = uRows?.[0]?.id || null;

    // 5. Insert record into MySQL media table
    const [mediaResult] = await db.query(
      `INSERT INTO media (
        user_id, firebase_uid, booking_id, verification_id, category,
        doc_type, doc_side, original_name, stored_name, storage_path,
        mime_type, size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        req.user.firebaseUid,
        category.includes("booking") || category === "payment_screenshot" ? relatedId : null,
        category.includes("verification") || category.endsWith("_doc") ? relatedId : null,
        category,
        docType,
        docSide,
        req.file.originalname.slice(0, 250),
        safeStoredName,
        relativeStoragePath,
        mime,
        req.file.size
      ]
    );

    const mediaId = mediaResult.insertId;
    const mediaUrl = `/api/media/file/${mediaId}`;

    // 6. Update user metadata if this is a KYC document
    if (docType && docSide) {
      const fieldName = `${docType}${docSide.charAt(0).toUpperCase() + docSide.slice(1)}URL`;
      const [userMeta] = await db.query("SELECT metadata FROM users WHERE firebase_uid = ? LIMIT 1", [req.user.firebaseUid]);
      let meta = {};
      try {
        meta = typeof userMeta?.[0]?.metadata === "string" ? JSON.parse(userMeta[0].metadata) : (userMeta?.[0]?.metadata || {});
      } catch (_) {}
      meta[fieldName] = mediaUrl;
      meta[`${docType}Status`] = "pending";

      await db.query(
        `UPDATE users SET metadata = ?, ${docType}_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?`,
        [JSON.stringify(meta), req.user.firebaseUid]
      );
    }

    res.status(201).json({
      success: true,
      message: "File uploaded successfully.",
      mediaId,
      mediaIdStr: `media_${Date.now()}`,
      url: mediaUrl,
      mediaUrl,
      downloadUrl: mediaUrl,
      fileName: safeStoredName,
      originalName: req.file.originalname,
      mimeType: mime,
      sizeBytes: req.file.size
    });
  } catch (err) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    console.error("[POST /api/media/upload error]", err);
    res.status(500).json({ success: false, error: "Failed to upload file." });
  }
});

/**
 * GET /api/media/file/:mediaId
 * Stream authenticated media file safely
 */
router.get("/file/:mediaId", optionalAuth, async (req, res) => {
  const mediaId = req.params.mediaId;

  try {
    const isNum = /^\d+$/.test(mediaId);
    const sql = isNum
      ? "SELECT * FROM media WHERE id = ? LIMIT 1"
      : "SELECT * FROM media WHERE stored_name = ? OR booking_id = ? LIMIT 1";

    const rows = await db.query(sql, [mediaId]);

    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Media file not found." });
    }

    const record = rows[0];
    const absPath = path.isAbsolute(record.storage_path)
      ? record.storage_path
      : path.join(UPLOAD_ROOT, record.storage_path);

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ success: false, error: "File not found on storage server." });
    }

    res.setHeader("Content-Type", record.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${record.original_name || record.stored_name}"`);
    res.setHeader("Cache-Control", "public, max-age=86400");

    const stream = fs.createReadStream(absPath);
    stream.pipe(res);
  } catch (err) {
    console.error("[GET /api/media/file/:mediaId error]", err);
    res.status(500).json({ success: false, error: "Failed to stream media file." });
  }
});

/**
 * GET /api/media/my-media
 * List files uploaded by current user
 */
router.get("/my-media", requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, category, doc_type, doc_side, original_name, stored_name,
              mime_type, size_bytes, created_at
       FROM media
       WHERE firebase_uid = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [req.user.firebaseUid]
    );

    const items = rows.map((r) => ({
      id: r.id,
      category: r.category,
      docType: r.doc_type,
      docSide: r.doc_side,
      originalName: r.original_name,
      storedName: r.stored_name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      url: `/api/media/file/${r.id}`,
      createdAt: r.created_at
    }));

    res.json({ success: true, count: items.length, media: items });
  } catch (err) {
    console.error("[GET /api/media/my-media error]", err);
    res.status(500).json({ success: false, error: "Failed to fetch user media." });
  }
});

/**
 * DELETE /api/media/:mediaId
 * Delete user's media file
 */
router.delete("/:mediaId", requireAuth, async (req, res) => {
  const mediaId = req.params.mediaId;

  try {
    const [rows] = await db.query(
      "SELECT * FROM media WHERE id = ? LIMIT 1",
      [mediaId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Media not found." });
    }

    const item = rows[0];
    const isStaff = ["admin", "manager"].includes(req.user.role);
    if (!isStaff && item.firebase_uid !== req.user.firebaseUid) {
      return res.status(403).json({ success: false, error: "Access denied." });
    }

    // Soft-delete or remove file
    const absPath = path.isAbsolute(item.storage_path) ? item.storage_path : path.join(UPLOAD_ROOT, item.storage_path);
    try { if (fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch (_) {}

    await db.query("DELETE FROM media WHERE id = ?", [mediaId]);

    // If it was a KYC document, reset user's document status
    if (item.doc_type) {
      const docType = item.doc_type;
      const [uMeta] = await db.query("SELECT metadata FROM users WHERE firebase_uid = ? LIMIT 1", [item.firebase_uid]);
      let meta = {};
      try {
        meta = typeof uMeta?.[0]?.metadata === "string" ? JSON.parse(uMeta[0].metadata) : (uMeta?.[0]?.metadata || {});
      } catch (_) {}

      delete meta[`${docType}URL`];
      delete meta[`${docType}FrontURL`];
      delete meta[`${docType}BackURL`];

      await db.query(
        `UPDATE users SET metadata = ?, ${docType}_status = 'not_submitted', updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?`,
        [JSON.stringify(meta), item.firebase_uid]
      );
    }

    res.json({ success: true, message: "Media file deleted successfully." });
  } catch (err) {
    console.error("[DELETE /api/media/:mediaId error]", err);
    res.status(500).json({ success: false, error: "Failed to delete media." });
  }
});

module.exports = router;
