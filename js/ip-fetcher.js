// Records the client's public IP against their user doc -- used for basic
// fraud/abuse visibility on rentals, nothing more. Best-effort: every
// caller of saveUserIpAddress() already wraps it in .catch(() => {}), so
// failures here never block login/signup/booking.
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { db } from "./firebase-init.js";

export async function fetchClientIp() {
  try {
    const response = await fetch("https://api.ipify.org?format=json");

    if (!response.ok) {
      throw new Error("Failed to fetch IP address");
    }

    const data = await response.json();
    return data.ip || null;
  } catch (error) {
    console.error("Error fetching client IP:", error);
    return null;
  }
}

export async function saveUserIpAddress(uid) {
  if (!uid) return;

  try {
    const ipAddress = await fetchClientIp();

    if (!ipAddress) {
      console.warn("IP address not available");
      return;
    }

    await setDoc(
      doc(db, "users", uid),
      {
        ipAddress: ipAddress,
        ipUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Error saving IP address:", error);
  }
}
