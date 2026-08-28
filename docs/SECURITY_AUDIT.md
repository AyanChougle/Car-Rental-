# SECURITY_AUDIT.md — Phase 0

## Already correct (verified by reading the actual rules/code, not assumed)

- Privilege escalation via self-update is blocked in `firestore.rules`
  (`users/{uid}` update rule pins `role` to its existing value unless the
  writer is `isAdmin()`).
- `bookings/{bookingId}` owner-update rule field-restricts what a customer
  can touch; `status` can only move to `cancelled`, `paymentStatus` can only
  move to `pending_verification`, and `returnInspection`/`totalAmount`/
  `securityDeposit` are frozen on owner writes.
- Executive role is scoped to an explicit allow-list of operational fields
  (`diff().affectedKeys().hasOnly([...])`) — cannot touch payment or pricing
  fields even though executives can write to bookings at all.
- `partner_cars` owner cannot self-approve (`status` pinned) or edit their
  own photos array (staff-only).
- Storage rules for `licenses/`, `aadhar/`, `payment_screenshots/`,
  `host_car_photos/` all check ownership-or-staff via a Firestore lookup,
  not just `request.auth != null`.
- `server/middleware/auth.js` verifies the real Firebase ID token
  server-side (`admin.auth().verifyIdToken`) rather than trusting a client-
  supplied uid/role header.
- `server/routes/payments.js` re-derives the payable amount from the
  booking document server-side and validates screenshot ownership and
  category before accepting a submission — it does not trust a client-sent
  amount.
- CORS is allow-listed by explicit origin in production
  (`server/server.js` exits at boot if `ALLOWED_ORIGINS` is unset in prod).

## Gaps / risks found

1. **Storage rules are not wired into deploy** (`firebase.json` has no
   `storage` key). If nobody has run `firebase deploy --only storage` by
   hand with an explicit rules file argument, the rules currently live in
   the Firebase Console may not match `storage.rules` in this repo. This
   needs verification against the live project, not assumed from the repo
   alone.
2. **Payment/media privilege boundary lives in a hand-rolled Express
   server with a long-lived service-account key file on disk**
   (`server/serviceAccountKey.json` or an env var). This is a wider blast
   radius than Cloud Functions + Firestore rules: a compromise of that one
   host has full Admin SDK access. Not a bug, but a structural risk the
   Master Plan's target architecture (Section 34) is designed to reduce.
3. **No rate limit / duplicate check exists yet for Firestore-side
   payments** because payments aren't in Firestore yet — this only becomes
   a live gap once Phase 3 migrates them.
4. **Booking field lookups are defensive/multi-key**
   (`getBookingAmount`/`getBookingUserId` try several possible field names).
   That's a correctness smell, not a direct vulnerability, but it means the
   "authoritative amount" logic depends on whichever field happens to be
   populated — worth locking to one canonical field name before Phase 6's
   pricing engine work.
5. **No custom claims** means every privileged Firestore/Storage rule check
   does a `get()`/`exists()` read against `users/{uid}` on every request.
   Functionally secure, but it's a real read-cost and latency cost at scale,
   and Section 3 recommends claims "where appropriate."

## Not tested this pass

Actual live-fire security tests (Section 33: customer→admin escalation
attempts, cross-user data access, self-payment approval, coupon
manipulation) require running against the live or a staging Firebase
project with real auth tokens — that's Phase 12/13 work and needs to happen
against a non-production project before any Phase 3 cutover.
