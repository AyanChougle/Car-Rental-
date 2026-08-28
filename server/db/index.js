// db/index.js

const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "media.sqlite");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS media (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        TEXT NOT NULL,
    category       TEXT NOT NULL,
    related_id     TEXT,
    original_name  TEXT NOT NULL,
    stored_name    TEXT NOT NULL UNIQUE,
    mime_type      TEXT NOT NULL,
    size_bytes     INTEGER NOT NULL,
    uploaded_at    TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at     TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_media_user
    ON media(user_id);

  CREATE INDEX IF NOT EXISTS idx_media_category
    ON media(category);

  CREATE INDEX IF NOT EXISTS idx_media_related
    ON media(related_id);

  CREATE TABLE IF NOT EXISTS payments (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,

    booking_id            TEXT NOT NULL,

    user_id               TEXT NOT NULL,

    amount                REAL NOT NULL,

    currency              TEXT NOT NULL DEFAULT 'INR',

    method                TEXT NOT NULL DEFAULT 'upi',

    utr                   TEXT NOT NULL,

    screenshot_media_id   INTEGER,

    status                TEXT NOT NULL DEFAULT 'pending_verification',

    submitted_at          TEXT NOT NULL DEFAULT (datetime('now')),

    verified_at           TEXT,

    verified_by           TEXT,

    rejection_reason      TEXT,

    FOREIGN KEY (screenshot_media_id)
      REFERENCES media(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_utr_unique
    ON payments(utr);

  CREATE INDEX IF NOT EXISTS idx_payments_booking
    ON payments(booking_id);

  CREATE INDEX IF NOT EXISTS idx_payments_user
    ON payments(user_id);

  CREATE INDEX IF NOT EXISTS idx_payments_status
    ON payments(status);
`);

module.exports = db;

// ------------------------------------------------------------
// PHASE 3 — ADDITIVE COLUMNS FOR THE FIRESTORE/STORAGE DUAL-WRITE
// ------------------------------------------------------------
// These are nullable and purely informational: SQLite + local disk remain
// authoritative. They just record whether/where a row has also been
// mirrored to Firebase Storage / Firestore, so the backfill scripts
// (scripts/backfill-*.js) are idempotent and the eventual read-cutover
// can tell which rows are ready.
//
// Checked via pragma first rather than a bare ALTER TABLE, since
// "ADD COLUMN IF NOT EXISTS" support varies by SQLite build version and
// this needs to be safe to run against whatever version is already
// deployed.

function ensureColumn(table, column, definition) {
  const existing = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => row.name);

  if (!existing.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("media", "storage_path", "TEXT");
ensureColumn("media", "storage_url", "TEXT");
ensureColumn("media", "storage_synced_at", "TEXT");
ensureColumn("media", "username", "TEXT");
ensureColumn("media", "doc_type", "TEXT");
ensureColumn("media", "doc_side", "TEXT");
ensureColumn("payments", "firestore_synced_at", "TEXT");
ensureColumn("payments", "payment_ref", "TEXT");