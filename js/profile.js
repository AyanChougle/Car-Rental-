/* ============================================================
   KRUZLY — PROFILE PAGE
   Firebase Auth + Firestore
   Local Node Media Server for documents
   ============================================================ */

import { auth } from "./firebase-init.js";
import { checkAuth, getCurrentUser, logout } from "./auth.js?v=20260917-v1";
import { api } from "./kruizly-api.js?v=20260917-v1";
import "./nav-helper.js";
import { formatBookingNumber } from "./booking-reference.js";

let currentUser = null;

async function getAuthToken(user = null) {
  try {
    if (user && typeof user.getIdToken === "function") {
      return await user.getIdToken();
    }
    if (
      auth &&
      auth.currentUser &&
      typeof auth.currentUser.getIdToken === "function"
    ) {
      return await auth.currentUser.getIdToken();
    }
  } catch (_) {}
  return "";
}

/* ============================================================
   CONFIG
   ============================================================ */

const MEDIA_SERVER_URL = window.__KRUIZLY_API_URL__
  ? window.__KRUIZLY_API_URL__.replace(/\/api$/, "")
  : window.location.origin;

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "svg",
  "avif",
  "heic",
  "heif",
  "zip",
  "zipx",
  "7z",
  "rar",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "tar.gz",
  "tar.bz2",
  "tar.xz",
  "pdf",
  "doc",
  "docx",
];

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/x-png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/x-bmp",
  "image/tiff",
  "image/x-tiff",
  "image/svg+xml",
  "image/svg",
  "image/avif",
  "image/heic",
  "image/heic-sequence",
  "image/heif",
  "image/heif-sequence",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
  "multipart/x-zip",
  "application/x-zipx",
  "application/x-7z-compressed",
  "application/x-7z",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-rar",
  "application/x-tar",
  "application/tar",
  "application/gzip",
  "application/x-gzip",
  "application/x-compressed-tar",
  "application/x-tgz",
  "application/x-bzip2",
  "application/x-bzip",
  "application/bzip2",
  "application/x-xz",
  "application/octet-stream",
  "binary/octet-stream",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function isAllowedUploadFile(file) {
  if (!file) return false;
  const name = (file.name || "").toLowerCase();
  const ext = name.split(".").pop();
  const blocked = ["php", "exe", "bat", "cmd", "sh", "bash", "js", "vbs", "jar", "cgi"];
  if (blocked.includes(ext)) {
    return false;
  }
  return true;
}

/* ============================================================
   HELPERS
   ============================================================ */

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "?";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value === "object" && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value === "object" && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(value) {
  if (!value || value === "—") {
    return "—";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "—") return "—";

    // If it's already formatted nicely like "28 Aug 2026", "28 Aug 2026, 10:00 AM"
    if (
      /^[A-Za-z]{3,}\s+\d{1,2}/i.test(trimmed) ||
      /^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}/i.test(trimmed)
    ) {
      return trimmed;
    }

    // Handle "DD-MM-YYYY" or "DD/MM/YYYY" or "DD-MM-YYYY HH:mm"
    const ddmmyyyy = trimmed.match(
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)$/,
    );
    if (ddmmyyyy) {
      const [, d, m, y, rest] = ddmmyyyy;
      const dObj = new Date(Number(y), Number(m) - 1, Number(d));
      if (!Number.isNaN(dObj.getTime())) {
        const str = new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(dObj);
        return rest && rest.trim() ? `${str}, ${rest.trim()}` : str;
      }
    }

    // Handle "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss"
    const yyyymmdd = trimmed.match(
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(.*)$/,
    );
    if (yyyymmdd) {
      const [, y, m, d, rest] = yyyymmdd;
      const dObj = new Date(Number(y), Number(m) - 1, Number(d));
      if (!Number.isNaN(dObj.getTime())) {
        const str = new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(dObj);
        return rest && rest.trim() && !rest.includes("T00:00") ? `${str}` : str;
      }
    }

    const parsed = new Date(trimmed).getTime();
    if (!Number.isNaN(parsed) && parsed > 0) {
      return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(parsed));
    }

    return trimmed;
  }

  const millis = toMillis(value);
  if (!millis) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(millis));
}

function formatINR(value) {
  const amount = Number(value || 0);

  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function withTimeout(promise, milliseconds = 10000) {
  return Promise.race([
    promise,

    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Request timed out. Please check your connection."));
      }, milliseconds);
    }),
  ]);
}

/* ============================================================
   LOCAL MEDIA SERVER
   ============================================================ */

/*
   Uploads a document to:

 *   POST /api/media/upload

   The Firebase ID token proves who the user is.
*/

async function uploadDocumentToServer(user, file, category) {
  if (!user) {
    throw new Error("You are not signed in.");
  }

  if (!file) {
    throw new Error("No file selected.");
  }

  // Upload directly to Hostinger server storage via kruizly-api
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);

  const result = await api.upload("/media/upload", formData);
  if (
    result &&
    (result.url || result.mediaUrl || result.mediaId || result.id)
  ) {
    return result;
  }

  throw new Error("Document upload failed: No URL returned from server.");
}

/*
   The media server protects files with Firebase Auth.

   Therefore <img src="..."> cannot directly load the image
   because an <img> element cannot attach our Authorization header.

   We fetch the file ourselves with the Firebase token and
   convert it into a temporary browser URL.
*/

