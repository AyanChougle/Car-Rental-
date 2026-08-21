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

const UPLOAD_ROOT =
  process.env.MEDIA_UPLOAD_DIR ||
  path.join(__dirname, "..", "uploads");

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

console.log(`[media] Upload directory: ${UPLOAD_ROOT}`);

fs.mkdirSync(UPLOAD_ROOT, {
  recursive: true,
});

const ALLOWED_CATEGORIES = new Set([
  "profile_photo",
  "license_doc",
  "aadhar_doc",
  "pan_doc",
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

function safeSegment(value, fallback = "unknown") {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned || fallback;
}

function firstValue(req, keys) {
  for (const key of keys) {
    const value = req.body?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
    const queryValue = req.query?.[key];
    if (queryValue !== undefined && queryValue !== null && String(queryValue).trim()) {
      return String(queryValue).trim();
    }
  }
  return "";
}

function normalizeDocumentType(category, raw) {
  const value = String(raw || "").trim().toLowerCase();
  const aliases = {
    license: "license",
    "driving-license": "license",
    driving_license: "license",
    dl: "license",
    license_doc: "license",
    aadhaar: "aadhaar",
    aadhar: "aadhaar",
    aadhaar_doc: "aadhaar",
    aadhar_doc: "aadhaar",
    pan: "pan",
    pan_doc: "pan",
  };

  if (aliases[value]) return aliases[value];

  const c = String(category || "").trim().toLowerCase();
  if (c === "license_doc") return "license";
  if (c === "aadhar_doc" || c === "aadhaar_doc") return "aadhaar";
  if (c === "pan_doc") return "pan";

  return value ? safeSegment(value) : "";
}

function normalizeSide(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (["front", "back"].includes(value)) return value;
  return "";
}

/*
 * Deterministic local storage:
 *
 * bookingId + document => uploads/bookings/{bookingId}/{document}/{side}
 * verificationId + document => uploads/verification/{verificationId}/{document}/{side}
 * fleetId + imageType => uploads/fleets/{fleetId}/{imageType}
 *
 * The backend accepts aliases such as bookingID, verificationID and fleetID.
 * If both bookingId and verificationId are supplied, verificationId wins for
 * verification documents only; otherwise bookingId wins for booking documents.
 */
function getStorageContext(req) {
  const category = firstValue(req, ["category"]);
  const bookingId = firstValue(req, ["bookingId", "bookingID"]);
  const verificationId = firstValue(req, ["verificationId", "verificationID"]);
  const fleetId = firstValue(req, ["fleetId", "fleetID"]);
  const documentType = normalizeDocumentType(
    category,
    firstValue(req, ["documentType", "document", "docType", "type"])
  );
  const side = normalizeSide(
    firstValue(req, ["side", "documentSide", "document_side"])
  );
  const imageType = firstValue(req, ["imageType", "image_type", "photoType"]);

  const categoryLower = String(category).toLowerCase();

  const isIdentityDocument =
    ["license_doc", "aadhar_doc", "aadhaar_doc", "pan_doc"].includes(categoryLower) ||
    ["license", "aadhaar", "aadhar", "pan"].includes(documentType);

  let storageType = firstValue(req, ["storageType", "storage"]).toLowerCase();

  if (!storageType) {
    if (fleetId || categoryLower.startsWith("partner_car_")) {
      storageType = "fleet";
    } else if (verificationId && isIdentityDocument) {
      storageType = "verification";
    } else if (bookingId) {
      storageType = "booking";
    } else if (verificationId) {
      storageType = "verification";
    } else {
      storageType = "user";
    }
  }

  let root;
  let relativeDir;

  if (storageType === "booking") {
    if (!bookingId) {
      throw new Error("bookingId is required for booking uploads.");
    }

    root = path.join(
      UPLOAD_ROOT,
      "bookings",
      safeSegment(bookingId),
      documentType || "documents",
      side || "files"
    );

    relativeDir = path.relative(UPLOAD_ROOT, root);
  } else if (storageType === "verification") {
    if (!verificationId) {
      throw new Error("verificationId is required for verification uploads.");
    }

    root = path.join(
      UPLOAD_ROOT,
      "verification",
      safeSegment(verificationId),
      documentType || "documents",
      side || "files"
    );

    relativeDir = path.relative(UPLOAD_ROOT, root);
  } else if (storageType === "fleet") {
    if (!fleetId) {
      throw new Error("fleetId is required for fleet uploads.");
    }

    root = path.join(
      UPLOAD_ROOT,
      "fleets",
      safeSegment(fleetId),
      safeSegment(imageType || "gallery")
    );

    relativeDir = path.relative(UPLOAD_ROOT, root);
  } else {
    root = path.join(UPLOAD_ROOT, safeSegment(req.user.uid));
    relativeDir = path.relative(UPLOAD_ROOT, root);
  }

  fs.mkdirSync(root, { recursive: true });

  return {
    storageType,
    root,
    relativeDir: relativeDir.split(path.sep).join("/"),
    bookingId: bookingId ? safeSegment(bookingId) : null,
    verificationId: verificationId ? safeSegment(verificationId) : null,
    fleetId: fleetId ? safeSegment(fleetId) : null,
    documentType: documentType || null,
    side: side || null,
  };
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const context = getStorageContext(req);
      req.mediaStorageContext = context;
      cb(null, context.root);
    } catch (error) {
      cb(error);
    }
  },

  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const side = String(
      req.body.side || req.body.documentSide || ""
    ).trim().toLowerCase();

    let logicalName = null;
    if (
      ["license_doc", "aadhar_doc"].includes(req.body.category) &&
      (side === "front" || side === "back")
    ) logicalName = side;
    else if (req.body.category === "pan_doc")
      logicalName = "pan";
    else if (req.body.imageType)
      logicalName = safeSegment(req.body.imageType);

    if (logicalName)
      return cb(
        null,
        `${logicalName}-${crypto.randomBytes(5).toString("hex")}${ext}`
      );

    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
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
              path
                .relative(UPLOAD_ROOT, req.file.path)
                .split(path.sep)
                .join("/"),
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
    const isAdmin = req.user.role === "admin";
    const isExecutive = req.user.role === "executive";
    const isStaff = isAdmin || isExecutive;

    if (
      isExecutive &&
      req.query.userId &&
      String(req.query.userId) !== req.user.uid &&
      req.query.category !== "inspection_photo"
    ) {
      return res.status(403).json({
        error: "Executives may only access operational inspection photos.",
      });
    }

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

    const isAdmin = req.user.role === "admin";
    const isExecutiveInspection =
      req.user.role === "executive" &&
      row.category === "inspection_photo";

    if (!isOwner && !isAdmin && !isExecutiveInspection) {
      return res.status(403).json({
        error: "You do not have permission to access this file.",
      });
    }

    const filePath = resolveStoredFilePath(row);

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

    const isAdmin = req.user.role === "admin";
    const isExecutiveInspection =
      req.user.role === "executive" &&
      row.category === "inspection_photo";

    if (!isOwner && !isAdmin && !isExecutiveInspection) {
      return res.status(403).json({
        error: "You do not have permission to delete this file.",
      });
    }

    db.prepare(`
      UPDATE media
      SET deleted_at = datetime('now')
      WHERE id = ?
    `).run(row.id);

    const filePath = resolveStoredFilePath(row);

    fs.unlink(filePath, () => {});

    res.json({
      success: true,
    });
  }
);

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------


function resolveStoredFilePath(row) {
  const stored = String(row.stored_name || "");
  const root = path.resolve(UPLOAD_ROOT);

  if (stored.includes("/") || stored.includes("\\")) {
    const candidate = path.resolve(UPLOAD_ROOT, stored);
    if (
      candidate !== root &&
      candidate.startsWith(root + path.sep)
    ) return candidate;
  }

  // Legacy format: uploads/{userId}/{filename}
  return path.join(UPLOAD_ROOT, row.user_id, stored);
}

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
    storagePath: row.stored_name,
  };
}

module.exports = router;
