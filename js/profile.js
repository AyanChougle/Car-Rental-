/* ============================================================
   KRUZLY — PROFILE PAGE
   Firebase Auth + Firestore
   Local Node Media Server for documents
   ============================================================ */

import { auth } from "./firebase-init.js";
import { checkAuth, getCurrentUser, logout } from "./auth.js?v=20260904-v17";
import { api } from "./kruizly-api.js?v=20260904-v17";
import "./nav-helper.js";
import { formatBookingNumber } from "./booking-reference.js";

async function getAuthToken(user = null) {
  try {
    if (user && typeof user.getIdToken === "function") {
      return await user.getIdToken();
    }
    if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === "function") {
      return await auth.currentUser.getIdToken();
    }
  } catch (_) {}
  return "";
}


/* ============================================================
   CONFIG
   ============================================================ */

const MEDIA_SERVER_URL = window.__KRUIZLY_API_URL__ ? window.__KRUIZLY_API_URL__.replace(/\/api$/, '') : window.location.origin;

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
];


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
    .map(part => part.charAt(0).toUpperCase())
    .join("");
}


function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (
    typeof value === "object" &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value === "object" &&
    typeof value.seconds === "number"
  ) {
    return value.seconds * 1000;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed)
    ? 0
    : parsed;
}


function formatDate(value) {
  if (!value || value === "—") {
    return "—";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "—") return "—";

    // If it's already formatted nicely like "28 Aug 2026", "28 Aug 2026, 10:00 AM"
    if (/^[A-Za-z]{3,}\s+\d{1,2}/i.test(trimmed) || /^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}/i.test(trimmed)) {
      return trimmed;
    }

    // Handle "DD-MM-YYYY" or "DD/MM/YYYY" or "DD-MM-YYYY HH:mm"
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)$/);
    if (ddmmyyyy) {
      const [, d, m, y, rest] = ddmmyyyy;
      const dObj = new Date(Number(y), Number(m) - 1, Number(d));
      if (!Number.isNaN(dObj.getTime())) {
        const str = new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }).format(dObj);
        return rest && rest.trim() ? `${str}, ${rest.trim()}` : str;
      }
    }

    // Handle "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss"
    const yyyymmdd = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(.*)$/);
    if (yyyymmdd) {
      const [, y, m, d, rest] = yyyymmdd;
      const dObj = new Date(Number(y), Number(m) - 1, Number(d));
      if (!Number.isNaN(dObj.getTime())) {
        const str = new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }).format(dObj);
        return rest && rest.trim() && !rest.includes("T00:00") ? `${str}` : str;
      }
    }

    const parsed = new Date(trimmed).getTime();
    if (!Number.isNaN(parsed) && parsed > 0) {
      return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(new Date(parsed));
    }

    return trimmed;
  }

  const millis = toMillis(value);
  if (!millis) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  ).format(new Date(millis));
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
        reject(
          new Error(
            "Request timed out. Please check your connection."
          )
        );
      }, milliseconds);
    })
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

async function uploadDocumentToServer(
  user,
  file,
  category
) {
  if (!user) {
    throw new Error("You are not signed in.");
  }

  if (!file) {
    throw new Error("No file selected.");
  }

  // Upload to Hostinger server storage via kruizly-api
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    const result = await api.upload("/media/upload", formData);
    if (result && (result.url || result.mediaUrl || result.mediaId || result.id)) {
      return result;
    }
  } catch (serverErr) {
    console.warn("[Upload] Media upload via API failed, using client fallback:", serverErr);
  }

  // 2. Client-side compressed document processing for direct Firestore/Cloud verification
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;
        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
        resolve({
          url: dataUrl,
          id: `doc_${Date.now()}`,
          category,
          originalName: file.name
        });
      };
      img.onerror = () => {
        resolve({
          url: e.target.result,
          id: `doc_${Date.now()}`,
          category,
          originalName: file.name
        });
      };
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not process selected document."));
    reader.readAsDataURL(file);
  });
}


/*
   The media server protects files with Firebase Auth.

   Therefore <img src="..."> cannot directly load the image
   because an <img> element cannot attach our Authorization header.

   We fetch the file ourselves with the Firebase token and
   convert it into a temporary browser URL.
*/

