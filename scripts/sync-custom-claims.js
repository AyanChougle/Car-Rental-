// scripts/sync-custom-claims.js
//
// Phase 2 — optional. Master Plan Section 3: "Use Firebase custom claims
// for privileged roles where appropriate."
//
// WHAT THIS CHANGES AND WHAT IT DOESN'T:
//   Today, every role check (firestore.rules, storage.rules,
//   server/middleware/auth.js) reads users/{uid}.role directly. That is
//   already secure — this script does not fix a vulnerability, it adds a
//   `role` custom claim to the user's Firebase Auth token as a mirror of
//   that same Firestore field, so that a FUTURE rule/middleware update can
//   check `request.auth.token.role` instead of doing a Firestore get() on
//   every request (cheaper, and works even if Firestore is briefly
//   unavailable).
//
//   Running this script today changes NOTHING about current behavior:
//   no existing rule or middleware reads request.auth.token.role yet, so
//   setting the claim is inert until that follow-up change is made and
//   reviewed on its own.
//
// IMPORTANT CAVEAT: a custom claim only takes effect on the user's NEXT
// token refresh (next login, or up to ~1hr for an already-open session).
// If this is ever wired into rules, that lag needs to be accounted for
// (e.g. force a client-side token refresh right after an admin changes a
// role from the dashboard).
//
// USAGE:
//   node scripts/sync-custom-claims.js              # sync every user once
//   node scripts/sync-custom-claims.js <uid>         # sync a single user
//
// Safe to re-run — it's idempotent and only ever sets `role` to whatever
// users/{uid}.role currently says (defaulting to "customer" if missing).

const admin = require("../server/firebaseAdmin");

const VALID_ROLES = ["customer", "admin", "manager", "executive", "partner"];

async function syncOne(uid) {
  const db = admin.firestore();
  const snap = await db.collection("users").doc(uid).get();

  if (!snap.exists) {
    console.warn(`[skip] ${uid} — no users/${uid} Firestore doc.`);
    return;
  }

  const role = VALID_ROLES.includes(snap.data().role)
    ? snap.data().role
    : "customer";

  const user = await admin.auth().getUser(uid);
  const currentClaimRole = user.customClaims?.role;

  if (currentClaimRole === role) {
    console.log(`[unchanged] ${uid} — role claim already "${role}"`);
    return;
  }

  await admin.auth().setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    role,
  });
  console.log(`[updated] ${uid} — role claim set to "${role}"`);
}

async function main() {
  const targetUid = process.argv[2];

  if (targetUid) {
    await syncOne(targetUid);
    process.exit(0);
  }

  console.log("No uid given — syncing every user in users/ collection.");
  const db = admin.firestore();
  const snapshot = await db.collection("users").get();
  console.log(`Found ${snapshot.size} user docs.`);

  for (const doc of snapshot.docs) {
    try {
      await syncOne(doc.id);
    } catch (err) {
      console.error(`[error] ${doc.id}:`, err.message);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[sync-custom-claims] failed:", err);
  process.exit(1);
});
