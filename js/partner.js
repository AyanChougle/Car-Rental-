// ============================================================
// KRUIZLY - Partner / Host Car
// Handles vehicle submissions to Firestore
// Collection: partner_cars
// ============================================================

import { auth, db } from "./firebase-init.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  collection,
  setDoc,
  serverTimestamp,
  doc,
  getDoc,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import "./nav-helper.js";
import { MEDIA_SERVER_URL } from "./media-config.js";


// ============================================================
// DOM
// ============================================================

const form = document.getElementById("partnerForm");
const statusEl = document.getElementById("partnerStatus");
const successBox = document.getElementById("partnerSuccessMsg");

const submitBtn = document.getElementById("submitPartnerBtn");
const carPhotosInput = document.getElementById("carPhotos");
const carPhotoPreview = document.getElementById("carPhotoPreview");

const MAX_HOST_PHOTOS = 6;
const MAX_HOST_PHOTO_BYTES = 10 * 1024 * 1024;
const HOST_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
let hostPhotoPreviewUrls = [];

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

async function uploadHostPhoto(file, listingId) {
  const token = await currentUser.getIdToken();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", "partner_car_photo");
formData.append("fleetId", listingId);
formData.append("relatedId", listingId);
  const response = await fetch(`${MEDIA_SERVER_URL}/api/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Photo upload failed (${response.status}).`);
  }
  return payload;
}