async function loadProtectedMediaPreview(
  user,
  mediaUrl,
  imageElement
) {
  if (
    !user ||
    !mediaUrl ||
    !imageElement
  ) {
    return;
  }

  try {
    const token = await getAuthToken(user);

    let url = mediaUrl;

    if (!url.startsWith("http")) {
      url =
        `${MEDIA_SERVER_URL}${mediaUrl}`;
    }

    const response =
      await fetch(
        url,
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      );

    if (!response.ok) {
      if (response.status === 404) {
        // File does not exist on local disk / SQLite - keep placeholder
        imageElement.hidden = true;
        return;
      }
      throw new Error(
        `Media request failed (${response.status})`
      );
    }

    const blob =
      await response.blob();

    const objectUrl =
      URL.createObjectURL(blob);

    /*
       Revoke the previous object URL if this
       image had one.
    */

    if (
      imageElement.dataset.objectUrl
    ) {
      URL.revokeObjectURL(
        imageElement.dataset.objectUrl
      );
    }

    imageElement.dataset.objectUrl =
      objectUrl;

    imageElement.src =
      objectUrl;

    imageElement.hidden =
      false;

    if (imageElement.nextElementSibling && imageElement.nextElementSibling.classList.contains("profile-listing-card__placeholder")) {
      imageElement.nextElementSibling.hidden = true;
    }

  } catch (error) {
    console.warn(
      "Protected media preview unavailable:",
      error.message
    );

    imageElement.hidden =
      true;
  }
}


/* ============================================================
   STATUS
   ============================================================ */

const STATUS = {

  not_submitted: {
    label: "Not Submitted",
    className: ""
  },

  pending: {
    label: "Pending Review",
    className: "pending"
  },

  verified: {
    label: "Verified",
    className: "verified"
  },

  rejected: {
    label: "Rejected",
    className: "rejected"
  }

};


function setStatusPill(
  id,
  status
) {
  const element =
    $(id);

  if (!element) {
    return;
  }

  const normalized =
    String(
      status ||
      "not_submitted"
    ).toLowerCase();

  const info =
    STATUS[normalized] ||
    STATUS.not_submitted;

  element.textContent =
    info.label;

  element.className =
    "status-pill" +
    (
      info.className
        ? ` ${info.className}`
        : ""
    );
}


/* ============================================================
   TABS
   ============================================================ */

function initTabs() {
  const buttons =
    document.querySelectorAll(
      ".prof-tab-btn"
    );

  const panels =
    document.querySelectorAll(
      ".prof-panel"
    );

  const activateTab = target => {
    const selectedButton =
      Array.from(buttons).find(
        button =>
          button.dataset.tab === target
      );

    if (!selectedButton) {
      return;
    }

    buttons.forEach(button => {
      const active =
        button === selectedButton;

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-selected",
        String(active)
      );
    });

    panels.forEach(panel => {
      panel.hidden =
        panel.id !== target;
    });

    const tabName =
      target.replace("prof-tab-", "");

    const url = new URL(window.location.href);

    if (tabName === "info") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tabName);
    }

    window.history.replaceState({}, "", url);
  };

  buttons.forEach(button => {

    button.addEventListener(
      "click",
      () => {
        activateTab(
          button.dataset.tab
        );
      }
    );

  });

  const requestedTab =
    new URLSearchParams(
      window.location.search
    ).get("tab");

  activateTab(
    requestedTab
      ? `prof-tab-${requestedTab}`
      : "prof-tab-info"
  );
}


/* ============================================================
   MY VEHICLE LISTINGS
   ============================================================ */

const LISTING_STATUS = {
  pending_approval: { label: "Pending review", className: "pending" },
  approved: { label: "Approved", className: "approved" },
  rejected: { label: "Needs attention", className: "rejected" }
};