async function loadProtectedMediaPreview(user, mediaUrl, imageElement) {
  if (!user || !mediaUrl || !imageElement) {
    return;
  }

  try {
    const token = await getAuthToken(user);

    let url = mediaUrl;

    if (!url.startsWith("http")) {
      url = `${MEDIA_SERVER_URL}${mediaUrl}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // File does not exist on local disk / SQLite - keep placeholder
        imageElement.hidden = true;
        return;
      }
      throw new Error(`Media request failed (${response.status})`);
    }

    const blob = await response.blob();

    const objectUrl = URL.createObjectURL(blob);

    /*
       Revoke the previous object URL if this
       image had one.
    */

    if (imageElement.dataset.objectUrl) {
      URL.revokeObjectURL(imageElement.dataset.objectUrl);
    }

    imageElement.dataset.objectUrl = objectUrl;

    imageElement.src = objectUrl;

    imageElement.hidden = false;

    if (
      imageElement.nextElementSibling &&
      imageElement.nextElementSibling.classList.contains(
        "profile-listing-card__placeholder",
      )
    ) {
      imageElement.nextElementSibling.hidden = true;
    }
  } catch (error) {
    console.warn("Protected media preview unavailable:", error.message);

    imageElement.hidden = true;
  }
}

/* ============================================================
   STATUS
   ============================================================ */

const STATUS = {
  not_submitted: {
    label: "Not Submitted",
    className: "",
  },

  pending: {
    label: "Pending Review",
    className: "pending",
  },

  verified: {
    label: "Verified",
    className: "verified",
  },

  rejected: {
    label: "Rejected",
    className: "rejected",
  },
};

function setStatusPill(id, status) {
  const element = $(id);

  if (!element) {
    return;
  }

  const normalized = String(status || "not_submitted").toLowerCase();

  const info = STATUS[normalized] || STATUS.not_submitted;

  element.textContent = info.label;

  element.className =
    "status-pill" + (info.className ? ` ${info.className}` : "");
}

/* ============================================================
   TABS
   ============================================================ */

function initTabs() {
  const buttons = document.querySelectorAll(".prof-tab-btn");

  const panels = document.querySelectorAll(".prof-panel");

  const activateTab = (target) => {
    const selectedButton = Array.from(buttons).find(
      (button) => button.dataset.tab === target,
    );

    if (!selectedButton) {
      return;
    }

    buttons.forEach((button) => {
      const active = button === selectedButton;

      button.classList.toggle("active", active);

      button.setAttribute("aria-selected", String(active));
    });

    panels.forEach((panel) => {
      panel.hidden = panel.id !== target;
    });

    const tabName = target.replace("prof-tab-", "");

    if (tabName === "bookings") {
      loadBookings(currentUser?.id || currentUser?.uid);
    } else if (tabName === "listings") {
      loadMyListings(currentUser);
    }

    const url = new URL(window.location.href);

    if (tabName === "info") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tabName);
    }

    window.history.replaceState({}, "", url);
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tab);
    });
  });

  const requestedTab = new URLSearchParams(window.location.search).get("tab");

  activateTab(requestedTab ? `prof-tab-${requestedTab}` : "prof-tab-info");
}

/* ============================================================
   MY VEHICLE LISTINGS
   ============================================================ */

const LISTING_STATUS = {
  pending_approval: { label: "Pending review", className: "pending" },
  approved: { label: "Approved", className: "approved" },
  rejected: { label: "Needs attention", className: "rejected" },
};

async function loadMyListings(userParam) {
  const grid = $("profListingsGrid");
  const summary = $("profListingsSummary");

  if (!grid || !summary) return;

  const currentU =
    typeof userParam === "object" && userParam ? userParam : currentUser || {};
  const currentUid = String(
    currentU.uid || currentU.firebaseUid || currentU.id || "",
  ).trim();
  const currentEmail = String(currentU.email || "")
    .trim()
    .toLowerCase();

  try {
    const res = await api.get("/users/partner-cars");
    let listings = Array.isArray(res?.partnerCars) ? res.partnerCars : [];

    // Filter strictly to current user's listings
    if (currentUid || currentEmail) {
      const userFiltered = listings.filter((car) => {
        const cUid = String(car.userId || car.firebaseUid || "").trim();
        const cEmail = String(car.userEmail || car.email || "")
          .trim()
          .toLowerCase();
        const cDbId = String(car.dbUserId || car.user_id || "").trim();
        if (currentEmail && cEmail && cEmail === currentEmail) return true;
        if (currentUid && cUid && cUid === currentUid) return true;
        if (currentU.id && cDbId && cDbId === String(currentU.id)) return true;
        return false;
      });
      if (userFiltered.length > 0 || listings.length === 0) {
        listings = userFiltered;
      }
    }

    const totalMonthRevenue = listings.reduce(
      (sum, item) => sum + Number(item.monthRevenue || 0),
      0,
    );
    const totalLifetimeRevenue = listings.reduce(
      (sum, item) => sum + Number(item.totalRevenue || 0),
      0,
    );
    const approvedCount = listings.filter(
      (listing) => listing.status === "approved",
    ).length;

    summary.innerHTML = `
      <div><strong>${listings.length}</strong><span>Hosted Cars</span></div>
      <div><strong>${approvedCount}</strong><span>Approved</span></div>
      <div><strong style="color: #06d6a0;">${formatINR(totalMonthRevenue)}</strong><span>This Month Earnings</span></div>
      <div><strong style="color: var(--kr-cyan); font-weight: 700;">${formatINR(totalLifetimeRevenue)}</strong><span>Lifetime Revenue</span></div>
    `;

    if (!listings.length) {
      grid.innerHTML = `
        <div class="profile-listing-state empty">
          <span class="profile-listing-state__icon" aria-hidden="true">+</span>
          <h3>No vehicle listings yet</h3>
          <p>List your car to start earning with Kruizly.</p>
          <a class="profile-action primary" href="partner.html">List Your Car</a>
        </div>`;
      return;
    }

    grid.innerHTML = listings
      .map((listing) => {
        const status = LISTING_STATUS[listing.status] || {
          label: listing.status || "Submitted",
          className: "pending",
        };
        const vehicleName =
          `${listing.brand || "Vehicle"} ${listing.model || ""}`.trim();

        let firstPhoto = "";
        if (Array.isArray(listing.photos) && listing.photos.length) {
          const p0 = listing.photos[0];
          firstPhoto =
            typeof p0 === "object" && p0
              ? p0.url || p0.mediaUrl || ""
              : String(p0 || "");
        } else if (typeof listing.imageUrl === "string") {
          firstPhoto = listing.imageUrl.trim();
        }

        const rejectionNote =
          listing.rejectionReason ||
          listing.adminNote ||
          listing.reviewNote ||
          "";

        return `
        <article class="profile-listing-card">
          <div class="profile-listing-card__media">
            ${
              firstPhoto
                ? `<img src="${escapeHtml(firstPhoto)}" alt="${escapeHtml(vehicleName)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\\'profile-listing-card__placeholder\\\'>CAR</div>';" />`
                : `<div class="profile-listing-card__placeholder" aria-hidden="true">${escapeHtml(listing.brand || "CAR")}</div>`
            }
          </div>
          <div class="profile-listing-card__body">
            <div class="profile-listing-card__top">
              <div>
                <p class="profile-listing-card__eyebrow">Hosted vehicle</p>
                <h3>${escapeHtml(vehicleName)}</h3>
              </div>
              <span class="profile-listing-status ${status.className}">${escapeHtml(status.label)}</span>
            </div>
            <dl class="profile-listing-meta">
              <div><dt>Registration</dt><dd>${escapeHtml(listing.regNo || listing.regNumber || "Not provided")}</dd></div>
              <div><dt>Location</dt><dd>${escapeHtml(listing.city || listing.location || "Not provided")}</dd></div>
              <div><dt>Transmission</dt><dd>${escapeHtml(listing.transmission || "—")}</dd></div>
              <div><dt>Year</dt><dd>${listing.year || "—"}</dd></div>
              <div><dt>Submitted</dt><dd>${escapeHtml(formatDate(listing.createdAt))}</dd></div>
            </dl>

            <!-- Revenue and Trip Performance -->
            <div class="profile-listing-revenue" style="margin: 14px 0 10px; padding: 12px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center;">
              <div>
                <span style="font-size: 11px; color: var(--text-sub, #888); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">This Month</span>
                <strong style="font-size: 15px; color: #06d6a0; font-weight: 700;">${formatINR(listing.monthRevenue || 0)}</strong>
              </div>
              <div>
                <span style="font-size: 11px; color: var(--text-sub, #888); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Total Revenue</span>
                <strong style="font-size: 15px; color: var(--kr-cyan, #4fd7ff); font-weight: 700;">${formatINR(listing.totalRevenue || 0)}</strong>
              </div>
              <div>
                <span style="font-size: 11px; color: var(--text-sub, #888); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Trips Done</span>
                <strong style="font-size: 15px; color: #fff; font-weight: 700;">${listing.completedTrips || 0}</strong>
              </div>
            </div>

            ${
              rejectionNote
                ? `<p class="profile-listing-note"><strong>Review note:</strong> ${escapeHtml(rejectionNote)}</p>`
                : ""
            }

            <div class="profile-listing-card__footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <span>Listing ID #${escapeHtml(
                String(listing.id || "")
                  .slice(0, 8)
                  .toUpperCase(),
              )}</span>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="btn-withdraw-listing" data-listing-id="${escapeHtml(listing.id)}" data-vehicle-name="${escapeHtml(vehicleName)}" data-reg-no="${escapeHtml(listing.regNo || listing.regNumber || "Not provided")}" style="background: rgba(255, 183, 3, 0.12); color: #ffb703; border: 1px solid rgba(255, 183, 3, 0.35); border-radius: 8px; padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Request withdrawal of vehicle from fleet">
                  <span>Withdraw Fleet</span>
                </button>
                <button type="button" class="btn-delete-listing" data-listing-id="${escapeHtml(listing.id)}" style="background: rgba(239, 71, 111, 0.12); color: #ef476f; border: 1px solid rgba(239, 71, 111, 0.3); border-radius: 8px; padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer;">Delete</button>
                <a href="partner.html" style="color: var(--kr-cyan); text-decoration: none; font-weight: 700; font-size: 12.5px;">Manage</a>
              </div>
            </div>
          </div>
        </article>`;
      })
      .join("");

    // Withdraw Fleet mailto handler
    grid.querySelectorAll(".btn-withdraw-listing").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const vName = btn.dataset.vehicleName || "Vehicle";
        const vReg = btn.dataset.regNo || "N/A";
        const vId = btn.dataset.listingId || "";
        const uName = currentU.name || currentU.displayName || "Host Partner";
        const uEmail = currentU.email || "";
        const uPhone = currentU.phone || "";

        const subject = encodeURIComponent(
          `Fleet Withdrawal Request: ${vName} (${vReg})`,
        );
        const body = encodeURIComponent(
          `Hello Kruizly Fleet Operations,

I am writing to formally request the withdrawal of my vehicle from the Kruizly hosting fleet.

Vehicle Details:
• Vehicle Name: ${vName}
• Registration Number: ${vReg}
• Listing ID: ${vId}

Host Details:
• Host Name: ${uName}
• Registered Email: ${uEmail}
• Contact Phone: ${uPhone}

Reason for Withdrawal:
[Please enter your reason or effective date here]

Thank you,
${uName}`,
        );

        window.location.href = `mailto:support@kruizly.com?subject=${subject}&body=${body}`;
      });
    });

    // Delete listing handler
    grid.querySelectorAll(".btn-delete-listing").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = btn.dataset.listingId;
        if (!id) return;
        if (!confirm("Are you sure you want to delete this vehicle listing?"))
          return;
        btn.disabled = true;
        btn.textContent = "Deleting...";
        try {
          await api.delete(`/users/partner-cars/${encodeURIComponent(id)}`);
          loadMyListings(currentU);
        } catch (err) {
          console.error("Delete listing error:", err);
          alert(`Could not delete listing: ${err.message}`);
          btn.disabled = false;
          btn.textContent = "Delete";
        }
      });
    });
  } catch (error) {
    console.error("Could not load profile listings:", error);
    summary.innerHTML = "";
    grid.innerHTML = `
      <div class="profile-listing-state error">
        <h3>Listings could not be loaded</h3>
        <p>Please refresh the page or try again in a moment.</p>
      </div>`;
  }
}

/* ============================================================
   PROFILE
   ============================================================ */

async function loadProfile(user) {
  const emailElement = $("profileEmail");
  if (emailElement) {
    emailElement.textContent = user.email || "—";
  }

  // Pre-fill UI with local auth user details
  if (user) {
    renderProfileData(
      {
        name: user.name || user.displayName || "",
        email: user.email || "",
        phone: user.phone || user.phoneNumber || "",
        status: "active",
      },
      user,
    );
  }

  try {
    const res = await api.get("/users/me");
    const data = res.user || {};

    console.log("KRUZLY profile loaded:", data);
    renderProfileData(data, user);
    return data;
  } catch (error) {
    console.warn("Profile server load notice:", error);
    return {};
  }
}

/* ============================================================
   RENDER PROFILE
   ============================================================ */

async function renderProfileData(data, user) {
  const name =
    data.name ||
    user.displayName ||
    (user.email ? user.email.split("@")[0] : "KRUZLY Member");

  const phone = data.phone || "";

  const age = data.age || "";

  const hasLicense = Boolean(data.licenseFrontURL || data.licenseURL);
  const hasAadhar = Boolean(data.aadharFrontURL || data.aadharURL);
  const hasPan = Boolean(data.panFrontURL || data.panURL);

  const licenseStatus = hasLicense
    ? String(data.licenseStatus || "pending").toLowerCase()
    : "not_submitted";

  const aadharStatus = hasAadhar
    ? String(data.aadharStatus || "pending").toLowerCase()
    : "not_submitted";

  const panStatus = hasPan
    ? String(data.panStatus || "pending").toLowerCase()
    : "not_submitted";

  /* ==========================================================
     NAME
     ========================================================== */

  if ($("profileName")) {
    $("profileName").textContent = name;
  }

  /* ==========================================================
     AVATAR
     ========================================================== */

  if ($("profileAvatar")) {
    $("profileAvatar").textContent = initials(name);
  }

  /* ==========================================================
     PHONE
     ========================================================== */

  if ($("profilePhone")) {
    $("profilePhone").textContent = phone || "Phone not added";
  }

  /* ==========================================================
     AGE
     ========================================================== */

  if ($("profileAge")) {
    $("profileAge").textContent = age ? `${age} yrs` : "Not added";
  }

  /* ==========================================================
     EMAIL
     ========================================================== */

  if ($("profileEmail")) {
    $("profileEmail").textContent = data.email || user.email || "—";
  }

  /* ==========================================================
     DOCUMENT STATUS
     ========================================================== */

  setStatusPill("licenseStatusPill", licenseStatus);

  setStatusPill("aadharStatusPill", aadharStatus);

  setStatusPill("panStatusPill", panStatus);

  /* ==========================================================
     VERIFICATION BADGE
     ========================================================== */

  const badge = $("verificationBadge");

  if (badge) {
    badge.className = "profile-verification-badge";

    if (
      licenseStatus === "verified" &&
      aadharStatus === "verified" &&
      panStatus === "verified"
    ) {
      badge.textContent = "Verified Account";

      badge.classList.add("verified");
    } else if (
      licenseStatus === "rejected" ||
      aadharStatus === "rejected" ||
      panStatus === "rejected"
    ) {
      badge.textContent = "Verification Required";

      badge.classList.add("rejected");
    } else if (
      licenseStatus === "pending" ||
      aadharStatus === "pending" ||
      panStatus === "pending"
    ) {
      badge.textContent = "Verification Pending";

      badge.classList.add("pending");
    } else {
      badge.textContent = "Unverified Account";
    }
  }

  /* ==========================================================
     PROTECTED DOCUMENT PREVIEWS
     ========================================================== */

  if (data.licenseFrontURL || data.licenseURL) {
    await loadProtectedMediaPreview(
      user,
      data.licenseFrontURL || data.licenseURL,
      $("licenseFrontPreview"),
    );
  }

  if (data.licenseBackURL) {
    await loadProtectedMediaPreview(
      user,
      data.licenseBackURL,
      $("licenseBackPreview"),
    );
  }

  if (data.aadharFrontURL || data.aadharURL) {
    await loadProtectedMediaPreview(
      user,
      data.aadharFrontURL || data.aadharURL,
      $("aadharFrontPreview"),
    );
  }

  if (data.aadharBackURL) {
    await loadProtectedMediaPreview(
      user,
      data.aadharBackURL,
      $("aadharBackPreview"),
    );
  }

  if (data.panFrontURL) {
    await loadProtectedMediaPreview(
      user,
      data.panFrontURL,
      $("panFrontPreview"),
    );
  }

  if (data.panBackURL) {
    await loadProtectedMediaPreview(user, data.panBackURL, $("panBackPreview"));
  }
}

/* ============================================================
   PROFILE ERROR
   ============================================================ */

function renderProfileError(error) {
  if ($("profileName")) {
    $("profileName").textContent = "Unable to load profile";
  }

  if ($("profileAvatar")) {
    $("profileAvatar").textContent = "!";
  }

  if ($("profilePhone")) {
    $("profilePhone").textContent = "Unavailable";
  }

  if ($("profileAge")) {
    $("profileAge").textContent = "Unavailable";
  }

  if ($("verificationBadge")) {
    $("verificationBadge").textContent = "Profile Error";
  }

  console.error("KRUZLY profile error:", error);
}

/* ============================================================
   EDIT PROFILE
   ============================================================ */

function initEditProfile(user, profileData) {
  const editButton = $("editProfile");

  const cancelButton = $("cancelProfile");

  const form = $("profileEditForm");

  const view = $("profileView");

  const nameInput = $("editName");

  const ageInput = $("editAge");

  const phoneInput = $("editPhone");

  const saveButton = $("saveProfile");

  const status = $("editProfileStatus");

  if (phoneInput && !phoneInput._phoneMaskAttached) {
    phoneInput._phoneMaskAttached = true;
    phoneInput.setAttribute("maxlength", "10");
    phoneInput.setAttribute("inputmode", "numeric");
    phoneInput.addEventListener("input", () => {
      phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 10);
    });
  }

  if (!editButton || !cancelButton || !form || !view) {
    console.warn("Edit profile elements missing.");

    return;
  }

  editButton.addEventListener("click", (event) => {
    event.preventDefault();

    if (nameInput) {
      nameInput.value = profileData?.name || user.displayName || "";
    }

    if (ageInput) {
      ageInput.value = profileData?.age || "";
    }

    if (phoneInput) {
      phoneInput.value = profileData?.phone || "";
    }

    if (status) {
      status.textContent = "";

      status.className = "form-status";
    }

    view.hidden = true;

    form.hidden = false;

    nameInput?.focus();
  });

  cancelButton.addEventListener("click", (event) => {
    event.preventDefault();

    form.hidden = true;

    view.hidden = false;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = nameInput?.value.trim() || "";

    const phone = phoneInput?.value.trim() || "";

    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
      cleanPhone = cleanPhone.slice(2);
    }
    if (cleanPhone && !/^[6-9]\d{9}$/.test(cleanPhone)) {
      if (status) {
        status.textContent =
          "Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).";
        status.className = "form-status error";
      }
      return;
    }

    const ageRaw = ageInput?.value.trim() || "";

    const age = ageRaw ? Number(ageRaw) : null;

    if (!name) {
      if (status) {
        status.textContent = "Please enter your full name.";

        status.className = "form-status error";
      }

      return;
    }

    if (age !== null && (Number.isNaN(age) || age < 18 || age > 100)) {
      if (status) {
        status.textContent = "Age must be between 18 and 100.";

        status.className = "form-status error";
      }

      return;
    }

    if (saveButton) {
      saveButton.disabled = true;
    }

    if (status) {
      status.textContent = "Saving changes...";

      status.className = "form-status";
    }

    try {
      const updateRes = await api.put("/users/me", {
        name: name || null,
        phone: cleanPhone || null,
        age: age || null,
      });

      const updatedUser = updateRes?.user || {};

      /* Update local profileData and UI immediately */
      if (profileData) {
        profileData.name = updatedUser.name || name;
        profileData.phone = updatedUser.phone || cleanPhone || null;
        profileData.age = updatedUser.age || age || null;
      }

      renderProfileData(
        {
          ...(profileData || {}),
          name: updatedUser.name || name,
          phone: updatedUser.phone || cleanPhone || "",
          age: updatedUser.age || age || "",
        },
        user,
      );

      if (status) {
        status.textContent = "Profile saved successfully.";
        status.className = "form-status success";
      }

      setTimeout(() => {
        form.hidden = true;

        view.hidden = false;
      }, 600);
    } catch (error) {
      console.error("Profile save error:", error);

      if (status) {
        status.textContent = error?.message || "Could not save your profile.";

        status.className = "form-status error";
      }
    }

    if (saveButton) {
      saveButton.disabled = false;
    }
  });
}

/* ============================================================
   BOOKINGS
   ============================================================ */

const PROFILE_BOOKINGS_PER_PAGE = 6;
let profileBookingPage = 1;
let profileBookings = [];

function renderProfileBookings() {
  const container = $("profLiveBookings");

  if (!container || !profileBookings.length) return;

  const totalPages = Math.max(
    1,
    Math.ceil(profileBookings.length / PROFILE_BOOKINGS_PER_PAGE),
  );

  profileBookingPage = Math.min(profileBookingPage, totalPages);

  const start = (profileBookingPage - 1) * PROFILE_BOOKINGS_PER_PAGE;
  const visibleBookings = profileBookings.slice(
    start,
    start + PROFILE_BOOKINGS_PER_PAGE,
  );

  container.innerHTML = `
    ${visibleBookings.map(renderBooking).join("")}
    ${renderPaginationBar({
      page: profileBookingPage,
      totalPages,
      totalItems: profileBookings.length,
      label: "bookings",
    })}
  `;

  container.querySelectorAll(".btn-cancel-booking").forEach((button) => {
    button.addEventListener("click", () => {
      openUserCancelModal(button.dataset.bookingId);
    });
  });

  container.querySelectorAll("[data-page-action]").forEach((button) => {
    button.addEventListener("click", () => {
      profileBookingPage += button.dataset.pageAction === "next" ? 1 : -1;
      renderProfileBookings();
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function openUserCancelModal(bookingId) {
  const modal = $("cancelBookingModal");
  const modalIdInput = $("cancelModalBookingId");
  if (!modal || !bookingId) return;

  if (modalIdInput) modalIdInput.value = bookingId;
  modal.hidden = false;
  modal.removeAttribute("hidden");
  modal.style.setProperty("display", "flex", "important");
}

function initUserCancellationModal() {
  const modal = $("cancelBookingModal");
  const closeBtn1 = $("closeCancelBookingModal");
  const closeBtn2 = $("cancelModalCloseBtn");
  const confirmBtn = $("confirmCancelBookingBtn");
  const modalIdInput = $("cancelModalBookingId");
  const reasonSelect = $("cancelReasonSelect");

  if (!modal || !confirmBtn) return;
  if (modal.dataset.initialized === "true") return;
  modal.dataset.initialized = "true";

  const closeModal = () => {
    modal.hidden = true;
    modal.setAttribute("hidden", "");
    modal.style.setProperty("display", "none", "important");
    if (modalIdInput) modalIdInput.value = "";
  };

  if (closeBtn1) closeBtn1.addEventListener("click", closeModal);
  if (closeBtn2) closeBtn2.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  confirmBtn.addEventListener("click", async () => {
    const bookingId = modalIdInput?.value;
    const reason = reasonSelect?.value || "Personal Issue";

    if (!bookingId) {
      alert("No booking selected for cancellation.");
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Cancelling...";

    try {
      const res = await api.post("/bookings/cancel", {
        id: bookingId,
        bookingId: bookingId,
        bookingNumber: bookingId,
        reason: reason,
        cancellationReason: reason,
      });

      alert(
        res?.message ||
          "Booking cancelled successfully! Your refund has been processed automatically.",
      );
      closeModal();

      const user = getCurrentUser();
      currentUser = user;
      if (user) {
        loadBookings(user.id || user.uid);
      }
    } catch (err) {
      console.error("Cancellation error:", err);
      alert(`Failed to cancel booking: ${err.message || "Unknown error"}`);
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirm Cancellation";
    }
  });
}

function renderPaginationBar({ page, totalPages, totalItems, label }) {
  if (totalPages <= 1) return "";

  return `
    <nav class="data-pagination" aria-label="${escapeHtml(label)} pages">
      <span class="data-pagination__summary">
        Page ${page} of ${totalPages} · ${totalItems} ${escapeHtml(label)}
      </span>
      <div class="data-pagination__actions">
        <button type="button" data-page-action="previous" ${page === 1 ? "disabled" : ""}>Previous</button>
        <button type="button" data-page-action="next" ${page === totalPages ? "disabled" : ""}>Next</button>
      </div>
    </nav>`;
}

async function loadBookings(userId) {
  const container = $("profLiveBookings");

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="loading-state">
      Loading your bookings...
    </div>
  `;

  try {
    const res = await api.get("/bookings/my-bookings");
    const bookings = Array.isArray(res.bookings) ? res.bookings : [];

    if (!bookings.length) {
      container.innerHTML = `

        <div class="empty-state">

          <h3>
            No bookings yet
          </h3>

          <p>
            You haven't booked a car yet.
          </p>

          <a
            href="fleet.html"
            class="profile-button primary"
          >
            Browse Fleet
          </a>

        </div>

      `;

      return;
    }

    profileBookings = bookings;
    profileBookingPage = 1;
    renderProfileBookings();
  } catch (error) {
    console.error("Booking loading error:", error);

    container.innerHTML = `

      <div class="error-state">

        <strong>
          Could not load your bookings.
        </strong>

        <br><br>

        <small>
          ${escapeHtml(error?.message || "Unknown Firestore error")}
        </small>

      </div>

    `;
  }
}

