// firebaseAdmin.js
//
// This does NOT create a second login system. The frontend already
// authenticates users via Firebase Auth (js/auth.js). This server just
// verifies the same ID token Firebase already issued, so "logged in on the
// website" and "allowed to upload/download here" stay the same fact.
//
// Credential loading, in priority order:
//   1. FIREBASE_SERVICE_ACCOUNT_BASE64 env var - the whole service-account
//      JSON, base64-encoded. Preferred: nothing sensitive touches disk as
//      plaintext, and it's how you'll set this in most host/secret-manager
//      setups later without changing a line of code.
//   2. server/serviceAccountKey.json - the file Firebase Console gives you.
//      Fine for local dev. Already .gitignore'd. Rotate immediately if this
//      file is ever copied, uploaded, emailed, or committed anywhere.

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

function loadCredential() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    try {
      const json = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(json);
    } catch (err) {
      console.error(
        "[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_BASE64 is set but isn't " +
        "valid base64-encoded JSON. Check for copy/paste truncation."
      );
      process.exit(1);
    }
  }

  const filePath = path.join(__dirname, "serviceAccountKey.json");
  if (fs.existsSync(filePath)) {
    return require(filePath);
  }

  console.error(
    "\n[firebaseAdmin] No Firebase credentials found. Provide one of:\n" +
    "  1. FIREBASE_SERVICE_ACCOUNT_BASE64 env var (recommended), or\n" +
    "  2. server/serviceAccountKey.json\n" +
    "Get a key from: Firebase Console -> Project Settings -> Service " +
    "Accounts -> Generate New Private Key.\n" +
    "Never commit this file or paste it anywhere outside your own machine.\n"
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(loadCredential()),
  // Same bucket js/firebase-init.js points the client SDK at. Needed for
  // the server-side dual-write to Firebase Storage (see
  // server/services/firebaseStorageSync.js) — without this,
  // admin.storage().bucket() throws "no default bucket".
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ||
    "carrentpeweb.firebasestorage.app",
});

module.exports = admin;
