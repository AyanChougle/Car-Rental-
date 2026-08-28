# ARCHITECTURE_AUDIT.md — Phase 0

Audited against the actual repository (`kruizly-css-fixes-updated.zip`), not a template.

## Current shape

```
Frontend (static HTML/CSS/JS, no bundler)
  ├─ js/firebase-init.js  → Firebase Auth, Firestore, Storage (client SDK, project: carrentpeweb)
  └─ pages: index, fleet, vehicle, booking, payment, profile, verification,
     admin, manager, executive, partner, refund, bookings

Backend (server/, Node + Express, run separately on a VM/host)
  ├─ server/firebaseAdmin.js  → Firebase Admin SDK (service-account auth)
  ├─ server/middleware/auth.js → verifies Firebase ID tokens, reads role from
  │    Firestore users/{uid}.role, 60s in-memory cache
  ├─ server/db/index.js  → better-sqlite3, LOCAL FILE (server/db/media.sqlite)
  ├─ server/routes/media.js    → multer upload to LOCAL DISK (server/uploads/),
  │    metadata row in SQLite `media` table
  ├─ server/routes/payments.js → UPI/UTR payment records in SQLite `payments`
  │    table, booking status mirrored into Firestore
  ├─ server/routes/invoice.js  → invoice generation (puppeteer → PDF)
  └─ server/routes/adminExport.js → xlsx export of Firestore collections
```

## Firebase-first compliance — what's already correct

- Firebase Auth is the only login system; server never issues its own sessions
  (`server/middleware/auth.js` verifies the same ID token the client got from
  Firebase Auth).
- Role model is `users/{uid}.role` in Firestore, not a client-writable field —
  `firestore.rules` explicitly blocks a user from changing their own `role`,
  `licenseStatus`, `aadharStatus`, or `panStatus` on self-update. This closes a
  documented prior vulnerability (self-granted "admin" role).
- `bookings/{bookingId}` write rules already block a customer from setting
  their own `paymentStatus` to `paid`, flipping `status` to `confirmed`, or
  editing `returnInspection` / `totalAmount` / `securityDeposit` — matches
  Section 8/10's "no arbitrary client-side status transitions" requirement.
- `storage.rules` already gates license/Aadhaar files and payment screenshots
  by ownership-or-staff, not just "signed in" (also a documented fix for a
  prior over-broad rule).
- Fleet uses a hybrid: a static catalog (`js/vehicles.js`) merged at read time
  with an admin-writable Firestore `vehicles/{regNo}` override document.
  Admins can already add fully custom vehicles that live entirely in
  Firestore (`isCustomFleet: true`).

## Real gaps against the Master Plan

1. **Payments + media are SQLite + local disk, not Firestore + Storage**
   (`server/db/media.sqlite`, `server/uploads/`). This is the single biggest
   deviation from Section 5 / Section 12 / Section 28. The *business logic*
   in `routes/payments.js` is already solid (duplicate-UTR rejection,
   ownership checks, amount validated against the booking, admin-only
   verify/reject, ledger-style status column) — the gap is the storage
   substrate, not the rules.
2. **Fleet inventory is primarily a JS array**, contrary to Section 6. In
   practice every field can be overridden per `regNo` in Firestore, but until
   a vehicle has a Firestore doc, its authoritative data is
   `js/vehicles.js`.
3. **`firebase.json` never declares Storage rules for deploy** — it only has
   a `firestore` key. `storage.rules` exists and reads correctly, but
   `firebase deploy` as currently configured would not push it. This is a
   real foundation-level bug, not a style issue.
4. **No Cloud Functions.** Privileged operations (payment verification,
   invoice PDF generation, exports) run on a standalone Express server with
   its own service-account key file, not Cloud Functions. Functionally
   equivalent (same Admin SDK, same privilege boundary) but is a hosting/ops
   difference from the target architecture and a manual-deploy dependency.
5. **No `vehicleMaintenance`, `transactions`, `refunds`, `damageCharges`,
   `couponUsages`, or `auditLogs` collections yet** — Sections 7, 11, 14, 15,
   17, 25 are not started.
6. **No custom claims.** Role checks re-read the `users/{uid}` document on
   every request (client-side rules) or every uncached request
   (server-side). Works, but Section 3's "custom claims where appropriate"
   is unused.

## Not audited this pass (out of Phase 0–4 scope)

Coupons, pricing engine, invoice editing rules, refunds/ledger, damage
charges, notifications, audit logs, partner earnings — these are Phase 6–11
in the Master Plan and are intentionally deferred.