/* ============================================================
   BOOKING CARD
   ============================================================ */

function renderBooking(booking) {
  const status = String(booking.status || "unknown").toLowerCase();

  let statusClass = "pending";
  let displayStatus = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  if (status === "confirmed" || status === "completed") {
    statusClass = "verified";
    displayStatus = status === "completed" ? "Completed" : "Confirmed";
  } else if (status === "pending_payment") {
    statusClass = "pending";
    displayStatus = "Pending Payment";
  } else if (status === "pending_verification" || status === "pending") {
    statusClass = "pending";
    displayStatus = "Under Review";
  } else if (
    status === "cancelled" ||
    status === "rejected" ||
    booking.paymentStatus === "rejected"
  ) {
    statusClass = "rejected";
    displayStatus =
      booking.paymentStatus === "rejected" ? "Payment Rejected" : "Cancelled";
  }

  const vehicleName =
    booking.vehicleName || booking.carName || "Rental Vehicle";

  const bookingRef = formatBookingNumber(booking);

  const pickup =
    booking.pickupDate ||
    booking.pickupDateTime ||
    booking.pickup_date ||
    booking.startDate ||
    booking.startDateTime ||
    booking.pickup ||
    booking.startAt ||
    booking.bookingDate ||
    booking.date ||
    (booking.rental &&
      (booking.rental.pickupDate || booking.rental.startDate)) ||
    (booking.dates && booking.dates.pickup) ||
    "—";

  const drop =
    booking.dropDate ||
    booking.dropDateTime ||
    booking.drop_date ||
    booking.returnDate ||
    booking.returnDateTime ||
    booking.return_date ||
    booking.endDate ||
    booking.endDateTime ||
    booking.drop ||
    booking.return ||
    booking.endAt ||
    (booking.rental &&
      (booking.rental.dropDate ||
        booking.rental.returnDate ||
        booking.rental.endDate)) ||
    (booking.dates && (booking.dates.drop || booking.dates.return)) ||
    "—";

  const amount = Number(booking.totalAmount ?? booking.finalAmount ?? booking.amount ?? 0);
  const advAmount = Number(booking.advanceAmount ?? (booking.paymentPlan === "advance" ? 500 : 0));
  const remBalance = Number(
    booking.remainingBalance !== undefined && booking.remainingBalance !== null
      ? booking.remainingBalance
      : (booking.paymentPlan === "advance" ? Math.max(0, amount - (advAmount > 0 ? advAmount : 500)) : 0)
  );

  const isFullPlan = booking.paymentPlan === "full";
  const isAdvancePlan = booking.paymentPlan === "advance";
  const isPaidStatus = booking.paymentStatus === "paid" || (isFullPlan && (booking.paymentStatus === "verified" || booking.paymentStatus === "confirmed"));
  const isFullyPaid = isPaidStatus || (booking.paymentStatus === "advance_paid" && remBalance <= 0);
  const isPendingVerification = booking.paymentStatus === "pending_verification";

  // Amount due for paying full remaining balance or total amount
  let amountDue = amount;
  if ((booking.paymentStatus === "advance_paid" || advAmount > 0) && remBalance > 0) {
    amountDue = remBalance;
  } else if (remBalance > 0) {
    amountDue = remBalance;
  }

  const bId = booking.bookingId || booking.bookingNumber || booking.id || "";

  let paymentButton = "";

  if (isPendingVerification) {
    paymentButton = `
      <span class="status-pill pending" style="background: rgba(250, 204, 21, 0.15); color: #facc15; border: 1px solid rgba(250, 204, 21, 0.3); padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        Payment Under Review
      </span>
    `;
  } else if (isFullyPaid) {
    paymentButton = `
      <span class="status-pill verified" style="background: rgba(6, 214, 160, 0.15); color: #06d6a0; border: 1px solid rgba(6, 214, 160, 0.3); padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        100% Fully Paid
      </span>
    `;
  } else if (status !== "cancelled" && status !== "rejected" && status !== "completed") {
    const isBalancePayment = (booking.paymentStatus === "advance_paid" || advAmount > 0) && remBalance > 0;
    const btnLabel = booking.paymentStatus === "rejected"
      ? `Resubmit Payment (₹${formatINR(amountDue)})`
      : (isBalancePayment
          ? `Pay Remaining Balance (₹${formatINR(amountDue)})`
          : `Pay Full Amount (₹${formatINR(amountDue)})`);

    paymentButton = `
      <a
        href="payment.html?booking=${encodeURIComponent(bId)}&plan=full"
        class="profile-button primary"
        style="background: linear-gradient(135deg, #00d2ff, #0055ff); color: #fff; font-weight: 700; padding: 8px 18px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 7px; box-shadow: 0 4px 14px rgba(0, 122, 255, 0.35); transition: transform 0.15s ease;"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
        ${btnLabel}
      </a>
    `;
  }

  return `

    <article class="booking-card">

      <div class="booking-top">

        <div>

          <div class="booking-vehicle">

            ${escapeHtml(vehicleName)}

          </div>

          <div class="booking-ref">

            Booking #${escapeHtml(bookingRef)}

          </div>

        </div>


        <span
          class="status-pill ${statusClass}"
        >

          ${escapeHtml(displayStatus)}

        </span>

      </div>


      <div class="booking-grid">

        <div class="booking-detail">

          <span>
            Pickup
          </span>

          <strong>
            ${escapeHtml(formatDate(pickup))}
          </strong>

        </div>


        <div class="booking-detail">

          <span>
            Return
          </span>

          <strong>
            ${escapeHtml(formatDate(drop))}
          </strong>

        </div>


        <div class="booking-detail">
          <span>
            Duration
          </span>
          <strong>
            ${escapeHtml(
              (() => {
                let dStr = booking.duration || "";
                if (!dStr.includes("hr")) {
                  const d = Math.max(1, Number(booking.days) || 1);
                  const h = Math.max(1, Number(booking.hours) || d * 24);
                  return `${d} Day${d > 1 ? "s" : ""} (${h} hrs)`;
                }
                return dStr;
              })(),
            )}
          </strong>
        </div>


        <div class="booking-detail">

          <span>
            Amount
          </span>

          <strong>
            ${escapeHtml(formatINR(amount))}
          </strong>

        </div>

        ${
          isAdvancePlan
            ? `
              <div class="booking-detail">
                <span>Token Paid</span>
                <strong style="color: #06d6a0;">₹${formatINR(advAmount || 500)}</strong>
              </div>
              <div class="booking-detail">
                <span>Remaining Due</span>
                <strong style="color: ${remBalance > 0 ? '#ef476f' : '#06d6a0'};">
                  ${remBalance > 0 ? `₹${formatINR(remBalance)}` : '₹0 (Fully Paid)'}
                </strong>
              </div>
            `
            : ""
        }

      </div>

      ${
        booking.couponCode
          ? `
            <div style="margin-top: 8px; font-size: 0.8rem; color: var(--kz-success, #34d399);">
              Coupon: <strong>${escapeHtml(booking.couponCode)}</strong> (-${formatINR(booking.couponDiscount || 0)})
            </div>
          `
          : ""
      }

      ${
        booking.cancellationReason || booking.cancellation_reason
          ? `
            <div style="margin-top: 8px; padding: 6px 10px; background: rgba(239, 71, 111, 0.1); border: 1px solid rgba(239, 71, 111, 0.25); border-radius: 8px; font-size: 0.8rem; color: #ff6b8b;">
              Cancellation Reason: <strong>${escapeHtml(booking.cancellationReason || booking.cancellation_reason)}</strong>
              ${booking.refundStatus || booking.refund_status ? ` · Refund: <span style="color:#06d6a0; font-weight:700;">${escapeHtml((booking.refundStatus || booking.refund_status).toUpperCase())}</span>` : ""}
            </div>
          `
          : ""
      }

      <div class="booking-actions" style="margin-top: 12px; display: flex; gap: 10px; align-items: center; justify-content: flex-end;">
        ${paymentButton}
        ${
          status !== "cancelled" &&
          status !== "rejected" &&
          status !== "completed"
            ? `<button type="button" class="btn-cancel-booking" data-booking-id="${escapeHtml(booking.bookingId || booking.bookingNumber || booking.id || "")}" style="background: rgba(239, 71, 111, 0.12); color: #ef476f; border: 1px solid rgba(239, 71, 111, 0.3); border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer;">Cancel Booking</button>`
            : ""
        }
      </div>

    </article>

  `;
}

