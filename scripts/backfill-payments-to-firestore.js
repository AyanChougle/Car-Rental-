// scripts/backfill-payments-to-firestore.js
//
// Phase 3 — one-time backfill of payments that existed in SQLite BEFORE
// the dual-write in server/routes/payments.js started running. New
// payments are mirrored automatically at submit/verify/reject time; this
// script only needs to run once to catch up on history.
//
// Safe to re-run: skips any row that already has firestore_synced_at set.
//
// USAGE:
//   node scripts/backfill-payments-to-firestore.js          # dry run
//   node scripts/backfill-payments-to-firestore.js --apply   # write

const APPLY = process.argv.includes("--apply");

async function main() {
  const db = require("../server/db");
  const { syncPaymentToFirestore } = require("../server/services/firestorePaymentSync");

  const rows = db
    .prepare(
      `SELECT * FROM payments WHERE firestore_synced_at IS NULL ORDER BY id ASC`
    )
    .all();

  console.log(`Found ${rows.length} payment row(s) not yet mirrored to Firestore.`);

  let done = 0;
  let failed = 0;

  for (const row of rows) {
    const label = `payment #${row.id} (booking ${row.booking_id}, ${row.status})`;
    if (!APPLY) {
      console.log(`[would sync] ${label}`);
      continue;
    }

    try {
      await syncPaymentToFirestore(row);
      db.prepare(
        `UPDATE payments SET firestore_synced_at = datetime('now') WHERE id = ?`
      ).run(row.id);
      console.log(`[synced] ${label}`);
      done += 1;
    } catch (err) {
      console.error(`[failed] ${label}:`, err.message);
      failed += 1;
    }
  }

  console.log("");
  if (!APPLY) {
    console.log(`Dry run only — ${rows.length} row(s) would be synced. Re-run with --apply to write.`);
  } else {
    console.log(`Done: ${done} synced, ${failed} failed.`);
    if (failed > 0) {
      console.log("Re-running this script is safe — failed rows will be retried.");
    }
  }

  process.exit(failed > 0 && APPLY ? 1 : 0);
}

main().catch((err) => {
  console.error("[backfill-payments-to-firestore] fatal:", err);
  process.exit(1);
});
