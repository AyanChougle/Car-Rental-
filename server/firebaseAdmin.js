// firebaseAdmin.js

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

function loadCredential() {
  // 1. Environment variable
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (b64) {
    try {
      const json = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(json);
    } catch (err) {
      console.error(
        "[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_BASE64 is invalid."
      );
      process.exit(1);
    }
  }

  // 2. Local service account
  const filePath = path.join(__dirname, "serviceAccountKey.json");

  if (fs.existsSync(filePath)) {
    try {
      return require(filePath);
    } catch (err) {
      console.error(
        "[firebaseAdmin] Failed to load serviceAccountKey.json:",
        err.message
      );
      process.exit(1);
    }
  }

  console.error(
    "\n[firebaseAdmin] No Firebase credentials found.\n" +
    "Provide FIREBASE_SERVICE_ACCOUNT_BASE64 or serviceAccountKey.json.\n"
  );

  process.exit(1);
}

const serviceAccount = loadCredential();

if (!serviceAccount.project_id) {
  console.error(
    "[firebaseAdmin] Service account is missing project_id."
  );
  process.exit(1);
}

console.log(
  `[firebaseAdmin] Firebase project: ${serviceAccount.project_id}`
);

console.log(
  `[firebaseAdmin] Firebase Storage bucket: ${
    process.env.FIREBASE_STORAGE_BUCKET ||
    "carrentpeweb.firebasestorage.app"
  }`
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),

  projectId: serviceAccount.project_id,

  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ||
    "carrentpeweb.firebasestorage.app",
});

module.exports = admin;