/* ============================================================
   DOCUMENT UPLOAD
   ============================================================ */

function initDocumentUpload(user, config) {
  const input = $(config.inputId);

  const button = $(config.buttonId);

  const preview = $(config.previewId);

  const status = $(config.statusId);

  if (!input || !button || !preview || !status) {
    console.error("Document upload elements missing:", config);

    return;
  }

  let selectedFile = null;

  input.addEventListener("change", () => {
    selectedFile = null;

    button.disabled = true;

    status.textContent = "";

    status.className = "form-status";

    const file = input.files?.[0] || input._capturedFile;

    if (!file) {
      return;
    }

    /* ======================================================
         TYPE CHECK
         ====================================================== */

    if (!isAllowedUploadFile(file)) {
      status.textContent =
        "Supported formats: JPG, PNG, WEBP, GIF, BMP, TIFF, SVG, AVIF, HEIC, ZIP, RAR, 7Z, TAR, GZ, BZ2, XZ, PDF.";

      status.className = "form-status error";

      input.value = "";
      delete input._capturedFile;

      return;
    }

    /* ======================================================
         SIZE CHECK
         ====================================================== */

    if (file.size > MAX_FILE_BYTES) {
      status.textContent = "File is too large. Maximum size is 5MB.";

      status.className = "form-status error";

      input.value = "";
      delete input._capturedFile;

      return;
    }

    /* ======================================================
         PREVIEW SELECTED FILE
         ====================================================== */

    selectedFile = file;

    if (preview.dataset.objectUrl) {
      URL.revokeObjectURL(preview.dataset.objectUrl);

      delete preview.dataset.objectUrl;
    }

    const objectUrl = URL.createObjectURL(file);

    preview.dataset.objectUrl = objectUrl;

    preview.src = objectUrl;

    preview.hidden = false;

    button.disabled = false;

    status.textContent = file.name;

    status.className = "form-status";
  });

  /* ==========================================================
     UPLOAD BUTTON
     ========================================================== */

  button.addEventListener("click", async () => {
    if (!selectedFile) {
      return;
    }

    button.disabled = true;

    status.textContent = "Uploading...";

    status.className = "form-status";

    try {
      /*
           IMPORTANT:

           We are NOT using Firebase Storage anymore.

           License:
             licenses path -> license_doc

           Aadhaar:
             aadhar path -> aadhar_doc
        */

      const result = await uploadDocumentToServer(
        user,
        selectedFile,
        config.serverCategory,
      );

      console.log("Media server upload:", result);

      /*
           Server returns:

           {
             id,
             userId,
             category,
             originalName,
             mimeType,
             sizeBytes,
             uploadedAt,
             url
           }
        */

      const mediaUrl = result.url;

      if (!mediaUrl) {
        throw new Error(
          "Upload succeeded but the server did not return a file URL.",
        );
      }

      /* Save document in MySQL database */
      const fieldName = config.urlField.includes("Front")
        ? "FrontMediaId"
        : "BackMediaId";
      const docType = config.statusField.replace("Status", "");
      await api.post("/verification/submit", {
        [`${docType}${fieldName}`]: result.mediaId || result.id || mediaUrl,
      });

      /* ====================================================
           UPDATE STATUS
           ==================================================== */

      setStatusPill(config.pillId, "pending");

      status.textContent =
        "Uploaded successfully. Waiting for admin verification.";

      status.className = "form-status success";

      /* ====================================================
           CLEAR SELECTED FILE
           ==================================================== */

      selectedFile = null;

      input.value = "";
      delete input._capturedFile;

      /*
           Keep the uploaded preview visible.

           The current preview is already showing the
           selected file, so there is no need to download
           it again immediately.
        */

      button.disabled = true;
    } catch (error) {
      console.error("Document upload error:", error);

      status.textContent = error?.message || "Upload failed. Please try again.";

      status.className = "form-status error";

      button.disabled = false;
    }
  });
}

