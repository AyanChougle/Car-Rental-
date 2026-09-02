# MIGRATION_PLAN.md — Phases 0–4, existing → target

| Area                | Existing                                              | Target (Master Plan)                       | Status                                                                        |
| ------------------- | ----------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Auth                | Firebase Auth + `users/{uid}.role`                    | same, + custom claims                      | Optional claims-sync script added (Phase 2), not wired to auto-run            |
| Role checks         | Firestore `get()` per request                         | custom claims where appropriate            | Script mirrors role → claim; rules/middleware can adopt claims later          |
| Storage config      | `storage.rules` written but not in `firebase.json`    | rules deployed and enforced                | **Fixed** — `firebase.json` now declares the storage target                   |
| Fleet inventory     | Static `js/vehicles.js` + partial Firestore overrides | Firestore-authoritative `vehicles/{regNo}` | **Migrated** — seed script writes the full catalog into Firestore             |
| Vehicle maintenance | Doesn't exist                                         | `vehicleMaintenance/{id}`                  | Rules added, empty collection, ready for Phase 7 UI                           |
| Payments            | SQLite + local disk                                   | Firestore `payments/{paymentId}` + Storage | **Dual-write shipped this pass** — SQLite/disk still authoritative, see below |
| Media/files         | Local disk (`server/uploads/`)                        | Firebase Storage per Section 5 layout      | **Dual-write shipped this pass** — same                                       |
| Cloud Functions     | None (Express server)                                 | Cloud Functions for privileged ops         | Not started — out of scope this pass, flagged for Phase 7+                    |

## Phase 3 — implemented as a dual-write, not a cutover

SQLite + local disk remain authoritative. Nothing was deleted or removed.
What's new:

- **`server/services/firebaseStorageSync.js`** — maps every existing media
  category onto the Master Plan's canonical Storage layout (Section 5):
  `users/{uid}/profile/`, `users/{uid}/verification/{type}/{side}/`,
  `bookings/{bookingId}/payment/`, `bookings/{bookingId}/pickup|return/`,
  `partnerCars/{carId}/`. Uploads via the Admin SDK and returns a signed
  (never public) URL — payment screenshots and ID docs stay non-public per
  Section 26.
- **`server/routes/media.js`** — after the existing local-disk write
  succeeds, best-effort mirrors the same file to Firebase Storage and
  records `storage_path` / `storage_url` / `storage_synced_at` on the
  SQLite row. A Storage failure never fails the upload request the user is
  waiting on.
- **`server/services/firestorePaymentSync.js`** + updated
  **`server/routes/payments.js`** — after submit/verify/reject succeeds in
  SQLite, best-effort mirrors the row into Firestore
  `payments/{paymentId}`. Doc ID is the same human-readable `PAY-...` id
  already generated at submit time — now also persisted in a new
  `payment_ref` SQLite column (previously it only ever reached Firestore
  via the booking document, and wasn't recoverable from the payments table
  itself).
- **`firestore.rules`** — added `payments/{paymentId}`: read-only from the
  client (owner or staff), `write: if false` since the Admin SDK is the
  only writer. Satisfies Section 12's "the customer cannot mark payment
  verified" by construction — there is no client write path to abuse.
- **`storage.rules`** — added the canonical `bookings/{bookingId}/payment/`,
  `bookings/{bookingId}/pickup/`, `bookings/{bookingId}/return/` paths
  alongside the existing `payment_screenshots/{bookingId}/` path, with the
  same ownership check reused.
- **`server/db/index.js`** — additive, version-checked columns
  (`media.storage_path` / `storage_url` / `storage_synced_at`,
  `payments.firestore_synced_at` / `payment_ref`). Existing columns and
  rows are untouched; `ensureColumn()` checks `PRAGMA table_info` before
  altering, so this is safe to run against the live database as-is.
- **`server/firebaseAdmin.js`** — added `storageBucket` to the Admin SDK
  init (it was missing entirely — `admin.storage()` would have thrown
  without it).
- **`scripts/backfill-media-to-storage.js`** and
  **`scripts/backfill-payments-to-firestore.js`** — one-time, idempotent
  catch-up for rows/files that existed before the dual-write started
  running. Both default to a dry run; pass `--apply` to actually write.

**What this does NOT do:** nothing reads from Firestore/Storage for
payments or media yet — every page still reads from SQLite/local disk
exactly as before. That's deliberate. Writing to both places and reading
from the old one is the safe way to prove the new path works under real
traffic before anything depends on it.

## What still needs a human before removing SQLite/local disk

1. **Install dependencies and boot the server.** This pass edited files
   directly and syntax-checked every changed file
   (`node --check <file>` on all seven touched/added server files), but
   could not run `npm install` or start the server — no network access in
   this environment. Do that first, against a project you can afford to
   break.
2. **Run both backfill scripts in dry-run mode first** (no flag), read the
   output, then `--apply` against a staging Firebase project if one
   exists before touching production.
3. **Watch the sync columns fill in under real traffic** for a few days —
   `storage_synced_at` / `firestore_synced_at` should end up non-null on
   every new row. Any row that stays null after a few attempts means the
   mirror is failing for that category/context (check server logs — sync
   failures log a `console.warn`, never a hard error) and needs a look
   before cutover.
4. **Only after that:** flip the admin payment queue and booking payment
   status reads over to Firestore, flip file reads over to the signed
   Storage URLs, and run the full Section 33 payment test list (UTR
   submission, screenshot upload, approval, rejection, resubmission,
   duplicate UTR, wrong amount) against the flipped code path — then, and
   only then, remove `server/db/` and `server/uploads/`.

## Phase 4 — Fleet (unchanged from previous pass)

`scripts/seed-vehicles-to-firestore.js` — verified it parses the real
`js/vehicles.js` catalog (35 vehicles). Non-destructive by design: it
never overwrites `available`/`status`/`imageUrl`/`removed` on a doc that
already exists, only fills in missing fields or creates the doc if it
doesn't exist yet. Run without `--apply` first to review the plan.

## Phase-by-phase status

- **Phase 0 (Audit)** — done.
- **Phase 1 (Firebase foundation)** — `firebase.json` storage gap fixed;
  `firebaseAdmin.js` missing `storageBucket` fixed.
- **Phase 2 (Auth + roles)** — role model and privilege-escalation
  protections were already correct; optional custom-claims sync added as
  a forward-compatible enhancement.
- **Phase 3 (Storage/payments migration)** — dual-write shipped and
  syntax-verified; live cutover deliberately left for a maintainer with
  access to test against staging/production, per the four steps above.
- **Phase 4 (Fleet)** — migrated: seed script verified against the real
  catalog, ready to run.