async function loadMyListings(uid) {
  const grid = $("profListingsGrid");
  const summary = $("profListingsSummary");

  if (!grid || !summary) return;

  try {
    const res = await api.get("/users/partner-cars");
    const allListings = Array.isArray(res.partnerCars) ? res.partnerCars : [];
    const listings = allListings.filter(item => (item.userId === uid || item.firebaseUid === uid || !item.userId));
    const approvedCount = listings.filter(
      listing => listing.status === "approved"
    ).length;

    summary.innerHTML = `
      <div><strong>${listings.length}</strong><span>Total listings</span></div>
      <div><strong>${approvedCount}</strong><span>Approved</span></div>
      <div><strong>${listings.length - approvedCount}</strong><span>In review / action</span></div>
    `;

    if (!listings.length) {
      grid.innerHTML = `
        <div class="profile-listing-state empty">
          <span class="profile-listing-state__icon" aria-hidden="true">+</span>
          <h3>No vehicle listings yet</h3>
          <p>List your car to start the verification and onboarding process.</p>
          <a class="profile-action primary" href="partner.html">List Your Car</a>
        </div>`;
      return;
    }

    grid.innerHTML = listings.map(listing => {
      const status = LISTING_STATUS[listing.status] || {
        label: listing.status || "Submitted",
        className: "pending"
      };
      const vehicleName =
        `${listing.brand || "Vehicle"} ${listing.model || ""}`.trim();
      const imageUrl =
        typeof listing.imageUrl === "string" ? listing.imageUrl.trim() : "";
      const firstPhotoMediaId =
        Array.isArray(listing.photoMediaIds) && listing.photoMediaIds.length
          ? listing.photoMediaIds[0]
          : null;
      const rejectionNote =
        listing.rejectionReason || listing.adminNote || listing.reviewNote || "";

      return `
        <article class="profile-listing-card">
          <div class="profile-listing-card__media">
            ${firstPhotoMediaId
              ? `<img data-listing-photo-media="${escapeHtml(firstPhotoMediaId)}" data-fallback-img="${escapeHtml(imageUrl || '')}" alt="${escapeHtml(vehicleName)}" loading="lazy" hidden /><div class="profile-listing-card__placeholder" aria-hidden="true">CAR</div>`
              : imageUrl
              ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(vehicleName)}" loading="lazy" />`
              : `<div class="profile-listing-card__placeholder" aria-hidden="true">CAR</div>`}
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
              <div><dt>Registration</dt><dd>${escapeHtml(listing.regNumber || "Not provided")}</dd></div>
              <div><dt>Location</dt><dd>${escapeHtml(listing.location || "Not provided")}</dd></div>
              <div><dt>Transmission</dt><dd>${escapeHtml(listing.transmission || "—")}</dd></div>
              <div><dt>Odometer</dt><dd>${listing.odometer != null ? `${Number(listing.odometer).toLocaleString("en-IN")} KM` : "—"}</dd></div>
              <div><dt>Submitted</dt><dd>${escapeHtml(formatDate(listing.createdAt))}</dd></div>
            </dl>
            ${rejectionNote
              ? `<p class="profile-listing-note"><strong>Review note:</strong> ${escapeHtml(rejectionNote)}</p>`
              : ""}
            <div class="profile-listing-card__footer">
              <span>Listing ID ${escapeHtml(listing.id.slice(0, 8).toUpperCase())}</span>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="btn-delete-listing" data-listing-id="${escapeHtml(listing.id)}" style="background: rgba(239, 71, 111, 0.12); color: #ef476f; border: 1px solid rgba(239, 71, 111, 0.3); border-radius: 8px; padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer;">Delete</button>
                <a href="partner.html" style="color: var(--kr-cyan); text-decoration: none; font-weight: 700; font-size: 12.5px;">Manage</a>
              </div>
            </div>
          </div>
        </article>`;
    }).join("");

    grid.querySelectorAll(".btn-delete-listing").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = btn.dataset.listingId;
        if (!id) return;
        if (!confirm("Are you sure you want to delete this vehicle listing?")) return;
        btn.disabled = true;
        btn.textContent = "Deleting...";
        try {
          await deleteDoc(doc(db, "partner_cars", id));
          loadMyListings(uid);
        } catch (err) {
          console.error("Delete listing error:", err);
          alert(`Could not delete listing: ${err.message}`);
          btn.disabled = false;
          btn.textContent = "Delete";
        }
      });
    });

    grid.querySelectorAll("[data-listing-photo-media]").forEach(async (image) => {
      const fallback = image.dataset.fallbackImg;
      await loadProtectedMediaPreview(
        auth.currentUser,
        `/api/media/file/${encodeURIComponent(image.dataset.listingPhotoMedia)}`,
        image
      );
      if (!image.hidden && image.nextElementSibling) {
        image.nextElementSibling.hidden = true;
      } else if (image.hidden && fallback) {
        image.src = fallback;
        image.hidden = false;
        if (image.nextElementSibling) {
          image.nextElementSibling.hidden = true;
        }
      }
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

  try {
    const res = await api.get("/users/me");
    const data = res.user || {};

    console.log("KRUZLY profile loaded:", data);
    renderProfileData(data, user);
    return data;
  } catch (error) {
    console.error("Profile load error:", error);
    renderProfileError(error);
    return {};
  }
}


/* ============================================================
   RENDER PROFILE
   ============================================================ */

async function renderProfileData(
  data,
  user
) {

  const name =
    data.name ||
    user.displayName ||
    (
      user.email
        ? user.email.split("@")[0]
        : "KRUZLY Member"
    );


  const phone =
    data.phone || "";


  const age =
    data.age || "";


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
    $("profileName").textContent =
      name;
  }


  /* ==========================================================
     AVATAR
     ========================================================== */

  if ($("profileAvatar")) {
    $("profileAvatar").textContent =
      initials(name);
  }


  /* ==========================================================
     PHONE
     ========================================================== */

  if ($("profilePhone")) {
    $("profilePhone").textContent =
      phone ||
      "Phone not added";
  }


  /* ==========================================================
     AGE
     ========================================================== */

  if ($("profileAge")) {
    $("profileAge").textContent =
      age
        ? `${age} yrs`
        : "Not added";
  }


  /* ==========================================================
     EMAIL
     ========================================================== */

  if ($("profileEmail")) {
    $("profileEmail").textContent =
      data.email ||
      user.email ||
      "—";
  }


  /* ==========================================================
     DOCUMENT STATUS
     ========================================================== */

  setStatusPill(
    "licenseStatusPill",
    licenseStatus
  );

  setStatusPill(
    "aadharStatusPill",
    aadharStatus
  );

  setStatusPill(
    "panStatusPill",
    panStatus
  );


  /* ==========================================================
     VERIFICATION BADGE
     ========================================================== */

  const badge =
    $("verificationBadge");

  if (badge) {

    badge.className =
      "profile-verification-badge";


    if (
      licenseStatus === "verified" &&
      aadharStatus === "verified" &&
      panStatus === "verified"
    ) {

      badge.textContent =
        "Verified Account";

      badge.classList.add(
        "verified"
      );

    } else if (
      licenseStatus === "rejected" ||
      aadharStatus === "rejected" ||
      panStatus === "rejected"
    ) {

      badge.textContent =
        "Verification Required";

      badge.classList.add(
        "rejected"
      );

    } else if (
      licenseStatus === "pending" ||
      aadharStatus === "pending" ||
      panStatus === "pending"
    ) {

      badge.textContent =
        "Verification Pending";

      badge.classList.add(
        "pending"
      );

    } else {

      badge.textContent =
        "Unverified Account";
    }
  }


  /* ==========================================================
     PROTECTED DOCUMENT PREVIEWS
     ========================================================== */

  if (data.licenseFrontURL || data.licenseURL) {
    await loadProtectedMediaPreview(user, data.licenseFrontURL || data.licenseURL, $("licenseFrontPreview"));
  }

  if (data.licenseBackURL) {
    await loadProtectedMediaPreview(user, data.licenseBackURL, $("licenseBackPreview"));
  }


  if (data.aadharFrontURL || data.aadharURL) {

    await loadProtectedMediaPreview(
      user,
      data.aadharFrontURL || data.aadharURL,
      $("aadharFrontPreview")
    );
  }

  if (data.aadharBackURL) {
    await loadProtectedMediaPreview(user, data.aadharBackURL, $("aadharBackPreview"));
  }

  if (data.panFrontURL) {
    await loadProtectedMediaPreview(user, data.panFrontURL, $("panFrontPreview"));
  }

  if (data.panBackURL) {
    await loadProtectedMediaPreview(user, data.panBackURL, $("panBackPreview"));
  }
}


/* ============================================================
   PROFILE ERROR
   ============================================================ */

function renderProfileError(
  error
) {

  if ($("profileName")) {
    $("profileName").textContent =
      "Unable to load profile";
  }

  if ($("profileAvatar")) {
    $("profileAvatar").textContent =
      "!";
  }

  if ($("profilePhone")) {
    $("profilePhone").textContent =
      "Unavailable";
  }

  if ($("profileAge")) {
    $("profileAge").textContent =
      "Unavailable";
  }

  if ($("verificationBadge")) {
    $("verificationBadge").textContent =
      "Profile Error";
  }

  console.error(
    "KRUZLY profile error:",
    error
  );
}


/* ============================================================
   EDIT PROFILE
   ============================================================ */

function initEditProfile(
  user,
  profileData
) {

  const editButton =
    $("editProfile");

  const cancelButton =
    $("cancelProfile");

  const form =
    $("profileEditForm");

  const view =
    $("profileView");

  const nameInput =
    $("editName");

  const ageInput =
    $("editAge");

  const phoneInput =
    $("editPhone");

  const saveButton =
    $("saveProfile");

  const status =
    $("editProfileStatus");


  if (phoneInput && !phoneInput._phoneMaskAttached) {
    phoneInput._phoneMaskAttached = true;
    phoneInput.setAttribute("maxlength", "10");
    phoneInput.setAttribute("inputmode", "numeric");
    phoneInput.addEventListener("input", () => {
      phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 10);
    });
  }

  if (
    !editButton ||
    !cancelButton ||
    !form ||
    !view
  ) {

    console.warn(
      "Edit profile elements missing."
    );

    return;
  }


  editButton.addEventListener(
    "click",
    event => {

      event.preventDefault();

      if (nameInput) {
        nameInput.value =
          profileData?.name ||
          user.displayName ||
          "";
      }

      if (ageInput) {
        ageInput.value =
          profileData?.age ||
          "";
      }

      if (phoneInput) {
        phoneInput.value =
          profileData?.phone ||
          "";
      }

      if (status) {
        status.textContent =
          "";

        status.className =
          "form-status";
      }

      view.hidden =
        true;

      form.hidden =
        false;

      nameInput?.focus();
    }
  );


  cancelButton.addEventListener(
    "click",
    event => {

      event.preventDefault();

      form.hidden =
        true;

      view.hidden =
        false;
    }
  );


  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const name =
        nameInput?.value.trim() || "";

      const phone =
        phoneInput?.value.trim() || "";

      let cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
        cleanPhone = cleanPhone.slice(2);
      }
      if (cleanPhone && !/^[6-9]\d{9}$/.test(cleanPhone)) {
        if (status) {
          status.textContent =
            "Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).";
          status.className =
            "form-status error";
        }
        return;
      }

      const ageRaw =
        ageInput?.value.trim() || "";


      const age =
        ageRaw
          ? Number(ageRaw)
          : null;


      if (!name) {

        if (status) {
          status.textContent =
            "Please enter your full name.";

          status.className =
            "form-status error";
        }

        return;
      }


      if (
        age !== null &&
        (
          Number.isNaN(age) ||
          age < 18 ||
          age > 100
        )
      ) {

        if (status) {
          status.textContent =
            "Age must be between 18 and 100.";

          status.className =
            "form-status error";
        }

        return;
      }


      if (saveButton) {
        saveButton.disabled =
          true;
      }


      if (status) {
        status.textContent =
          "Saving changes...";

        status.className =
          "form-status";
      }


      try {
        await api.put("/users/me", {
          name: name || null,
          phone: cleanPhone || null,
          age: age || null
        });


        /* Update UI */

        if ($("profileName")) {
          $("profileName").textContent =
            name;
        }

        if ($("profileAvatar")) {
          $("profileAvatar").textContent =
            initials(name);
        }

        if ($("profilePhone")) {
          $("profilePhone").textContent =
            cleanPhone ||
            "Phone not added";
        }

        if ($("profileAge")) {
          $("profileAge").textContent =
            age
              ? `${age} yrs`
              : "Age not set";
        }


        if (profileData) {
          profileData.name =
            name;

          profileData.phone =
            cleanPhone || null;

          profileData.age =
            age || null;
        }


        if (status) {
          status.textContent =
            "Profile saved successfully.";

          status.className =
            "form-status success";
        }


        setTimeout(() => {

          form.hidden =
            true;

          view.hidden =
            false;

        }, 600);


      } catch (error) {

        console.error(
          "Profile save error:",
          error
        );


        if (status) {
          status.textContent =
            error?.message ||
            "Could not save your profile.";

          status.className =
            "form-status error";
        }

      }


      if (saveButton) {
        saveButton.disabled =
          false;
      }
    }
  );
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
    Math.ceil(profileBookings.length / PROFILE_BOOKINGS_PER_PAGE)
  );

  profileBookingPage = Math.min(profileBookingPage, totalPages);

  const start =
    (profileBookingPage - 1) * PROFILE_BOOKINGS_PER_PAGE;
  const visibleBookings = profileBookings.slice(
    start,
    start + PROFILE_BOOKINGS_PER_PAGE
  );

  container.innerHTML = `
    ${visibleBookings.map(renderBooking).join("")}
    ${renderPaginationBar({
      page: profileBookingPage,
      totalPages,
      totalItems: profileBookings.length,
      label: "bookings"
    })}
  `;

  container
    .querySelectorAll("[data-page-action]")
    .forEach(button => {
      button.addEventListener("click", () => {
        profileBookingPage +=
          button.dataset.pageAction === "next" ? 1 : -1;
        renderProfileBookings();
        container.scrollIntoView({ behavior: "smooth", block: "start" });
      });
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

async function loadBookings(
  userId
) {

  const container =
    $("profLiveBookings");


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

    console.error(
      "Booking loading error:",
      error
    );


    container.innerHTML = `

      <div class="error-state">

        <strong>
          Could not load your bookings.
        </strong>

        <br><br>

        <small>
          ${escapeHtml(
            error?.message ||
            "Unknown Firestore error"
          )}
        </small>

      </div>

    `;
  }
}


/* ============================================================
   BOOKING CARD
   ============================================================ */

function renderBooking(
  booking
) {

  const status =
    String(
      booking.status ||
      "unknown"
    ).toLowerCase();


  let statusClass =
    "";


  if (
    status === "confirmed" ||
    status === "completed"
  ) {

    statusClass =
      "verified";

  } else if (
    status === "pending_payment" ||
    status === "pending_verification" ||
    status === "pending"
  ) {
    statusClass =
      "pending";

  } else if (
    status === "cancelled" ||
    status === "rejected" ||
    booking.paymentStatus === "rejected"
  ) {
    statusClass =
      "rejected";
    if (booking.paymentStatus === "rejected") {
      displayStatus = "Payment Rejected";
    }
  }


  const vehicleName =
    booking.vehicleName ||
    booking.carName ||
    "Rental Vehicle";


  const bookingRef =
    formatBookingNumber(booking);


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
    (booking.rental && (booking.rental.pickupDate || booking.rental.startDate)) ||
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
    (booking.rental && (booking.rental.dropDate || booking.rental.returnDate || booking.rental.endDate)) ||
    (booking.dates && (booking.dates.drop || booking.dates.return)) ||
    "—";


  const amount =
    booking.totalAmount ??
    booking.amount ??
    0;


  let paymentButton =
    "";


  if (
    status === "pending_payment"
  ) {

    if (
      booking.paymentStatus ===
      "pending_verification"
    ) {

      paymentButton = `

        <span class="status-pill pending">
          Payment Under Review
        </span>

      `;

    } else {

      paymentButton = `

        <a
          href="payment.html?booking=${encodeURIComponent(
            booking.id
          )}"
          class="profile-button primary"
        >
          ${
            booking.paymentStatus ===
            "rejected"
              ? "Resubmit Payment"
              : "Pay Now"
          }
        </a>

      `;
    }
  }


  return `

    <article class="booking-card">

      <div class="booking-top">

        <div>

          <div class="booking-vehicle">

            ${escapeHtml(
              vehicleName
            )}

          </div>

          <div class="booking-ref">

            Booking #${escapeHtml(
              bookingRef
            )}

          </div>

        </div>


        <span
          class="status-pill ${statusClass}"
        >

          ${escapeHtml(
            displayStatus
          )}

        </span>

      </div>


      <div class="booking-grid">

        <div class="booking-detail">

          <span>
            Pickup
          </span>

          <strong>
            ${escapeHtml(
              formatDate(pickup)
            )}
          </strong>

        </div>


        <div class="booking-detail">

          <span>
            Return
          </span>

          <strong>
            ${escapeHtml(
              formatDate(drop)
            )}
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
                  const h = Math.max(1, Number(booking.hours) || (d * 24));
                  return `${d} Day${d > 1 ? "s" : ""} (${h} hrs)`;
                }
                return dStr;
              })()
            )}
          </strong>
        </div>


        <div class="booking-detail">

          <span>
            Amount
          </span>

          <strong>
            ${escapeHtml(
              formatINR(amount)
            )}
          </strong>

        </div>

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
        paymentButton
          ? `

            <div class="booking-actions">

              ${paymentButton}

            </div>

          `
          : ""
      }

    </article>

  `;
}


/* ============================================================
   DOCUMENT UPLOAD
   ============================================================ */

function initDocumentUpload(
  user,
  config
) {

  const input =
    $(config.inputId);

  const button =
    $(config.buttonId);

  const preview =
    $(config.previewId);

  const status =
    $(config.statusId);


  if (
    !input ||
    !button ||
    !preview ||
    !status
  ) {

    console.error(
      "Document upload elements missing:",
      config
    );

    return;
  }


  let selectedFile =
    null;


  input.addEventListener(
    "change",
    () => {

      selectedFile =
        null;

      button.disabled =
        true;

      status.textContent =
        "";

      status.className =
        "form-status";


      const file =
        input.files?.[0];


      if (!file) {
        return;
      }


      /* ======================================================
         TYPE CHECK
         ====================================================== */

      if (
        !ALLOWED_TYPES.includes(
          file.type
        )
      ) {

        status.textContent =
          "Only JPG, PNG or WEBP files are allowed.";

        status.className =
          "form-status error";

        input.value =
          "";

        return;
      }


      /* ======================================================
         SIZE CHECK
         ====================================================== */

      if (
        file.size >
        MAX_FILE_BYTES
      ) {

        status.textContent =
          "File is too large. Maximum size is 5MB.";

        status.className =
          "form-status error";

        input.value =
          "";

        return;
      }


      /* ======================================================
         PREVIEW SELECTED FILE
         ====================================================== */

      selectedFile =
        file;


      if (
        preview.dataset.objectUrl
      ) {

        URL.revokeObjectURL(
          preview.dataset.objectUrl
        );

        delete preview.dataset.objectUrl;
      }


      const objectUrl =
        URL.createObjectURL(
          file
        );


      preview.dataset.objectUrl =
        objectUrl;

      preview.src =
        objectUrl;

      preview.hidden =
        false;


      button.disabled =
        false;


      status.textContent =
        file.name;

      status.className =
        "form-status";
    }
  );


  /* ==========================================================
     UPLOAD BUTTON
     ========================================================== */

  button.addEventListener(
    "click",
    async () => {

      if (!selectedFile) {
        return;
      }


      button.disabled =
        true;


      status.textContent =
        "Uploading...";

      status.className =
        "form-status";


      try {

        /*
           IMPORTANT:

           We are NOT using Firebase Storage anymore.

           License:
             licenses path -> license_doc

           Aadhaar:
             aadhar path -> aadhar_doc
        */

        const result =
          await uploadDocumentToServer(
            user,
            selectedFile,
            config.serverCategory
          );


        console.log(
          "Media server upload:",
          result
        );


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

        const mediaUrl =
          result.url;


        if (!mediaUrl) {
          throw new Error(
            "Upload succeeded but the server did not return a file URL."
          );
        }


        /* Save document in MySQL database */
        const fieldName = config.urlField.includes("Front") ? "FrontMediaId" : "BackMediaId";
        const docType = config.statusField.replace("Status", "");
        await api.post("/verification/submit", {
          [`${docType}${fieldName}`]: result.mediaId || result.id || mediaUrl
        });


        /* ====================================================
           UPDATE STATUS
           ==================================================== */

        setStatusPill(
          config.pillId,
          "pending"
        );


        status.textContent =
          "Uploaded successfully. Waiting for admin verification.";

        status.className =
          "form-status success";


        /* ====================================================
           CLEAR SELECTED FILE
           ==================================================== */

        selectedFile =
          null;

        input.value =
          "";


        /*
           Keep the uploaded preview visible.

           The current preview is already showing the
           selected file, so there is no need to download
           it again immediately.
        */

        button.disabled =
          true;


      } catch (error) {

        console.error(
          "Document upload error:",
          error
        );


        status.textContent =
          error?.message ||
          "Upload failed. Check that the media server is running.";

        status.className =
          "form-status error";


        button.disabled =
          false;
      }

    }
  );
}


/* ============================================================
   LOGOUT
   ============================================================ */

function initLogout() {

  const button =
    $("logoutBtn");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    async event => {

      event.preventDefault();


      if (
        !confirm(
          "Are you sure you want to logout?"
        )
      ) {
        return;
      }


      try {

        await signOut(auth);

        window.location.href =
          "index.html";

      } catch (error) {

        console.error(
          "Logout error:",
          error
        );

        alert(
          "Could not logout. Please try again."
        );
      }

    }
  );
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
  console.log("KRUIZLY auth state:", user ? { uid: user.id || user.uid, email: user.email } : "NOT LOGGED IN");

  try {
    initTabs();
    const profileData = await loadProfile(user);
    initEditProfile(user, profileData || {});
    loadBookings(user.id || user.uid);
    loadMyListings(user.id || user.uid);

    [
      { inputId: "licenseFrontFile", buttonId: "licenseFrontUploadBtn", previewId: "licenseFrontPreview", statusId: "licenseFrontUploadStatus", pillId: "licenseStatusPill", serverCategory: "license_doc", urlField: "licenseFrontURL", statusField: "licenseStatus" },
      { inputId: "licenseBackFile", buttonId: "licenseBackUploadBtn", previewId: "licenseBackPreview", statusId: "licenseBackUploadStatus", pillId: "licenseStatusPill", serverCategory: "license_doc", urlField: "licenseBackURL", statusField: "licenseStatus" }
    ].forEach((config) => initDocumentUpload(user, config));

    [
      { inputId: "aadharFrontFile", buttonId: "aadharFrontUploadBtn", previewId: "aadharFrontPreview", statusId: "aadharFrontUploadStatus", pillId: "aadharStatusPill", serverCategory: "aadhar_doc", urlField: "aadharFrontURL", statusField: "aadharStatus" },
      { inputId: "aadharBackFile", buttonId: "aadharBackUploadBtn", previewId: "aadharBackPreview", statusId: "aadharBackUploadStatus", pillId: "aadharStatusPill", serverCategory: "aadhar_doc", urlField: "aadharBackURL", statusField: "aadharStatus" },
      { inputId: "panFrontFile", buttonId: "panFrontUploadBtn", previewId: "panFrontPreview", statusId: "panFrontUploadStatus", pillId: "panStatusPill", serverCategory: "pan_doc", urlField: "panFrontURL", statusField: "panStatus" },
      { inputId: "panBackFile", buttonId: "panBackUploadBtn", previewId: "panBackPreview", statusId: "panBackUploadStatus", pillId: "panStatusPill", serverCategory: "pan_doc", urlField: "panBackURL", statusField: "panStatus" }
    ].forEach((config) => initDocumentUpload(user, config));

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
    if (previewSize) previewSize.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
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
    const items = Array.isArray(data) ? data : (Array.isArray(data.files) ? data.files : (Array.isArray(data.items) ? data.items : []));

    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      gridEl.innerHTML = "";
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (errorEl) errorEl.hidden = true;

    gridEl.innerHTML = items.map((item) => {
      const isVideo = item.mimeType?.startsWith("video/") || item.mediaType === "video";
      const fileName = item.originalName || "Uploaded Media";
      const dateFormatted = formatDate(item.createdAt || item.uploadedAt);
      const mediaId = item.mediaId || item.id;
      const fileUrl = item.url || `/api/media/file.php?id=${encodeURIComponent(mediaId)}`;

      return `
        <div class="media-card" style="position:relative;border-radius:14px;overflow:hidden;background:rgba(255,255,255,0.035);border:1px solid var(--kr-border);display:flex;flex-direction:column;">
          <div style="width:100%;aspect-ratio:4/3;background:rgba(0,0,0,0.5);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;">
            ${isVideo
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
    }).join("");

    // Wire delete buttons
    gridEl.querySelectorAll(".btn-delete-media").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.mediaId;
        if (!id) return;
        if (!confirm("Are you sure you want to delete this media file?")) return;
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
