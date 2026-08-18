/* ============================================================
   KRUZLY — PROFILE PAGE
   Firebase Auth + Firestore
   Local Node Media Server for documents
   ============================================================ */

import { auth, db } from "./firebase-init.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";


/* ============================================================
   CONFIG
   ============================================================ */

const MEDIA_SERVER_URL = "http://localhost:4000";

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

   POST http://localhost:4000/api/media/upload

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

  const token = await user.getIdToken();

  const formData = new FormData();

  formData.append(
    "file",
    file
  );

  formData.append(
    "category",
    category
  );

  const response = await fetch(
    `${MEDIA_SERVER_URL}/api/media/upload`,
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${token}`
      },

      body: formData
    }
  );

  const data =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Upload failed (${response.status}).`
    );
  }

  return data;
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
    const token =
      await user.getIdToken();

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

  } catch (error) {
    console.error(
      "Protected media preview failed:",
      error
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

  buttons.forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const target =
          button.dataset.tab;

        buttons.forEach(btn => {

          const active =
            btn === button;

          btn.classList.toggle(
            "active",
            active
          );

          btn.setAttribute(
            "aria-selected",
            String(active)
          );

        });

        panels.forEach(panel => {

          panel.hidden =
            panel.id !== target;

        });

      }
    );

  });
}


/* ============================================================
   PROFILE
   ============================================================ */

async function loadProfile(user) {

  const emailElement =
    $("profileEmail");

  if (emailElement) {
    emailElement.textContent =
      user.email || "—";
  }


  const userRef =
    doc(
      db,
      "users",
      user.uid
    );


  let snapshot;

  try {

    snapshot =
      await withTimeout(
        getDoc(userRef),
        10000
      );

  } catch (error) {

    console.error(
      "Firestore profile read failed:",
      error
    );

    renderProfileError(error);

    return {};
  }


  /* ==========================================================
     CREATE PROFILE IF MISSING
     ========================================================== */

  if (!snapshot.exists()) {

    const fallbackData = {

      name:
        user.displayName ||
        (
          user.email
            ? user.email.split("@")[0]
            : "KRUZLY Member"
        ),

      email:
        user.email || null,

      phone: null,

      age: null,

      licenseURL: null,

      licenseStatus:
        "not_submitted",

      aadharURL: null,

      aadharStatus:
        "not_submitted",

      role:
        "customer",

      createdAt:
        serverTimestamp()
    };


    try {

      await withTimeout(
        setDoc(
          userRef,
          fallbackData,
          {
            merge: true
          }
        ),
        10000
      );

    } catch (error) {

      console.error(
        "Could not create user profile:",
        error
      );

    }


    renderProfileData(
      fallbackData,
      user
    );

    return fallbackData;
  }


  /* ==========================================================
     EXISTING PROFILE
     ========================================================== */

  const data =
    snapshot.data() || {};

  console.log(
    "KRUZLY profile loaded:",
    data
  );


  renderProfileData(
    data,
    user
  );


  return data;
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


  const licenseStatus =
    String(
      data.licenseStatus ||
      "not_submitted"
    ).toLowerCase();


  const aadharStatus =
    String(
      data.aadharStatus ||
      "not_submitted"
    ).toLowerCase();


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
      aadharStatus === "verified"
    ) {

      badge.textContent =
        "Verified Account";

      badge.classList.add(
        "verified"
      );

    } else if (
      licenseStatus === "rejected" ||
      aadharStatus === "rejected"
    ) {

      badge.textContent =
        "Verification Required";

      badge.classList.add(
        "rejected"
      );

    } else if (
      licenseStatus === "pending" ||
      aadharStatus === "pending"
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

  if (data.licenseURL) {

    await loadProtectedMediaPreview(
      user,
      data.licenseURL,
      $("licensePreview")
    );
  }


  if (data.aadharURL) {

    await loadProtectedMediaPreview(
      user,
      data.aadharURL,
      $("aadharPreview")
    );
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

        await withTimeout(

          setDoc(

            doc(
              db,
              "users",
              user.uid
            ),

            {

              name,

              phone:
                phone || null,

              age:
                age || null,

              email:
                user.email || null,

              updatedAt:
                serverTimestamp()

            },

            {
              merge: true
            }
          ),

          10000
        );


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
            phone ||
            "Phone not added";
        }

        if ($("profileAge")) {
          $("profileAge").textContent =
            age
              ? `${age} yrs`
              : "Not added";
        }


        profileData.name =
          name;

        profileData.phone =
          phone || null;

        profileData.age =
          age || null;


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

    const bookingsQuery =
      query(
        collection(
          db,
          "bookings"
        ),

        where(
          "userId",
          "==",
          userId
        )
      );


    const snapshot =
      await withTimeout(
        getDocs(bookingsQuery),
        10000
      );


    const bookings =
      snapshot.docs.map(
        item => ({
          id: item.id,
          ...item.data()
        })
      );


    bookings.sort(
      (a, b) => {

        const dateA =
          toMillis(
            a.createdAt ||
            a.pickupDate
          );

        const dateB =
          toMillis(
            b.createdAt ||
            b.pickupDate
          );

        return dateB - dateA;
      }
    );


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


    container.innerHTML =
      bookings
        .map(renderBooking)
        .join("");


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
    status === "pending"
  ) {

    statusClass =
      "pending";

  } else if (
    status === "cancelled" ||
    status === "rejected"
  ) {

    statusClass =
      "rejected";
  }


  const vehicleName =
    booking.vehicleName ||
    booking.carName ||
    "Rental Vehicle";


  const bookingRef =
    booking.bookingRef ||
    booking.reference ||
    booking.id;


  const pickup =
    booking.pickupDate ||
    booking.startDate ||
    "—";


  const drop =
    booking.dropDate ||
    booking.returnDate ||
    booking.endDate ||
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
            status.replaceAll(
              "_",
              " "
            )
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
            Amount
          </span>

          <strong>
            ${escapeHtml(
              formatINR(amount)
            )}
          </strong>

        </div>


        <div class="booking-detail">

          <span>
            Vehicle
          </span>

          <strong>
            ${escapeHtml(
              booking.vehicleReg ||
              "—"
            )}
          </strong>

        </div>

      </div>


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


        /* ====================================================
           SAVE SERVER FILE URL IN FIRESTORE
           ==================================================== */

        await withTimeout(

          setDoc(

            doc(
              db,
              "users",
              user.uid
            ),

            {

              [config.urlField]:
                mediaUrl,

              [config.statusField]:
                "pending",

              documentsUpdatedAt:
                serverTimestamp()

            },

            {
              merge: true
            }
          ),

          10000
        );


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

