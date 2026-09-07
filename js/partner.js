// ============================================================
// KRUIZLY - Partner / Host Car
// Direct Hostinger PHP + MySQL Backend
// ============================================================

import { checkAuth, getCurrentUser } from "./auth.js?v=20260907-v2";
import { api } from "./kruizly-api.js?v=20260907-v2";
import "./nav-helper.js";

// ============================================================
// DOM ELEMENTS
// ============================================================

const form = document.getElementById("partnerForm");
const statusEl = document.getElementById("partnerStatus");
const successBox = document.getElementById("partnerSuccessMsg");

const submitBtn = document.getElementById("submitPartnerBtn");
const carPhotosInput = document.getElementById("carPhotos");
const carPhotoPreview = document.getElementById("carPhotoPreview");
const myListingsSection = document.getElementById("myListingsSection");
const myListingsWrap = document.getElementById("myListingsWrap");

const MAX_HOST_PHOTOS = 6;
const MAX_HOST_PHOTO_BYTES = 10 * 1024 * 1024;
const HOST_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
let hostPhotoPreviewUrls = [];
let currentUser = null;

function clearHostPhotoPreviews() {
  hostPhotoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  hostPhotoPreviewUrls = [];
  if (carPhotoPreview) carPhotoPreview.innerHTML = "";
}

carPhotosInput?.addEventListener("change", () => {
  clearHostPhotoPreviews();
  const files = Array.from(carPhotosInput.files || []).slice(0, MAX_HOST_PHOTOS);

  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    hostPhotoPreviewUrls.push(url);
    carPhotoPreview?.insertAdjacentHTML(
      "beforeend",
      `<img src="${url}" alt="Vehicle photo preview" style="width:100%;height:105px;object-fit:cover;border:1px solid var(--line);border-radius:9px;" />`
    );
  });
});

// ============================================================
// Status labels
// ============================================================

const STATUS_LABEL = {
  pending_approval: {
    label: "Pending Review",
    className: "pending"
  },
  approved: {
    label: "Approved",
    className: "verified"
  },
  rejected: {
    label: "Rejected",
    className: "rejected"
  }
};

// ============================================================
// Utility
// ============================================================

function getValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function isDateRangeValid(start, end) {
  if (!start || !end) return true;
  return end >= start;
}

function showError(message) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = "form-status partner-status form-status--error";
}

