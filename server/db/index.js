// db/index.js
//
// SQLite is the right call here, not MySQL/Postgres: this is a single-process
// local media backend, there's no multi-server write contention to worry
// about, and "SQL database on disk, no separate service to install" is
// literally what the feature asked for. better-sqlite3 is synchronous, which
// is fine (even preferable) for a small local file DB — no connection pool,
// no async overhead for tiny reads/writes.

const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "media.sqlite");
const db = new Database(DB_PATH);

// WAL mode = better concurrent read/write behavior for a file-based DB.
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS media (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT    NOT NULL,           -- Firebase UID that owns this file
    category      TEXT    NOT NULL,           -- 'profile_photo' | 'license_doc' | 'aadhar_doc' |
                                               -- 'partner_car_photo' | 'partner_car_video' |
                                               -- 'payment_screenshot' | 'inspection_photo'
    related_id    TEXT,                       -- optional: bookingId / carId this file belongs to
    original_name TEXT    NOT NULL,
    stored_name   TEXT    NOT NULL UNIQUE,    -- randomized filename actually saved to disk
    mime_type     TEXT    NOT NULL,
    size_bytes    INTEGER NOT NULL,
    uploaded_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    deleted_at    TEXT                        -- soft delete; keep row, hide from queries
  );

  CREATE INDEX IF NOT EXISTS idx_media_user      ON media(user_id);
  CREATE INDEX IF NOT EXISTS idx_media_category  ON media(category);
  CREATE INDEX IF NOT EXISTS idx_media_related   ON media(related_id);
`);

module.exports = db;
