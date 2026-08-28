/* ============================================================
   KRUIZLY - STANDALONE ID VERIFICATION
   Uses the same Firebase initialization as profile.js.
   ============================================================ */

import { auth, db, storage } from "./firebase-init.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

const $ = (id) => document.getElementById(id);

function setStatus(id, status) {
  const el = $(id);
  if (!el) return;

  const normalized = String(status || "not_submitted").toLowerCase();

  const labels = {
    not_submitted: "Not submitted",
    pending: "Pending review",
    verified: "Verified",
    rejected: "Rejected"
  };

  el.textContent = labels[normalized] || "Not submitted";
  el.className = normalized;
}

function updateOverallStatus(licenseStatus, aadharStatus) {
  const overall = $("overallStatus");
  const dot = $("overallStatusDot");

  if (!overall || !dot) return;

  const license = String(licenseStatus || "").toLowerCase();
  const aadhar = String(aadharStatus || "").toLowerCase();

  let label = "Documents required";
  let state = "";

  if (license === "verified" && aadhar === "verified") {
    label = "Fully verified";
    state = "verified";
  } else if (
    license === "rejected" ||
    aadhar === "rejected"
  ) {
    label = "Action required — document rejected";
    state = "rejected";
  } else if (
    license === "pending" ||
    aadhar === "pending"
  ) {
    label = "Documents under admin review";
    state = "pending";
  }

  overall.textContent = label;
  dot.className = `verification-status-dot ${state}`;
}

function setupUpload(user, config) {
  const input = $(config.inputId);
  const button = $(config.buttonId);
  const preview = $(config.previewId);
  const status = $(config.statusId);

  if (!input || !button || !preview || !status) return;

  let selectedFile = null;

  input.addEventListener("change", () => {
    selectedFile = null;
    button.disabled = true;
    status.textContent = "";
    status.className = "form-status";

    const file = input.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      status.textContent = "Only JPG and PNG files are allowed.";
      status.className = "form-status error";
      input.value = "";
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      status.textContent = "File is too large. Maximum size is 5MB.";
      status.className = "form-status error";
      input.value = "";
      return;
    }

    selectedFile = file;

    preview.src = URL.createObjectURL(file);
    preview.hidden = false;

    button.disabled = false;
    status.textContent = file.name;
  });

  button.addEventListener("click", async () => {
    if (!selectedFile) return;

    button.disabled = true;
    status.textContent = "Uploading...";
    status.className = "form-status";

    try {
      const extension =
        selectedFile.type === "image/png" ? "png" : "jpg";

      const storagePath =
        `${config.folder}/${user.uid}/${config.folder}.${extension}`;

      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, selectedFile);

      const downloadURL = await getDownloadURL(storageRef);

      await setDoc(
        doc(db, "users", user.uid),
        {
          [config.urlField]: downloadURL,
          [config.statusField]: "pending",
          documentsUpdatedAt: serverTimestamp()
        },
        { merge: true }
      );

      setStatus(config.statusId, "pending");

      status.textContent =
        "Uploaded successfully. Waiting for admin verification.";
      status.className = "form-status success";

      selectedFile = null;
      input.value = "";

      await refreshUserStatus(user.uid);

    } catch (error) {
      console.error("Document upload error:", error);

      status.textContent =
        error?.message ||
        "Upload failed. Check Firebase Storage rules.";

      status.className = "form-status error";
      button.disabled = false;
    }
  });
}

async function refreshUserStatus(uid) {
  try {
    const snapshot = await getDoc(doc(db, "users", uid));
    const data = snapshot.exists() ? snapshot.data() : {};

    const licenseStatus = data.licenseStatus || "not_submitted";
    const aadharStatus =
      data.aadharStatus || data.aadhaarStatus || "not_submitted";

    setStatus("licenseStatusPill", licenseStatus);
    setStatus("aadharStatusPill", aadharStatus);
    updateOverallStatus(licenseStatus, aadharStatus);
  } catch (error) {
    console.error("Could not load verification status:", error);
    $("overallStatus").textContent = "Could not load status";
  }
}

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);
    alert("Could not logout. Please try again.");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html?next=verification.html";
    return;
  }

  await refreshUserStatus(user.uid);

  setupUpload(user, {
    inputId: "licenseFile",
    buttonId: "licenseUploadBtn",
    previewId: "licensePreview",
    statusId: "licenseUploadStatus",
    folder: "licenses",
    urlField: "licenseURL",
    statusField: "licenseStatus"
  });

  setupUpload(user, {
    inputId: "aadharFile",
    buttonId: "aadharUploadBtn",
    previewId: "aadharPreview",
    statusId: "aadharUploadStatus",
    folder: "aadhar",
    urlField: "aadharURL",
    statusField: "aadharStatus"
  });
});