/* ============================================================
   REAL-TIME DOCUMENT CAMERA CAPTURE
   ============================================================ */

let docCameraStream = null;
let currentFacingMode = "environment";
let activeCameraTargetInputId = null;
let currentDocCapturedBlob = null;

function initDocumentCameraModal() {
  const modal = $("docCameraModal");
  if (!modal) return;

  const video = $("docCameraVideo");
  const canvas = $("docCameraCanvas");
  const snapshotImg = $("docCameraSnapshot");
  const closeBtn = $("closeDocCameraModal");
  const switchBtn = $("docCameraSwitchBtn");
  const shutterBtn = $("docCameraShutterBtn");
  const retakeBtn = $("docCameraRetakeBtn");
  const useBtn = $("docCameraUseBtn");
  const liveActions = $("docCameraActionsLive");
  const previewActions = $("docCameraActionsPreview");
  const statusMsg = $("docCameraStatusMsg");
  const modalTitle = $("docCameraModalTitle");
  const guideOverlay = $("docCameraGuideOverlay");

  const stopStream = () => {
    if (docCameraStream) {
      docCameraStream.getTracks().forEach((track) => track.stop());
      docCameraStream = null;
    }
    if (video) {
      video.srcObject = null;
    }
  };

  const closeModal = () => {
    stopStream();
    modal.hidden = true;
    modal.setAttribute("hidden", "");
    modal.style.setProperty("display", "none", "important");
    currentDocCapturedBlob = null;
    activeCameraTargetInputId = null;
    if (snapshotImg) {
      snapshotImg.hidden = true;
      snapshotImg.style.setProperty("display", "none", "important");
      snapshotImg.src = "";
    }
    if (statusMsg) {
      statusMsg.hidden = true;
      statusMsg.style.setProperty("display", "none", "important");
      statusMsg.innerHTML = "";
    }
    if (video) {
      video.style.removeProperty("display");
    }
  };

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (
      e.target === modal ||
      e.target.classList.contains("doc-camera-modal__backdrop")
    ) {
      closeModal();
    }
  });

  const fallbackInput = $("docCameraFallbackInput");

  const renderCameraError = (title, message, isNotFound = false) => {
    if (liveActions) liveActions.hidden = true;
    if (video) video.hidden = true;
    if (guideOverlay) guideOverlay.hidden = true;
    if (statusMsg) {
      statusMsg.hidden = false;
      statusMsg.innerHTML = `
        <div style="text-align: center; max-width: 380px; margin: 0 auto;">
          <div style="font-size: 38px; margin-bottom: 12px; line-height: 1;">📷</div>
          <h4 style="color: #ff6b6b; font-size: 1.05rem; font-weight: 700; margin: 0 0 8px;">${title}</h4>
          <p style="color: #cbd5e1; font-size: 0.84rem; line-height: 1.5; margin: 0 0 20px;">${message}</p>
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button type="button" id="docCameraTriggerFallbackBtn" style="background: #48d7ff; color: #050607; font-weight: 700; font-size: 0.84rem; text-transform: uppercase; letter-spacing: 0.04em; border-radius: 10px; padding: 10px 18px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(72, 215, 255, 0.4);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
              <span>${isNotFound ? "Choose / Snap Photo" : "Use Camera App"}</span>
            </button>
            <button type="button" id="docCameraCancelFallbackBtn" style="background: rgba(255, 255, 255, 0.08); color: #fff; font-weight: 600; font-size: 0.84rem; border-radius: 10px; padding: 10px 16px; border: 1px solid rgba(255, 255, 255, 0.2); cursor: pointer;">
              Cancel
            </button>
          </div>
        </div>
      `;

      const triggerBtn = $("docCameraTriggerFallbackBtn");
      if (triggerBtn && fallbackInput) {
        triggerBtn.addEventListener("click", () => {
          fallbackInput.click();
        });
      }
      const cancelBtn = $("docCameraCancelFallbackBtn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", closeModal);
      }
    }
  };

  if (fallbackInput) {
    fallbackInput.addEventListener("change", () => {
      const file = fallbackInput.files?.[0];
      if (!file || !activeCameraTargetInputId) {
        closeModal();
        return;
      }

      const targetInput = $(activeCameraTargetInputId);
      if (targetInput) {
        targetInput._capturedFile = file;
        try {
          if (typeof DataTransfer !== "undefined") {
            const dt = new DataTransfer();
            dt.items.add(file);
            targetInput.files = dt.files;
          }
        } catch (e) {
          console.warn("DataTransfer fallback:", e);
        }
        targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      fallbackInput.value = "";
      closeModal();
    });
  }

  const startCamera = async () => {
    stopStream();
    if (statusMsg) {
      statusMsg.hidden = true;
      statusMsg.style.setProperty("display", "none", "important");
      statusMsg.innerHTML = "";
    }
    if (snapshotImg) {
      snapshotImg.hidden = true;
      snapshotImg.style.setProperty("display", "none", "important");
      snapshotImg.src = "";
    }
    if (video) {
      video.hidden = false;
      video.style.setProperty("display", "block", "important");
    }
    if (guideOverlay) {
      guideOverlay.hidden = false;
      guideOverlay.style.setProperty("display", "flex", "important");
    }
    if (liveActions) {
      liveActions.hidden = false;
      liveActions.style.setProperty("display", "flex", "important");
    }
    if (previewActions) {
      previewActions.hidden = true;
      previewActions.style.setProperty("display", "none", "important");
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      renderCameraError(
        "Camera Not Supported",
        "Your browser or connection does not support live video capture. You can take a photo with your device camera app or choose an existing file.",
        true,
      );
      return;
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode },
        audio: false,
      });
    } catch (e1) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      } catch (err) {
        console.warn("Camera access failed:", err);
        const errName = err?.name || "";
        if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
          renderCameraError(
            "No Camera Detected",
            "No webcam or camera hardware was detected on this device. If your computer does not have a camera, click below to select a photo from your files or take a photo on mobile.",
            true,
          );
        } else if (
          errName === "NotAllowedError" ||
          errName === "PermissionDeniedError"
        ) {
          renderCameraError(
            "Camera Access Blocked",
            "Camera permission was denied. Please allow camera permissions in your browser address bar, or click below to select a photo.",
            false,
          );
        } else if (
          errName === "NotReadableError" ||
          errName === "TrackStartError"
        ) {
          renderCameraError(
            "Camera In Use",
            "The camera is currently in use by another application. Please close other camera apps, or click below to select a photo.",
            false,
          );
        } else {
          renderCameraError(
            "Camera Unavailable",
            `Could not start camera (${err?.message || errName || "Error"}). Click below to choose or snap a photo.`,
            true,
          );
        }
        return;
      }
    }

    if (stream) {
      docCameraStream = stream;
      if (video) {
        video.srcObject = docCameraStream;
        await video.play();
      }
    }
  };

  if (switchBtn) {
    switchBtn.addEventListener("click", async () => {
      currentFacingMode =
        currentFacingMode === "environment" ? "user" : "environment";
      await startCamera();
    });
  }

  if (shutterBtn) {
    shutterBtn.addEventListener("click", () => {
      if (!video || !video.videoWidth || !canvas) return;

      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          currentDocCapturedBlob = blob;
          const url = URL.createObjectURL(blob);
          if (snapshotImg) {
            snapshotImg.src = url;
            snapshotImg.hidden = false;
            snapshotImg.style.setProperty("display", "block", "important");
          }
          if (video) {
            video.hidden = true;
            video.style.setProperty("display", "none", "important");
          }
          if (guideOverlay) {
            guideOverlay.hidden = true;
            guideOverlay.style.setProperty("display", "none", "important");
          }
          if (liveActions) {
            liveActions.hidden = true;
            liveActions.style.setProperty("display", "none", "important");
          }
          if (previewActions) {
            previewActions.hidden = false;
            previewActions.style.setProperty("display", "flex", "important");
          }
          stopStream();
        },
        "image/jpeg",
        0.92,
      );
    });
  }

  if (retakeBtn) {
    retakeBtn.addEventListener("click", () => {
      currentDocCapturedBlob = null;
      if (snapshotImg) {
        snapshotImg.hidden = true;
        snapshotImg.style.setProperty("display", "none", "important");
        snapshotImg.src = "";
      }
      startCamera();
    });
  }

  if (useBtn) {
    useBtn.addEventListener("click", () => {
      if (!currentDocCapturedBlob || !activeCameraTargetInputId) {
        closeModal();
        return;
      }

      const targetInput = $(activeCameraTargetInputId);
      if (!targetInput) {
        closeModal();
        return;
      }

      const cleanDocName = activeCameraTargetInputId.replace("File", "");
      const fileName = `${cleanDocName}_camera_${Date.now()}.jpg`;
      const file = new File([currentDocCapturedBlob], fileName, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });

      targetInput._capturedFile = file;

      try {
        if (typeof DataTransfer !== "undefined") {
          const dt = new DataTransfer();
          dt.items.add(file);
          targetInput.files = dt.files;
        }
      } catch (dtErr) {
        console.warn("DataTransfer assignment not supported:", dtErr);
      }

      targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      closeModal();
    });
  }

  document.querySelectorAll(".doc-btn-camera").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = btn.dataset.targetInput;
      const docTitle = btn.dataset.docTitle || "Document Photo";
      if (!targetId) return;

      activeCameraTargetInputId = targetId;
      if (modalTitle) modalTitle.textContent = `Capture ${docTitle}`;

      modal.hidden = false;
      modal.removeAttribute("hidden");
      modal.style.setProperty("display", "flex", "important");

      startCamera();
    });
  });
}

