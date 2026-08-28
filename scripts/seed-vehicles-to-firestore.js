// scripts/seed-vehicles-to-firestore.js
//
// Phase 4 — makes Firestore the authoritative fleet record instead of
// js/vehicles.js, per Master Plan Section 6 ("Do not keep production
// inventory primarily in JavaScript files").
//
// WHY THIS IS SAFE TO RUN AGAINST THE LIVE PROJECT:
//   fleet.js / admin.js / booking.js already merge each catalog vehicle
//   with `overrides.get(vehicle.regNo)` and let the Firestore doc win on
//   every shared key. This script's job is just to make that Firestore
//   doc *complete* instead of partial — it does not require any frontend
//   change to take effect, and it never touches a field an admin has
//   already set through the dashboard:
//
//     - If a vehicles/{regNo} doc does not exist yet: write the full
//       catalog record for that vehicle.
//     - If it already exists: fill in ONLY fields that are still missing
//       on that doc. Anything already set (available, status, imageUrl,
//       removed, price overrides, etc.) is left exactly as-is.
//
//   Nothing is deleted. Nothing already in Firestore is overwritten.
//   Re-running this script is always safe (idempotent).
//
// USAGE:
//   node scripts/seed-vehicles-to-firestore.js            # dry run (default)
//   node scripts/seed-vehicles-to-firestore.js --apply     # actually writes
//
// Requires the same Admin SDK credential as server/firebaseAdmin.js:
// FIREBASE_SERVICE_ACCOUNT_BASE64 env var, or server/serviceAccountKey.json.
//
// Recommended: run once with no flag to review the plan, run again with
// --apply against a staging project first if one exists, THEN run --apply
// against production.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APPLY = process.argv.includes("--apply");

// ------------------------------------------------------------
// LOAD THE STATIC CATALOG
// ------------------------------------------------------------
// js/vehicles.js is a plain browser script (`const fleetVehicles = [...]`)
// with no module.exports, so it's evaluated in an isolated VM sandbox
// rather than required() — this never executes anything from the file
// except the array literal assignment itself.

function loadCatalog() {
  const filePath = path.join(__dirname, "..", "js", "vehicles.js");
  const source = fs.readFileSync(filePath, "utf8");

  // js/vehicles.js ends with `window.fleetVehicles = fleetVehicles;` for
  // the browser — stub a minimal `window` so that line doesn't throw here.
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source + "\nthis.__catalog = fleetVehicles;", sandbox, {
    filename: "js/vehicles.js",
  });

  if (!Array.isArray(sandbox.__catalog)) {
    throw new Error(
      "Could not find `fleetVehicles` array in js/vehicles.js — did the file's shape change?"
    );
  }

  return sandbox.__catalog;
}

async function main() {
  const admin = require("../server/firebaseAdmin");
  const db = admin.firestore();

  const catalog = loadCatalog();
  console.log(`Loaded ${catalog.length} vehicles from js/vehicles.js`);

  const collection = db.collection("vehicles");
  let created = 0;
  let filled = 0;
  let untouched = 0;

  for (const vehicle of catalog) {
    const regNo = vehicle.regNo;
    if (!regNo) {
      console.warn("Skipping a catalog entry with no regNo:", vehicle);
      continue;
    }

    const ref = collection.doc(regNo);
    const snap = await ref.get();

    if (!snap.exists) {
      created += 1;
      console.log(`[create] ${regNo} — ${vehicle.brand} ${vehicle.model}`);
      if (APPLY) {
        await ref.set({
          ...vehicle,
          isCustomFleet: false,
          removed: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: "seed-script",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: "seed-script",
        });
      }
      continue;
    }

    // Doc already exists — only fill in keys that are missing entirely.
    // Never touches a key the admin dashboard already set.
    const existing = snap.data();
    const missing = {};
    for (const [key, value] of Object.entries(vehicle)) {
      if (!(key in existing)) missing[key] = value;
    }

    if (Object.keys(missing).length === 0) {
      untouched += 1;
      continue;
    }

    filled += 1;
    console.log(
      `[fill] ${regNo} — adding missing field(s): ${Object.keys(missing).join(", ")}`
    );
    if (APPLY) {
      await ref.set(
        { ...missing, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
  }

  console.log("");
  console.log(
    `${APPLY ? "Applied" : "Planned"}: ${created} created, ${filled} filled, ${untouched} already complete.`
  );
  if (!APPLY) {
    console.log("Dry run only — re-run with --apply to write these changes.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-vehicles-to-firestore] failed:", err);
  process.exit(1);
});
