// firebaseAdmin.js
//
// This does NOT create a second login system. The frontend already
// authenticates users via Firebase Auth (js/auth.js). This server just
// verifies the same ID token Firebase already issued, so "logged in on the
// website" and "allowed to upload/download here" stay the same fact.

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "serviceAccountKey.json");

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(
    "\n[firebaseAdmin] Missing server/serviceAccountKey.json.\n" +
    "Get one from: Firebase Console -> Project Settings -> Service Accounts " +
    "-> Generate New Private Key. Save the downloaded file as exactly:\n" +
    "  server/serviceAccountKey.json\n" +
    "This file is already in .gitignore — never commit it.\n"
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
});

module.exports = admin;