/* ============================================================
   LOGOUT
   ============================================================ */

function initLogout() {
  const button = $("logoutBtn");

  if (!button) {
    return;
  }

  button.addEventListener("click", async (event) => {
    event.preventDefault();

    if (!confirm("Are you sure you want to logout?")) {
      return;
    }

    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);

      alert("Could not logout. Please try again.");
    }
  });
}

/* ============================================================
   AUTH INITIALIZATION
   ============================================================ */

async function initProfileAuth() {
  const isAuthenticated = await checkAuth();

  if (!isAuthenticated) {
    window.location.href = "index.html?next=profile.html";
    return;
  }

  const user = getCurrentUser();
  console.log(
    "KRUIZLY auth state:",
    user ? { uid: user.id || user.uid, email: user.email } : "NOT LOGGED IN",
  );

  try {
    initTabs();
    initUserCancellationModal();
    const profileData = await loadProfile(user);
    initEditProfile(user, profileData || {});
    loadBookings(user.id || user.uid);
    loadMyListings(user);

    [
      {
        inputId: "licenseFrontFile",
        buttonId: "licenseFrontUploadBtn",
        previewId: "licenseFrontPreview",
        statusId: "licenseFrontUploadStatus",
        pillId: "licenseStatusPill",
        serverCategory: "license_doc",
        urlField: "licenseFrontURL",
        statusField: "licenseStatus",
      },
      {
        inputId: "licenseBackFile",
        buttonId: "licenseBackUploadBtn",
        previewId: "licenseBackPreview",
        statusId: "licenseBackUploadStatus",
        pillId: "licenseStatusPill",
        serverCategory: "license_doc",
        urlField: "licenseBackURL",
        statusField: "licenseStatus",
      },
    ].forEach((config) => initDocumentUpload(user, config));

    [
      {
        inputId: "aadharFrontFile",
        buttonId: "aadharFrontUploadBtn",
        previewId: "aadharFrontPreview",
        statusId: "aadharFrontUploadStatus",
        pillId: "aadharStatusPill",
        serverCategory: "aadhar_doc",
        urlField: "aadharFrontURL",
        statusField: "aadharStatus",
      },
      {
        inputId: "aadharBackFile",
        buttonId: "aadharBackUploadBtn",
        previewId: "aadharBackPreview",
        statusId: "aadharBackUploadStatus",
        pillId: "aadharStatusPill",
        serverCategory: "aadhar_doc",
        urlField: "aadharBackURL",
        statusField: "aadharStatus",
      },
      {
        inputId: "panFrontFile",
        buttonId: "panFrontUploadBtn",
        previewId: "panFrontPreview",
        statusId: "panFrontUploadStatus",
        pillId: "panStatusPill",
        serverCategory: "pan_doc",
        urlField: "panFrontURL",
        statusField: "panStatus",
      },
      {
        inputId: "panBackFile",
        buttonId: "panBackUploadBtn",
        previewId: "panBackPreview",
        statusId: "panBackUploadStatus",
        pillId: "panStatusPill",
        serverCategory: "pan_doc",
        urlField: "panBackURL",
        statusField: "panStatus",
      },
    ].forEach((config) => initDocumentUpload(user, config));

    initDocumentCameraModal();
    initMediaManager(user);
    initLogout();
  } catch (error) {
    console.error("KRUZLY profile initialization failed:", error);
  }
}

