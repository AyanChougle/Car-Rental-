// scripts/backfill-media-to-storage.js
//
// Phase 3 — one-time backfill of files that were uploaded to local disk
// BEFORE the dual-write in server/routes/media.js started running. New
// uploads are mirrored to Firebase Storage automatically; this script
// only needs to run once to catch up on history.
//
// Safe to re-run: skips any row that already has storage_synced_at set,
// and skips (with a warning) any row whose local file is missing.
//
// USAGE:
//   node scripts/backfill-media-to-storage.js          # dry run
//   node scripts/backfill-media-to-storage.js --apply   # upload for real

const path = require("path");
const fs = require("fs");

const APPLY = process.argv.includes("--apply");

const UPLOAD_ROOT =
  process.env.MEDIA_UPLOAD_DIR || path.join(__dirname, "..", "server", "uploads");

async function main() {
  const db = require("../server/db");
  const { uploadLocalFileToStorage } = require("../server/services/firebaseStorageSync");

  const rows = db
    .prepare(
      `SELECT * FROM media WHERE storage_synced_at IS NULL AND deleted_at IS NULL ORDER BY id ASC`
    )
    .all();

  console.log(`Found ${rows.length} media row(s) not yet mirrored to Firebase Storage.`);

  let done = 0;
  let missing = 0;
  let failed = 0;

  for (const row of rows) {
    const localPath = path.join(UPLOAD_ROOT, row.stored_name);
    const label = `media #${row.id} (${row.category}, user ${row.user_id})`;

    if (!fs.existsSync(localPath)) {
      console.warn(`[missing local file] ${label} — expected at ${localPath}`);
      missing += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`[would upload] ${label} — ${localPath}`);
      continue;
    }

    try {
      // context is inferred loosely here since the original request-time
      // context (bookingId/documentType/side) isn't stored on the media
      // row itself for every category — related_id covers bookingId /
      // verificationId / fleetId for the categories where it was set.
      const context = {
        bookingId: row.related_id,
        fleetId: row.related_id,
        documentType: null,
        side: null,
      };

      const { storagePath, downloadURL } = await uploadLocalFileToStorage({
        localPath,
        category: row.category,
        context,
        uid: row.user_id,
        filename: path.basename(row.stored_name),
        contentType: row.mime_type,
      });

      db.prepare(
        `UPDATE media SET storage_path = ?, storage_url = ?, storage_synced_at = datetime('now') WHERE id = ?`
      ).run(storagePath, downloadURL, row.id);

      console.log(`[synced] ${label} -> ${storagePath}`);
      done += 1;
    } catch (err) {
      console.error(`[failed] ${label}:`, err.message);
      failed += 1;
    }
  }

  console.log("");
  if (!APPLY) {
    console.log(
      `Dry run only — ${rows.length - missing} row(s) would be uploaded, ${missing} missing local file(s). Re-run with --apply to write.`
    );
  } else {
    console.log(`Done: ${done} synced, ${missing} missing local file, ${failed} failed.`);
  }

  process.exit(failed > 0 && APPLY ? 1 : 0);
}

main().catch((err) => {
  console.error("[backfill-media-to-storage] fatal:", err);
  process.exit(1);
});
