// routes/media.js
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// Categories mirror what the site already uploads (per README / js files):
// profile docs (license/aadhar), partner car photos/videos, payment
// verification screenshots, return-inspection photos. Keeping this list
// explicit (instead of accepting any string) stops the disk from filling up
// with junk from a typo'd or malicious category field.
const ALLOWED_CATEGORIES = new Set([
  "profile_photo",
  "license_doc",
  "aadhar_doc",
  "partner_car_photo",
  "partner_car_video",
  "payment_screenshot",
  "inspection_photo",
]);

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic",
  "video/mp4", "video/quicktime", "video/webm",
]);

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB — covers phone photos and short videos

const storage = multer.diskStorage({
  destination(req, file, cb) {
    // One folder per user keeps things sane to browse/back up and means a
    // filename collision between two users literally can't happen.
    const dir = path.join(UPLOAD_ROOT, req.user.uid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    // Never trust the original filename — a random name kills path
    // traversal tricks and duplicate-name overwrites in one move. Original
    // name is preserved separately in the DB row for display purposes.
    const randomName = crypto.randomBytes(16).toString("hex");
    cb(null, randomName + path.extname(file.originalname).toLowerCase());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

// POST /api/media/upload
// multipart/form-data: file=<the file>, category=<string>, relatedId=<optional string>
router.post("/upload", requireAuth, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file received." });

    const category = req.body.category;
    if (!ALLOWED_CATEGORIES.has(category)) {
      fs.unlink(req.file.path, () => {}); // clean up the orphaned file on disk
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${[...ALLOWED_CATEGORIES].join(", ")}`,
      });
    }

    const relatedId = req.body.relatedId || null;

    const result = db.prepare(`
      INSERT INTO media (user_id, category, related_id, original_name, stored_name, mime_type, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.uid, category, relatedId,
      req.file.originalname, req.file.filename,
      req.file.mimetype, req.file.size
    );

    const row = db.prepare("SELECT * FROM media WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(toPublicMedia(row));
  });
});

// GET /api/media?category=&relatedId=&userId=
// Regular users only ever see their own files. Staff (admin/manager) can
// pass userId to review someone else's uploads (e.g. a license doc pending
// verification) — same trust boundary Firestore rules already use elsewhere
// in this app.
router.get("/", requireAuth, (req, res) => {
  const isStaff = req.user.role === "admin" || req.user.role === "manager";
  const targetUser = isStaff && req.query.userId ? req.query.userId : req.user.uid;

  let query = "SELECT * FROM media WHERE user_id = ? AND deleted_at IS NULL";
  const params = [targetUser];

  if (req.query.category) {
    query += " AND category = ?";
    params.push(req.query.category);
  }
  if (req.query.relatedId) {
    query += " AND related_id = ?";
    params.push(req.query.relatedId);
  }
  query += " ORDER BY uploaded_at DESC";

  const rows = db.prepare(query).all(...params);
  res.json(rows.map(toPublicMedia));
});

// GET /api/media/file/:id — streams the actual file back, after an
// ownership/role check. Files are NOT served as static/public; this is the
// only path that returns bytes, and it's gated the same way the rest of the
// app gates access (owner, or staff).
router.get("/file/:id", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM media WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found." });

  const isOwner = row.user_id === req.user.uid;
  const isStaff = req.user.role === "admin" || req.user.role === "manager";
  if (!isOwner && !isStaff) return res.status(403).json({ error: "Not your file." });

  const filePath = path.join(UPLOAD_ROOT, row.user_id, row.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing on disk." });

  res.setHeader("Content-Type", row.mime_type);
  res.setHeader("Content-Disposition", `inline; filename="${row.original_name}"`);
  fs.createReadStream(filePath).pipe(res);
});

// DELETE /api/media/:id — owner or staff. Soft delete: row stays for audit
// trail, file is removed from disk to actually free space.
router.delete("/:id", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM media WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found." });

  const isOwner = row.user_id === req.user.uid;
  const isStaff = req.user.role === "admin" || req.user.role === "manager";
  if (!isOwner && !isStaff) return res.status(403).json({ error: "Not your file." });

  db.prepare("UPDATE media SET deleted_at = datetime('now') WHERE id = ?").run(row.id);
  const filePath = path.join(UPLOAD_ROOT, row.user_id, row.stored_name);
  fs.unlink(filePath, () => {}); // best-effort; row is already marked deleted either way

  res.json({ success: true });
});

function toPublicMedia(row) {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    relatedId: row.related_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    url: `/api/media/file/${row.id}`, // frontend fetches this with the auth header, not a public URL
  };
}

module.exports = router;