initProfileAuth();

/* ============================================================
   MY MEDIA MANAGER (PHOTO/VIDEO PREVIEW, UPLOAD & DELETE)
   ============================================================ */

function initMediaManager(user) {
  const fileInput = $("mediaFile");
  const uploadBtn = $("mediaUploadBtn");
  const previewBox = $("mediaSelectionPreview");
  const previewFrame = $("mediaSelectionFrame");
  const previewName = $("mediaSelectionName");
  const previewSize = $("mediaSelectionSize");
  const removeBtn = $("mediaSelectionRemove");
  const statusEl = $("mediaUploadStatus");
  const errorEl = $("mediaErrorState");

  if (!fileInput || !uploadBtn) return;

  let currentPreviewUrl = null;

  function clearSelection() {
    fileInput.value = "";
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
    }
    if (previewFrame) previewFrame.innerHTML = "";
    if (previewBox) previewBox.hidden = true;
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Upload";
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      clearSelection();
      return;
    }

    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
    }
    currentPreviewUrl = URL.createObjectURL(file);

    if (previewFrame) {
      previewFrame.innerHTML = file.type.startsWith("video/")
        ? `<video src="${currentPreviewUrl}" controls style="width:100%;height:100%;object-fit:cover;border-radius:8px;"></video>`
        : `<img src="${currentPreviewUrl}" alt="${escapeHtml(file.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />`;
    }

    if (previewName) previewName.textContent = file.name;
    if (previewSize)
      previewSize.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    if (previewBox) previewBox.hidden = false;
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload";
    if (statusEl) statusEl.textContent = "";
  });

  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      clearSelection();
    });
  }

  uploadBtn.addEventListener("click", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";
    if (statusEl) {
      statusEl.textContent = "Uploading media...";
      statusEl.className = "form-status";
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "personal_media");

      await api.upload("/media/upload", formData);

      if (statusEl) {
        statusEl.textContent = "Media uploaded successfully.";
        statusEl.className = "form-status success";
      }

      clearSelection();
      await loadUserMedia(user);
    } catch (err) {
      console.error("Media upload error:", err);
      if (statusEl) {
        statusEl.textContent = err.message || "Could not upload media.";
        statusEl.className = "form-status error";
      }
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload";
    }
  });

  loadUserMedia(user);
}