function clearStatus() {
  if (!statusEl) return;
  statusEl.textContent = "";
  statusEl.className = "form-status partner-status";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ============================================================
// Load user's previous listings
// ============================================================

async function loadMyListings() {
  if (!myListingsSection || !myListingsWrap) return;

  try {
    const res = await api.get("/users/partner-cars");
    const listings = Array.isArray(res?.partnerCars) ? res.partnerCars : [];

    if (!listings.length) {
      myListingsSection.hidden = true;
      return;
    }

    myListingsSection.hidden = false;
    myListingsWrap.innerHTML = listings
      .map((car) => {
        const status =
          STATUS_LABEL[car.status] || {
            label: car.status || "Unknown",
            className: "pending"
          };

        return `
          <a href="profile.html?tab=listings" class="partner-listing-card" title="Click to manage this listing in your profile" style="display:block; text-decoration:none; margin-bottom:12px; padding:16px; border:1px solid rgba(255,255,255,0.1); border-radius:12px; background:rgba(255,255,255,0.02);">
            <div class="partner-listing-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div class="partner-listing-info">
                <h4 class="partner-listing-title" style="margin:0 0 6px; color:#fff; font-size:16px;">
                  ${escapeHtml(car.brand || "")} ${escapeHtml(car.model || "")}
                  ${car.year ? `<span class="partner-listing-year">(${car.year})</span>` : ""}
                </h4>
                <div class="partner-listing-meta" style="color:var(--text-sub, #888); font-size:13px; display:flex; gap:8px;">
                  <span>${escapeHtml(car.city || car.location || "Mumbai")}</span>
                  <span>•</span>
                  <span>${escapeHtml(car.transmission || "Automatic")}</span>
                  <span>•</span>
                  <span>${escapeHtml(car.fuel || "Petrol")}</span>
                </div>
              </div>
              <span class="partner-status-pill ${status.className}" style="font-size:12px; padding:4px 10px; border-radius:20px;">
                ${status.label}
              </span>
            </div>
            <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
              <p style="margin:0; font-size:12.5px; color:var(--text-sub, #888);">
                ${car.status === "approved"
                  ? "Vehicle approved and active in host fleet."
                  : car.status === "rejected"
                  ? `Review note: ${escapeHtml(car.rejectionReason || "Please verify documents.")}`
                  : "Listing submitted for review. Operations team is verifying documents."}
              </p>
              <span class="partner-listing-action" style="color:var(--kr-cyan, #4fd7ff); font-weight:700; font-size:13px;">Manage &rarr;</span>
            </div>
          </a>
        `;
      })
      .join("");
  } catch (error) {
    console.warn("Could not load user's partner listings:", error);
  }
}

// ============================================================
// Auth state
// ============================================================

async function initPartnerAuth() {
  const isAuthenticated = await checkAuth();
  if (isAuthenticated) {
    currentUser = getCurrentUser();
    if (currentUser) {
      const ownerName = document.getElementById("ownerName");
      const ownerPhone = document.getElementById("ownerPhone");
      if (ownerName && currentUser.name && !ownerName.value) {
        ownerName.value = currentUser.name;
      }
      if (ownerPhone && currentUser.phone && !ownerPhone.value) {
        ownerPhone.value = currentUser.phone;
      }
      loadMyListings();
    }
  }
}

initPartnerAuth();

// ============================================================
// Submit Partner Form
// ============================================================

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (!currentUser) {
      const isAuthed = await checkAuth();
      if (isAuthed) {
        currentUser = getCurrentUser();
      }
    }

    if (!currentUser) {
      showError("Please log in first to list your vehicle.");
      setTimeout(() => {
        window.location.href = `index.html?next=${encodeURIComponent("partner.html")}`;
      }, 1200);
      return;
    }

    // Vehicle data
    const brand = getValue("carBrand");
    const model = getValue("carModel");
    const year = Number(document.getElementById("carYear")?.value || 0);
    const odometer = Number(document.getElementById("carOdometer")?.value || 0);
    const transmission = getValue("carTransmission");
    const fuel = getValue("carFuel");
    const seats = Number(document.getElementById("carSeats")?.value || 5);
    const regNumber = getValue("carRegNumber").toUpperCase();
    const location = getValue("carLocation");

    // Documents
    const insuranceStart = getValue("InsStartDate");
    const insuranceEnd = getValue("InsEndDate");
    const pucStart = getValue("PUCStartDate");
    const pucEnd = getValue("PUCEndDate");
    const photoFiles = Array.from(carPhotosInput?.files || []);

    // Owner
    const ownerName = getValue("ownerName");
    const ownerPhone = getValue("ownerPhone");

    let cleanOwnerPhone = String(ownerPhone || "").replace(/\D/g, "");
    if (cleanOwnerPhone.length === 12 && cleanOwnerPhone.startsWith("91")) {
      cleanOwnerPhone = cleanOwnerPhone.slice(2);
    }
    if (!/^[6-9]\d{9}$/.test(cleanOwnerPhone)) {
      showError("Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.");
      return;
    }

    if (!isDateRangeValid(insuranceStart, insuranceEnd)) {
      showError("Insurance end date cannot be before the start date.");
      return;
    }

    if (!isDateRangeValid(pucStart, pucEnd)) {
      showError("PUC end date cannot be before the start date.");
      return;
    }

    if (!Number.isInteger(year) || year < 2015 || year > 2026) {
      showError("Please enter a valid manufacturing year between 2015 and 2026.");
      return;
    }

    if (!Number.isInteger(seats) || seats < 2 || seats > 10) {
      showError("Please enter a valid number of seats.");
      return;
    }

    if (!Number.isInteger(odometer) || odometer < 0 || odometer > 999999) {
      showError("Please enter a valid current odometer reading.");
      return;
    }

    if (!photoFiles.length || photoFiles.length > MAX_HOST_PHOTOS) {
      showError(`Please upload between 1 and ${MAX_HOST_PHOTOS} vehicle photos.`);
      return;
    }

    const invalidPhoto = photoFiles.find(
      (file) => !HOST_PHOTO_TYPES.has(file.type) || file.size > MAX_HOST_PHOTO_BYTES
    );

    if (invalidPhoto) {
      showError("Each vehicle photo must be JPG, PNG, or WebP and 10 MB or smaller.");
      return;
    }

    // Disable button
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
    }

    if (statusEl) {
      statusEl.textContent = "Submitting your car details...";
    }

    const uploadedPhotoUrls = [];

    try {
      for (let index = 0; index < photoFiles.length; index += 1) {
        if (statusEl) {
          statusEl.textContent = `Uploading vehicle photo ${index + 1} of ${photoFiles.length}...`;
        }
        const formData = new FormData();
        formData.append("file", photoFiles[index]);
        formData.append("category", "vehicle_gallery");
        const uploadRes = await api.upload("/media/upload", formData);
        if (uploadRes && (uploadRes.url || uploadRes.mediaUrl)) {
          uploadedPhotoUrls.push(uploadRes.url || uploadRes.mediaUrl);
        }
      }

      await api.post("/users/partner-cars", {
        brand,
        model,
        year,
        odometer,
        transmission,
        fuel,
        seats,
        regNo: regNumber,
        city: location,
        expectedPrice: 0,
        userName: ownerName,
        userPhone: ownerPhone,
        userEmail: currentUser.email || null,
        photos: uploadedPhotoUrls,
        status: "pending_approval"
      });

      // Success
      form.hidden = true;
      if (successBox) successBox.hidden = false;

      // Redirect to profile listings tab
      window.location.assign("profile.html?tab=listings");
    } catch (error) {
      console.error("Partner submission error:", error);
      showError("Failed to submit vehicle listing. Please check your connection and try again.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Car for Approval";
      }
    }
  });
}