async function removeUploadedHostPhoto(mediaId) {
  try {
    const token = await currentUser.getIdToken();
    await fetch(`${MEDIA_SERVER_URL}/api/media/${encodeURIComponent(mediaId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    // Best-effort cleanup if the listing write fails.
  }
}

const myListingsSection =
  document.getElementById("myListingsSection");

const myListingsWrap =
  document.getElementById("myListingsWrap");


// ============================================================
// Current user
// ============================================================

let currentUser = null;


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

  if (!element) {
    return "";
  }

  return element.value.trim();
}


// ============================================================
// Date validation
// ============================================================

function isDateRangeValid(start, end) {

  if (!start || !end) {
    return true;
  }

  return end >= start;
}


// ============================================================
// Show error
// ============================================================

function showError(message) {

  if (!statusEl) {
    return;
  }

  statusEl.textContent = message;

  statusEl.classList.add("form-status--error");
}


// ============================================================
// Clear status
// ============================================================

function clearStatus() {

  if (!statusEl) {
    return;
  }

  statusEl.textContent = "";

  statusEl.classList.remove(
    "form-status--error"
  );
}


// ============================================================
// Auth state
// ============================================================

onAuthStateChanged(auth, async (user) => {

  currentUser = user;

  if (!user) {
    return;
  }


  // ----------------------------------------------------------
  // Prefill user profile
  // ----------------------------------------------------------

  try {

    const userRef = doc(
      db,
      "users",
      user.uid
    );

    const snap = await getDoc(userRef);

    if (snap.exists()) {

      const data = snap.data();


      const ownerName =
        document.getElementById("ownerName");

      const ownerPhone =
        document.getElementById("ownerPhone");


      if (
        ownerName &&
        data.name &&
        !ownerName.value
      ) {

        ownerName.value = data.name;

      }


      if (
        ownerPhone &&
        data.phone &&
        !ownerPhone.value
      ) {

        ownerPhone.value = data.phone;

      }

    }

  } catch (error) {

    console.warn(
      "Could not prefill user profile:",
      error
    );

  }


  // ----------------------------------------------------------
  // Load user's listings
  // ----------------------------------------------------------

  await loadMyListings(user.uid);

});


// ============================================================
// Load user's previous listings
// ============================================================

async function loadMyListings(uid) {

  if (
    !myListingsSection ||
    !myListingsWrap
  ) {
    return;
  }


  try {

    const listingsQuery = query(

      collection(
        db,
        "partner_cars"
      ),

      where(
        "userId",
        "==",
        uid
      )

    );


    const snap =
      await getDocs(listingsQuery);


    if (snap.empty) {

      myListingsSection.hidden = true;

      return;

    }


    myListingsSection.hidden = false;


    myListingsWrap.innerHTML =
      snap.docs
        .map((document) => {

          const car =
            document.data();


          const status =
            STATUS_LABEL[car.status] ||
            {
              label: car.status || "Unknown",
              className: "pending"
            };


          const photos =
            Array.isArray(car.photos)
              ? car.photos
              : [];


          return `
            <a href="profile.html?tab=listings" class="partner-listing-card" title="Click to manage this listing in your profile">
              <div class="partner-listing-header">
                <div class="partner-listing-info">
                  <h4 class="partner-listing-title">
                    ${escapeHtml(car.brand || "")} ${escapeHtml(car.model || "")}
                    ${car.year ? `<span class="partner-listing-year">(${car.year})</span>` : ""}
                  </h4>
                  <div class="partner-listing-meta">
                    <span>${escapeHtml(car.location || "Mumbai")}</span>
                    ${car.regNumber ? `<span>• ${escapeHtml(car.regNumber)}</span>` : ""}
                  </div>
                </div>

                <span class="partner-status-badge ${status.className}">
                  <span class="status-dot"></span>
                  ${status.label}
                </span>
              </div>

              <div class="partner-listing-footer">
                <p class="partner-listing-note">
                  ${car.status === "approved" 
                    ? "✓ Listing is live. Photos and availability managed by concierge." 
                    : "Listing submitted for review. Operations team is verifying documents."}
                </p>
                <span class="partner-listing-action">Manage &rarr;</span>
              </div>
            </a>
          `;
        })
        .join("");


  } catch (error) {

    console.error(
      "Could not load your listings:",
      error
    );

  }

}


// ============================================================
// Submit
// ============================================================

if (form) {

  form.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();


      clearStatus();


      // ------------------------------------------------------
      // Authentication
      // ------------------------------------------------------

      if (!currentUser) {

        showError(
          "Please log in first to list your vehicle."
        );


        setTimeout(() => {

          window.location.href =
            `index.html?next=${encodeURIComponent(
              "partner.html"
            )}`;

        }, 1200);


        return;

      }


      // ------------------------------------------------------
      // Vehicle data
      // ------------------------------------------------------

      const brand =
        getValue("carBrand");

      const model =
        getValue("carModel");

      const year =
        Number(
          document.getElementById("carYear").value
        );

      const odometer =
        Number(document.getElementById("carOdometer").value);

      const transmission =
        getValue("carTransmission");

      const fuel =
        getValue("carFuel");

      const seats =
        Number(
          document.getElementById("carSeats").value
        );

      const regNumber =
        getValue("carRegNumber")
          .toUpperCase();

      const location =
        getValue("carLocation");


      // ------------------------------------------------------
      // Documents
      // ------------------------------------------------------

      const insuranceStart =
        getValue("InsStartDate");

      const insuranceEnd =
        getValue("InsEndDate");

      const pucStart =
        getValue("PUCStartDate");

      const pucEnd =
        getValue("PUCEndDate");


      const photoFiles = Array.from(carPhotosInput?.files || []);


      // ------------------------------------------------------
      // Owner
      // ------------------------------------------------------

      const ownerName =
        getValue("ownerName");

      const ownerPhone =
        getValue("ownerPhone");


      // ------------------------------------------------------
      // Validate insurance dates
      // ------------------------------------------------------

      if (
        !isDateRangeValid(
          insuranceStart,
          insuranceEnd
        )
      ) {

        showError(
          "Insurance end date cannot be before the start date."
        );

        return;

      }


      // ------------------------------------------------------
      // Validate PUC dates
      // ------------------------------------------------------

      if (
        !isDateRangeValid(
          pucStart,
          pucEnd
        )
      ) {

        showError(
          "PUC end date cannot be before the start date."
        );

        return;

      }


      // ------------------------------------------------------
      // Validate year
      // ------------------------------------------------------

      if (
        !Number.isInteger(year) ||
        year < 2015 ||
        year > 2026
      ) {

        showError(
          "Please enter a valid manufacturing year."
        );

        return;

      }


      // ------------------------------------------------------
      // Validate seats
      // ------------------------------------------------------

      if (
        !Number.isInteger(seats) ||
        seats < 2 ||
        seats > 10
      ) {

        showError(
          "Please enter a valid number of seats."
        );

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


      // ------------------------------------------------------
      // Disable button
      // ------------------------------------------------------

      submitBtn.disabled = true;

      submitBtn.textContent =
        "Submitting...";


      if (statusEl) {

        statusEl.textContent =
          "Submitting your car details...";

      }


      // ------------------------------------------------------
      // Firestore
      // ------------------------------------------------------

      const listingRef = doc(collection(db, "partner_cars"));
      const uploadedPhotoIds = [];

      try {
        for (let index = 0; index < photoFiles.length; index += 1) {
          if (statusEl) {
            statusEl.textContent = `Uploading vehicle photo ${index + 1} of ${photoFiles.length}...`;
          }
          const uploaded = await uploadHostPhoto(photoFiles[index], listingRef.id);
          uploadedPhotoIds.push(uploaded.id);
        }

        await setDoc(
          listingRef,
          {

            // User
            userId:
              currentUser.uid,

            userEmail:
              currentUser.email || null,


            // Vehicle
            brand,
            model,
            year,
            odometer,
            transmission,
            fuel,
            seats,
            regNumber,
            location,


            // Documents
            insuranceStart,
            insuranceEnd,

            pucStart,
            pucEnd,


            // Photos stored on the authenticated media server
            photoMediaIds: uploadedPhotoIds,


            // Owner
            ownerName,
            ownerPhone,


            // Workflow
            status:
              "pending_approval",


            // Timestamp
            createdAt:
              serverTimestamp()

          }

        );


        // ----------------------------------------------------
        // Success
        // ----------------------------------------------------

        form.hidden = true;

        if (successBox) {
          successBox.hidden = false;
        }


        // Continue directly to the customer's listing dashboard.
        // The profile query parameter opens the My Listings tab.
        window.location.assign(
          "profile.html?tab=listings"
        );


      } catch (error) {

        await Promise.all(
          uploadedPhotoIds.map((id) => removeUploadedHostPhoto(id))
        );

        console.error(
          "Partner submission error:",
          error
        );


        showError(
          "Failed to submit vehicle listing. Please check your connection and try again."
        );


        submitBtn.disabled = false;

        submitBtn.textContent =
          "Submit Car for Approval";

      }

    }
  );

}


// ============================================================
// Basic HTML escaping
// Prevents user-entered data from becoming HTML
// ============================================================

function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function escapeAttribute(value) {

  return escapeHtml(value);

}