async function loadUserMedia(user) {
  const gridEl = $("mediaGrid");
  const emptyEl = $("mediaEmptyState");
  const errorEl = $("mediaErrorState");
  if (!gridEl) return;

  try {
    const data = await api.get("/media/my-media");
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data.files)
        ? data.files
        : Array.isArray(data.items)
          ? data.items
          : [];

    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      gridEl.innerHTML = "";
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (errorEl) errorEl.hidden = true;

    gridEl.innerHTML = items
      .map((item) => {
        const isVideo =
          item.mimeType?.startsWith("video/") || item.mediaType === "video";
        const fileName = item.originalName || "Uploaded Media";
        const dateFormatted = formatDate(item.createdAt || item.uploadedAt);
        const mediaId = item.mediaId || item.id;
        const fileUrl =
          item.url || `/api/media/file.php?id=${encodeURIComponent(mediaId)}`;

        return `
        <div class="media-card" style="position:relative;border-radius:14px;overflow:hidden;background:rgba(255,255,255,0.035);border:1px solid var(--kr-border);display:flex;flex-direction:column;">
          <div style="width:100%;aspect-ratio:4/3;background:rgba(0,0,0,0.5);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;">
            ${
              isVideo
                ? `<video src="${escapeHtml(fileUrl)}" controls style="width:100%;height:100%;object-fit:cover;"></video>`
                : `<img src="${escapeHtml(fileUrl)}" alt="${escapeHtml(fileName)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" />`
            }
            <button type="button" class="btn-delete-media" data-media-id="${escapeHtml(mediaId)}" title="Delete Media" style="position:absolute;top:8px;right:8px;width:30px;height:30px;background:rgba(239,71,111,0.9);color:white;border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.5);font-size:16px;font-weight:bold;z-index:2;transition:transform 0.15s ease;">×</button>
          </div>
          <div style="padding:10px 12px;display:flex;flex-direction:column;gap:2px;">
            <strong style="font-size:12.5px;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</strong>
            <span style="font-size:11px;color:var(--kr-text-muted);">${escapeHtml(dateFormatted)}</span>
          </div>
        </div>
      `;
      })
      .join("");

    // Wire delete buttons
    gridEl.querySelectorAll(".btn-delete-media").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.mediaId;
        if (!id) return;
        if (!confirm("Are you sure you want to delete this media file?"))
          return;
        btn.disabled = true;
        try {
          await api.delete("/media/delete", { id: id });
          await loadUserMedia(user);
        } catch (err) {
          console.error("Delete media error:", err);
          alert("Could not delete media file: " + err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    console.warn("Could not load user media list:", err.message);
    if (emptyEl) emptyEl.hidden = false;
  }
}

// Ensure cancel modal is strictly hidden on load
document.addEventListener("DOMContentLoaded", () => {
  const cancelModal = $("cancelBookingModal");
  if (cancelModal) {
    cancelModal.hidden = true;
    cancelModal.setAttribute("hidden", "");
    cancelModal.style.setProperty("display", "none", "important");
  }
  initUserCancellationModal();
});
initUserCancellationModal();
