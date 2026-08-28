// server/services/firebaseStorageSync.js
//
// Phase 3 — maps the existing local media categories onto the Master
// Plan's target Firebase Storage layout (Section 5) and uploads a local
// file to that path via the Admin SDK.
//
// This is called as a best-effort MIRROR after the existing local-disk
// write already succeeded (see server/routes/media.js). If it fails, the
// upload/payment request still succeeds — local disk stays authoritative
// until a maintainer runs the verification pass in docs/MIGRATION_PLAN.md
// and flips reads over.

const fs = require("fs");
const admin = require("../firebaseAdmin");

// Master Plan Section 5:
//   users/{uid}/profile/
//   users/{uid}/verification/
//   bookings/{bookingId}/payment/
//   bookings/{bookingId}/pickup/
//   bookings/{bookingId}/return/
//   vehicles/{vehicleId}/gallery/
//   vehicles/{vehicleId}/documents/
//   partnerCars/{carId}/
//   invoices/{invoiceId}/
function buildCanonicalStoragePath({ category, context, uid, filename }) {
  const safe = (s) => String(s || "").replace(/[^a-zA-Z0-9._-]/g, "_");

  switch (category) {
    case "profile_photo":
      return `users/${safe(uid)}/profile/${safe(filename)}`;

    case "license_doc":
    case "aadhar_doc":
    case "aadhaar_doc":
    case "pan_doc": {
      const docType =
        context.documentType ||
        (category === "license_doc"
          ? "license"
          : category === "pan_doc"
          ? "pan"
          : "aadhaar");
      const side = context.side || "front";
      return `users/${safe(uid)}/verification/${safe(docType)}/${safe(
        side
      )}/${safe(filename)}`;
    }

    case "payment_screenshot":
      if (!context.bookingId) {
        throw new Error(
          "payment_screenshot requires a bookingId for Storage sync."
        );
      }
      return `bookings/${safe(context.bookingId)}/payment/${safe(filename)}`;

    case "inspection_photo": {
      if (!context.bookingId) {
        throw new Error(
          "inspection_photo requires a bookingId for Storage sync."
        );
      }
      // pickup vs return isn't distinguished in the current media route —
      // documentType carries it through when the caller sets it, otherwise
      // this defaults to pickup/. Safe either way: it's an additive mirror,
      // not the record of truth.
      const stage =
        context.documentType === "return" ? "return" : "pickup";
      return `bookings/${safe(context.bookingId)}/${stage}/${safe(
        filename
      )}`;
    }

    case "partner_car_photo":
    case "partner_car_video":
      if (!context.fleetId) {
        throw new Error(
          "partner car media requires a fleetId for Storage sync."
        );
      }
      return `partnerCars/${safe(context.fleetId)}/${safe(filename)}`;

    default:
      // personal_media and anything else not named in the spec — keep it
      // out of the way rather than dropping it.
      return `users/${safe(uid)}/misc/${safe(filename)}`;
  }
}

async function uploadLocalFileToStorage({
  localPath,
  category,
  context,
  uid,
  filename,
  contentType,
}) {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found for Storage sync: ${localPath}`);
  }

  const storagePath = buildCanonicalStoragePath({
    category,
    context,
    uid,
    filename,
  });

  const bucket = admin.storage().bucket();
  await bucket.upload(localPath, {
    destination: storagePath,
    metadata: {
      contentType,
      metadata: {
        mirroredFrom: "sqlite-media-dual-write",
        originalCategory: category,
      },
    },
  });

  const file = bucket.file(storagePath);
  // Long-lived signed URL rather than making the object public — payment
  // screenshots and ID docs must never be public per Section 26.
  const [downloadURL] = await file.getSignedUrl({
    action: "read",
    expires: "01-01-2100",
  });

  return { storagePath, downloadURL };
}

module.exports = { buildCanonicalStoragePath, uploadLocalFileToStorage };
