// routes/media.js

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const { fileTypeFromFile } = require("file-type");

const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");

fs.mkdirSync(UPLOAD_ROOT, {
  recursive: true,
});

const ALLOWED_CATEGORIES = new Set([
  "profile_photo",
  "license_doc",
  "aadhar_doc",
  "partner_car_photo",
  "partner_car_video",
  "payment_screenshot",
  "inspection_photo",
  "personal_media",
]);

const ALLOWED_MIME = new Map([
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
  ["image/webp", ["webp"]],
  ["image/heic", ["heic"]],
  ["video/mp4", ["mp4"]],
  ["video/quicktime", ["mov"]],
  ["video/webm", ["webm"]],
]);

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const PAYMENT_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

// ------------------------------------------------------------
// STORAGE
// ------------------------------------------------------------

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(
      UPLOAD_ROOT,
      req.user.uid
    );

    fs.mkdirSync(dir, {
      recursive: true,
    });

    cb(null, dir);
  },

  filename(req, file, cb) {
    const randomName =
      crypto.randomBytes(16).toString("hex");

    const ext =
      path.extname(file.originalname).toLowerCase();

    cb(null, `${randomName}${ext}`);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_BYTES,
  },

  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        new Error(
          `Unsupported file type: ${file.mimetype}`
        )
      );
    }

    cb(null, true);
  },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error:
      "Too many uploads. Please slow down and try again shortly.",
  },
});

// ------------------------------------------------------------
// POST /api/media/upload
// ------------------------------------------------------------

router.post(
  "/upload",
  requireAuth,
  uploadLimiter,
  (req, res) => {
    upload.single("file")(
      req,
      res,
      async (err) => {
        if (err) {
          if (
            err.code === "LIMIT_FILE_SIZE"
          ) {
            return res.status(413).json({
              error:
                "File is too large. Maximum size is 50 MB.",
            });
          }

          return res.status(400).json({
            error: err.message,
          });
        }

        if (!req.file) {
          return res.status(400).json({
            error: "No file received.",
          });
        }

        const cleanup = () => {
          fs.unlink(req.file.path, () => {});
        };

        const category = req.body.category;

        if (!ALLOWED_CATEGORIES.has(category)) {
          cleanup();

          return res.status(400).json({
            error: "Invalid upload category.",
          });
        }

        // Payment screenshots have their own smaller limit.
        if (
          category === "payment_screenshot" &&
          req.file.size > PAYMENT_SCREENSHOT_MAX_BYTES
        ) {
          cleanup();

          return res.status(413).json({
            error:
              "Payment screenshot must be 5 MB or smaller.",
          });
        }

        // ----------------------------------------------------
        // MAGIC BYTE VALIDATION
        // ----------------------------------------------------

        let detected = null;

        try {
          detected = await fileTypeFromFile(
            req.file.path
          );
        } catch {
          detected = null;
        }

        const allowedExts =
          ALLOWED_MIME.get(req.file.mimetype) || [];

        const contentMatches =
          detected &&
          allowedExts.includes(detected.ext);

        if (!contentMatches) {
          cleanup();

          return res.status(400).json({
            error:
              "File content does not match its declared type.",
          });
        }

        // ----------------------------------------------------
        // DATABASE
        // ----------------------------------------------------

        const relatedId =
          typeof req.body.relatedId === "string" &&
          req.body.relatedId.trim()
            ? req.body.relatedId.trim().slice(0, 200)
            : null;

        try {
          const result = db
            .prepare(`
              INSERT INTO media (
                user_id,
                category,
                related_id,
                original_name,
                stored_name,
                mime_type,
                size_bytes
              )
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              req.user.uid,
              category,
              relatedId,
              req.file.originalname.slice(0, 255),
              req.file.filename,
              req.file.mimetype,
              req.file.size
            );

          const row = db
            .prepare(
              "SELECT * FROM media WHERE id = ?"
            )
            .get(result.lastInsertRowid);

          return res.status(201).json(
            toPublicMedia(row)
          );
        } catch (dbError) {
          cleanup();

          console.error(
            "[media upload]",
            dbError
          );

          return res.status(500).json({
            error:
              "Unable to save uploaded file.",
          });
        }
      }
    );
  }
);

// ------------------------------------------------------------
// GET /api/media
// ------------------------------------------------------------

router.get(
  "/",
  requireAuth,
  (req, res) => {
    const isStaff =
      req.user.role === "admin" ||
      req.user.role === "manager";

    const targetUser =
      isStaff && req.query.userId
        ? String(req.query.userId)
        : req.user.uid;

    let query = `
      SELECT *
      FROM media
      WHERE user_id = ?
      AND deleted_at IS NULL
    `;

    const params = [targetUser];

    if (req.query.category) {
      query += " AND category = ?";
      params.push(String(req.query.category));
    }

    if (req.query.relatedId) {
      query += " AND related_id = ?";
      params.push(String(req.query.relatedId));
    }

    query += " ORDER BY uploaded_at DESC";

    const rows = db
      .prepare(query)
      .all(...params);

    res.json(
      rows.map(toPublicMedia)
    );
  }
);

// ------------------------------------------------------------
// GET /api/media/file/:id
// ------------------------------------------------------------

router.get(
  "/file/:id",
  requireAuth,
  (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "Invalid media ID.",
      });
    }

    const row = db
      .prepare(`
        SELECT *
        FROM media
        WHERE id = ?
        AND deleted_at IS NULL
      `)
      .get(id);

    if (!row) {
      return res.status(404).json({
        error: "File not found.",
      });
    }

    const isOwner =
      row.user_id === req.user.uid;

    const isStaff =
      req.user.role === "admin" ||
      req.user.role === "manager";

    if (!isOwner && !isStaff) {
      return res.status(403).json({
        error: "You do not have permission to access this file.",
      });
    }

    const filePath = path.join(
      UPLOAD_ROOT,
      row.user_id,
      row.stored_name
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: "File missing on disk.",
      });
    }

    res.setHeader(
      "Content-Type",
      row.mime_type
    );

    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    const disposition =
      row.mime_type.startsWith("image/")
        ? "inline"
        : "attachment";

    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${sanitizeFilename(
        row.original_name
      )}"`
    );

    fs.createReadStream(filePath).pipe(res);
  }
);

// ------------------------------------------------------------
// DELETE /api/media/:id
// ------------------------------------------------------------

router.delete(
  "/:id",
  requireAuth,
  (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "Invalid media ID.",
      });
    }

    const row = db
      .prepare(`
        SELECT *
        FROM media
        WHERE id = ?
        AND deleted_at IS NULL
      `)
      .get(id);

    if (!row) {
      return res.status(404).json({
        error: "File not found.",
      });
    }

    const isOwner =
      row.user_id === req.user.uid;

    const isStaff =
      req.user.role === "admin" ||
      req.user.role === "manager";

    if (!isOwner && !isStaff) {
      return res.status(403).json({
        error: "You do not have permission to delete this file.",
      });
    }

    db.prepare(`
      UPDATE media
      SET deleted_at = datetime('now')
      WHERE id = ?
    `).run(row.id);

    const filePath = path.join(
      UPLOAD_ROOT,
      row.user_id,
      row.stored_name
    );

    fs.unlink(filePath, () => {});

    res.json({
      success: true,
    });
  }
);

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function sanitizeFilename(filename) {
  return String(filename)
    .replace(/[\r\n"]/g, "")
    .replace(/[^\w.\- ]/g, "_")
    .slice(0, 120);
}

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
    url: `/api/media/file/${row.id}`,
  };
}

module.exports = router;