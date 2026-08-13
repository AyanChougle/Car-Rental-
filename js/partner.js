// ============================================================
// CARRENTPE - Partner / Host Car
// Handles vehicle submissions to Firestore
// Collection: partner_cars
// ============================================================

import { auth, db } from "./firebase-init.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import "./nav-helper.js";


// ============================================================
// DOM
// ============================================================

const form = document.getElementById("partnerForm");
const statusEl = document.getElementById("partnerStatus");
const successBox = document.getElementById("partnerSuccessMsg");

const submitBtn = document.getElementById("submitPartnerBtn");

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

            <div class="card partner-listing">

              <div class="partner-listing__top">

                <div>

                  <p class="partner-listing__title">
                    ${escapeHtml(
                      car.brand || ""
                    )}
                    ${escapeHtml(
                      car.model || ""
                    )}
                    ${
                      car.year
                        ? `(${car.year})`
                        : ""
                    }
                  </p>

                  <div class="partner-listing__meta">

                    ${
                      escapeHtml(
                        car.location || "Location not provided"
                      )
                    }

                    ${
                      car.regNumber
                        ? ` • ${escapeHtml(car.regNumber)}`
                        : ""
                    }

                  </div>

                </div>


                <span
                  class="fleet-status ${status.className}"
                >
                  ${status.label}
                </span>

              </div>


              ${
                photos.length
                  ? `

                    <div class="partner-listing__photos">

                      ${photos
                        .map(
                          (url) => `

                            <img
                              src="${escapeAttribute(url)}"
                              alt="${escapeAttribute(
                                `${car.brand || ""} ${car.model || ""}`
                              )}"
                              loading="lazy"
                            />

                          `
                        )
                        .join("")}

                    </div>

                  `
                  : ""
              }


              ${
                car.status === "approved" &&
                !photos.length
                  ? `

                    <p
                      style="
                        color: var(--sub);
                        font-size: 0.82rem;
                        margin: 12px 0 0;
                      "
                    >
                      Your listing is live.
                      Our team will add professional
                      photos soon.
                    </p>

                  `
                  : ""
              }

            </div>

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

      // const category =
      //   getValue("carCategory");

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


      // ------------------------------------------------------
      // Photo
      // ------------------------------------------------------

      const imageUrl =
        getValue("carImageUrl");


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

      try {

        await addDoc(

          collection(
            db,
            "partner_cars"
          ),

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
            category,
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


            // Photo
            imageUrl:
              imageUrl || null,


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


        // Refresh listings
        await loadMyListings(
          currentUser.uid
        );


      } catch (error) {

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