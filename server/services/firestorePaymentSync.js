// server/services/firestorePaymentSync.js
//
// Phase 3 — mirrors a SQLite `payments` row into Firestore
// payments/{paymentId} (Master Plan Section 12). SQLite stays
// authoritative for now: this is called best-effort, after the SQLite
// write already succeeded, and a failure here never fails the caller's
// request. firestore_synced_at on the SQLite row tracks what's mirrored
// so the backfill script (scripts/backfill-payments-to-firestore.js) is
// idempotent.

const admin = require("../firebaseAdmin");

async function syncPaymentToFirestore(paymentRow) {
  const firestore = admin.firestore();

  await firestore
    .collection("payments")
    .doc(paymentRow.payment_ref || String(paymentRow.id))
    .set(
      {
        sqliteId: paymentRow.id,
        bookingId: paymentRow.booking_id,
        userId: paymentRow.user_id,
        amount: paymentRow.amount,
        currency: paymentRow.currency,
        method: paymentRow.method,
        utr: paymentRow.utr,
        screenshotMediaId: paymentRow.screenshot_media_id,
        status: paymentRow.status,
        submittedAt: paymentRow.submitted_at,
        verifiedAt: paymentRow.verified_at,
        verifiedBy: paymentRow.verified_by,
        rejectionReason: paymentRow.rejection_reason,
        mirroredFrom: "sqlite-payments-dual-write",
        mirroredAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

module.exports = { syncPaymentToFirestore };