onAuthStateChanged(
  auth,
  async user => {

    console.log(
      "KRUZLY auth state:",
      user
        ? {
            uid: user.uid,
            email: user.email
          }
        : "NOT LOGGED IN"
    );


    /* ========================================================
       NOT LOGGED IN
       ======================================================== */

    if (!user) {

      window.location.href =
        "index.html?next=profile.html";

      return;
    }


    try {

      /* ======================================================
         TABS
         ====================================================== */

      initTabs();


      /* ======================================================
         PROFILE
         ====================================================== */

      const profileData =
        await loadProfile(user);


      /* ======================================================
         EDIT PROFILE
         ====================================================== */

      initEditProfile(
        user,
        profileData || {}
      );


      /* ======================================================
         BOOKINGS
         ====================================================== */

      loadBookings(
        user.uid
      );


      /* ======================================================
         LICENSE
         ====================================================== */

      initDocumentUpload(
        user,
        {

          inputId:
            "licenseFile",

          buttonId:
            "licenseUploadBtn",

          previewId:
            "licensePreview",

          statusId:
            "licenseUploadStatus",

          pillId:
            "licenseStatusPill",

          /*
             This is the category accepted by:

             server/routes/media.js
          */

          serverCategory:
            "license_doc",

          urlField:
            "licenseURL",

          statusField:
            "licenseStatus"

        }
      );


      /* ======================================================
         AADHAAR
         ====================================================== */

      initDocumentUpload(
        user,
        {

          inputId:
            "aadharFile",

          buttonId:
            "aadharUploadBtn",

          previewId:
            "aadharPreview",

          statusId:
            "aadharUploadStatus",

          pillId:
            "aadharStatusPill",

          serverCategory:
            "aadhar_doc",

          urlField:
            "aadharURL",

          statusField:
            "aadharStatus"

        }
      );


      /* ======================================================
         LOGOUT
         ====================================================== */

      initLogout();


    } catch (error) {

      console.error(
        "KRUZLY profile initialization failed:",
        error
      );

    }

  }
);