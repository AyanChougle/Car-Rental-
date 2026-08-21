// ============================================================
// KRUIZLY - PAYMENT / CHECKOUT
// COMPLETE REPLACEMENT - LOCAL SQL MEDIA SERVER
// ============================================================
//
// Payment flow:
//
// 1. Customer opens checkout
// 2. Customer chooses UPI / Bank Transfer
// 3. Customer makes payment
// 4. Customer enters UTR / transaction ID
// 5. Customer selects payment screenshot
// 6. Screenshot uploads to Node.js media server
// 7. Node.js saves file to /uploads
// 8. SQLite saves media record
// 9. Firestore booking is updated
// 10. paymentStatus = pending_verification
//
// IMPORTANT:
//
// Firebase Storage is NOT used here.
//
// Firebase is used ONLY for:
// - Authentication
// - Firestore booking data
//
// Files are stored through:
//
// Browser
//    ↓
// Node.js /api/media/upload
//    ↓
// uploads/<firebaseUid>/<random-file>
//    ↓
// SQLite media.sqlite
//
// ============================================================

import { auth, db } from "./firebase-init.js";

import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import { PAYMENT_CONFIG } from "./payment-config.js";
import { formatBookingNumber } from "./booking-reference.js";

import "./nav-helper.js";


// ============================================================
// CONFIGURATION
// ============================================================
//
// Your Node server is running on PORT=4001.
//
// If you later deploy the API somewhere else, change this URL.
//
// You can also define:
//
// window.MEDIA_API_URL = "https://your-api-domain.com";
//
// before this script loads.
//
// ============================================================

const MEDIA_API_URL =
  window.MEDIA_API_URL ||
  "http://localhost:4001";


// ============================================================
// CONSTANTS
// ============================================================

const PAYMENT_SCREENSHOT_MAX_SIZE =
  5 * 1024 * 1024;

const ALLOWED_SCREENSHOT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];


// ============================================================
// HELPERS
// ============================================================

function $(id) {
  return document.getElementById(id);
}


function formatCurrency(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-IN").format(
    amount
  );
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  try {
    return new Date(
      `${value}T00:00:00`
    ).toLocaleDateString(
      "en-IN",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );
  } catch {
    return "—";
  }
}


function setStatus(
  message,
  type = ""
) {
  const element =
    $("paymentStatus");

  if (!element) {
    return;
  }

  element.className =
    "form-status";

  if (type) {
    element.classList.add(type);
  }

  element.textContent =
    message;
}


function setButtonState(
  disabled,
  text = "Submit Payment Reference"
) {
  const button =
    $("submitPaymentBtn");

  if (!button) {
    return;
  }

  button.disabled =
    disabled;

  button.textContent =
    text;
}


function getFileExtension(file) {
  const mimeMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return (
    mimeMap[file.type] ||
    file.name
      ?.split(".")
      .pop()
      ?.toLowerCase() ||
    "jpg"
  );
}


function getMediaApiUrl(path) {
  return (
    `${MEDIA_API_URL}${path}`
  );
}


let bookingsRedirectTimer = null;


function redirectToBookings(
  delay = 0
) {
  if (bookingsRedirectTimer) {
    clearTimeout(
      bookingsRedirectTimer
    );
  }

  const redirect = () => {
    // replace() prevents the Back button from returning to a payment
    // form that has already been submitted.
    window.location.replace(
      "profile.html?tab=bookings"
    );
  };

  if (delay > 0) {
    bookingsRedirectTimer =
      setTimeout(
        redirect,
        delay
      );

    return;
  }

  redirect();
}


// ============================================================
// BOOKING ID
// ============================================================

const urlParams =
  new URLSearchParams(
    window.location.search
  );

const bookingId =
  urlParams.get("booking");


// ============================================================
// PAGE ELEMENTS
// ============================================================

const paymentForm =
  $("paymentForm");

const paymentVehicleName =
  $("paymentVehicleName");

const paymentVehicleIcon =
  $("paymentVehicleIcon");

const paymentStatus =
  $("paymentStatus");

const payButton =
  $("submitPaymentBtn");

const upiTab =
  $("upiTab");

const bankTab =
  $("offlineTab");

const upiSection =
  $("upiPaymentSection");

const bankSection =
  $("offlinePaymentSection");

const qrContainer =
  $("upiQr");

const upiIdElement =
  $("upiId");

const openUpiButton =
  $("openUpiBtn");

const screenshotInput =
  $("paymentScreenshot");

const screenshotPreview =
  $("paymentPreview");


// ============================================================
// ACTIVE PAYMENT METHOD
// ============================================================

let activeMethod =
  "upi";


// ============================================================
// UPI URI
// ============================================================

function buildUpiUri(
  amount,
  currentBookingId
) {
  const upiId =
    PAYMENT_CONFIG?.upi?.id ||
    "";

  const payeeName =
    PAYMENT_CONFIG?.upi?.payeeName ||
    "KRUIZLY";

  const safeAmount =
    Number(amount || 0)
      .toFixed(2);

  const transactionNote =
    `KRUIZLY Booking ${String(
      formatBookingNumber(currentBookingId)
    )}`;

  const params =
    new URLSearchParams({
      pa: upiId,
      pn: payeeName,
      am: safeAmount,
      cu: "INR",
      tn: transactionNote,
      tr: String(
        currentBookingId
      ),
    });

  return (
    `upi://pay?${params.toString()}`
  );
}


// ============================================================
// ERROR PAGE
// ============================================================

function showError(message) {
  console.error(
    "PAYMENT ERROR:",
    message
  );

  if (paymentVehicleName) {
    paymentVehicleName.textContent =
      message;
  }

  setStatus(
    message,
    "form-status--error"
  );
}


// ============================================================
// HIDE PAYMENT INTERFACE
// ============================================================

function hidePaymentInterface() {
  if (upiTab) {
    upiTab.style.display =
      "none";
  }

  if (bankTab) {
    bankTab.style.display =
      "none";
  }

  if (upiSection) {
    upiSection.style.display =
      "none";
  }

  if (bankSection) {
    bankSection.style.display =
      "none";
  }

  if (paymentForm) {
    paymentForm.hidden =
      true;
  }
}


// ============================================================
// PAYMENT METHOD
// ============================================================

function setActiveMethod(
  method
) {
  activeMethod =
    method === "bank"
      ? "bank"
      : "upi";

  const isUpi =
    activeMethod === "upi";


  if (upiTab) {
    upiTab.classList.toggle(
      "active",
      isUpi
    );

    upiTab.setAttribute(
      "aria-selected",
      String(isUpi)
    );
  }


  if (bankTab) {
    bankTab.classList.toggle(
      "active",
      !isUpi
    );

    bankTab.setAttribute(
      "aria-selected",
      String(!isUpi)
    );
  }


  if (upiSection) {
    upiSection.style.display =
      isUpi
        ? ""
        : "none";
  }


  if (bankSection) {
    bankSection.style.display =
      isUpi
        ? "none"
        : "";
  }
}


// ============================================================
// PAYMENT TABS
// ============================================================

function initialisePaymentTabs() {
  if (upiTab) {
    upiTab.type =
      "button";

    upiTab.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        setActiveMethod(
          "upi"
        );
      }
    );
  }


  if (bankTab) {
    bankTab.type =
      "button";

    bankTab.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        setActiveMethod(
          "bank"
        );
      }
    );
  }
}


// ============================================================
// OPEN UPI APP
// ============================================================

function openUPIApp(
  upiUri
) {
  if (!upiUri) {
    alert(
      "UPI payment is not configured."
    );

    return;
  }

  window.location.href =
    upiUri;
}


// ============================================================
// GENERATE QR
// ============================================================

function generateQRCode(
  upiUri
) {
  if (!qrContainer) {
    console.warn(
      "#upiQr was not found."
    );

    return;
  }

  qrContainer.innerHTML =
    "";


  if (
    typeof window.QRCode ===
    "undefined"
  ) {
    console.error(
      "QRCode library is not loaded."
    );

    qrContainer.innerHTML = `
      <div style="
        padding:20px;
        text-align:center;
        color:#111;
        font-size:13px;
      ">
        QR code unavailable.
      </div>
    `;

    return;
  }


  try {
    new window.QRCode(
      qrContainer,
      {
        text: upiUri,
        width: 164,
        height: 164,
        colorDark:
          "#000000",
        colorLight:
          "#ffffff",
        correctLevel:
          window.QRCode.CorrectLevel.M,
      }
    );

    console.log(
      "UPI QR generated."
    );

  } catch (error) {
    console.error(
      "QR ERROR:",
      error
    );

    qrContainer.innerHTML = `
      <div style="
        padding:20px;
        text-align:center;
        color:#111;
        font-size:13px;
      ">
        Could not generate QR.
      </div>
    `;
  }
}


// ============================================================
// UPI BUTTONS
// ============================================================

function initialiseUPIButtons(
  upiUri
) {
  if (openUpiButton) {
    openUpiButton.type =
      "button";

    openUpiButton.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        openUPIApp(
          upiUri
        );
      }
    );
  }


  document
    .querySelectorAll(
      ".upi-app-btn"
    )
    .forEach(
      (button) => {
        button.type =
          "button";

        button.addEventListener(
          "click",
          (event) => {
            event.preventDefault();

            openUPIApp(
              upiUri
            );
          }
        );
      }
    );
}


// ============================================================
// SCREENSHOT PREVIEW
// ============================================================

function initialiseScreenshotPreview() {
  if (
    !screenshotInput ||
    !screenshotPreview
  ) {
    console.warn(
      "Payment screenshot input/preview not found.",
      {
        input:
          !!screenshotInput,
        preview:
          !!screenshotPreview,
      }
    );

    return;
  }


  screenshotInput.addEventListener(
    "change",
    () => {
      const file =
        screenshotInput.files?.[0];


      screenshotPreview.innerHTML =
        "";


      if (!file) {
        return;
      }


      // ------------------------------------------------------
      // TYPE
      // ------------------------------------------------------

      if (
        !ALLOWED_SCREENSHOT_TYPES.includes(
          file.type
        )
      ) {
        screenshotInput.value =
          "";

        screenshotPreview.innerHTML = `
          <div class="form-status form-status--error">
            Please select a JPG, PNG, or WebP image.
          </div>
        `;

        return;
      }


      // ------------------------------------------------------
      // SIZE
      // ------------------------------------------------------

      if (
        file.size >
        PAYMENT_SCREENSHOT_MAX_SIZE
      ) {
        screenshotInput.value =
          "";

        screenshotPreview.innerHTML = `
          <div class="form-status form-status--error">
            Payment screenshot must be smaller than 5 MB.
          </div>
        `;

        return;
      }


      // ------------------------------------------------------
      // PREVIEW
      // ------------------------------------------------------

      const image =
        document.createElement(
          "img"
        );

      image.src =
        URL.createObjectURL(
          file
        );

      image.alt =
        "Payment screenshot preview";

      image.style.maxWidth =
        "100%";

      image.style.maxHeight =
        "300px";

      image.style.objectFit =
        "contain";

      image.style.display =
        "block";

      image.style.margin =
        "12px auto";

      screenshotPreview.appendChild(
        image
      );


      console.log(
        "Payment screenshot selected:",
        file.name,
        file.size,
        file.type
      );
    }
  );
}


// ============================================================
// VEHICLE IMAGE
// ============================================================

async function loadVehicleImage(
  booking
) {
  try {
    const catalog =
      window.fleetVehicles ||
      [];

    const vehicle =
      catalog.find(
        (item) =>
          item.regNo ===
          booking.vehicleReg
      );


    if (
      !vehicle ||
      typeof window.fleetImagePath !==
        "function"
    ) {
      return;
    }


    const imagePath =
      window.fleetImagePath(
        vehicle
      );


    const container =
      $("paymentVehicleImage");


    if (
      !container ||
      !imagePath
    ) {
      return;
    }


    const image =
      document.createElement(
        "img"
      );

    image.src =
      imagePath;

    image.alt =
      booking.vehicleName ||
      "Vehicle";


    image.onload =
      () => {
        if (paymentVehicleIcon) {
          paymentVehicleIcon.style.display =
            "none";
        }
      };


    image.onerror =
      () => {
        image.remove();
      };


    container.prepend(
      image
    );

  } catch (error) {
    console.warn(
      "Vehicle image failed:",
      error
    );
  }
}


// ============================================================
// DISPLAY BOOKING DETAILS
// ============================================================

function displayBooking(
  booking
) {
  if (paymentVehicleName) {
    paymentVehicleName.textContent =
      booking.vehicleName ||
      "Vehicle";
  }


  if (paymentVehicleIcon) {
    paymentVehicleIcon.textContent = "";
  }


  if ($("paymentBookingId")) {
    $("paymentBookingId").textContent =
      formatBookingNumber({
        ...booking,
        id: bookingId,
      });
  }


  if ($("paymentPickup")) {
    $("paymentPickup").textContent =
      booking.pickupLocation ||
      booking.pickup ||
      "Gavson Business Park, Ghansoli";
  }


  if ($("paymentDrop")) {
    $("paymentDrop").textContent =
      booking.dropLocation ||
      booking.drop ||
      "Gavson Business Park, Ghansoli";
  }


  if ($("paymentDateRange")) {
    $("paymentDateRange").textContent =
      `${formatDate(
        booking.pickupDate
      )} – ${formatDate(
        booking.dropDate
      )}`;
  }


  let duration =
    booking.duration ||
    booking.durationDays;


  if (
    !duration &&
    booking.pickupDate &&
    booking.dropDate
  ) {
    const start =
      new Date(
        `${booking.pickupDate}T00:00:00`
      );

    const end =
      new Date(
        `${booking.dropDate}T00:00:00`
      );


    if (
      !isNaN(
        start.getTime()
      ) &&
      !isNaN(
        end.getTime()
      )
    ) {
      duration =
        Math.max(
          1,
          Math.ceil(
            (
              end.getTime() -
              start.getTime()
            ) /
            (
              1000 *
              60 *
              60 *
              24
            )
          )
        );
    }
  }


  if ($("paymentDuration")) {
    $("paymentDuration").textContent =
      duration
        ? `${duration} day${
            Number(duration) === 1
              ? ""
              : "s"
          }`
        : "1 day";
  }
}


// ============================================================
// INITIALISE PAYMENT UI
// ============================================================

async function initialisePaymentUI(
  booking
) {
  console.log(
    "Initialising payment UI..."
  );


  displayBooking(
    booking
  );


  await loadVehicleImage(
    booking
  );


  // ----------------------------------------------------------
  // TOTAL
  // ----------------------------------------------------------

  const totalAmount =
    Number(
      booking.totalAmount ??
      booking.amount ??
      0
    );


  const paymentAmount = Number(
    booking.paymentAmount ??
    (booking.paymentPlan === "advance" ? 500 : totalAmount)
  );

  const remainingBalance = Math.max(
    0,
    Number(booking.remainingBalance ?? totalAmount - paymentAmount)
  );

  console.log("Booking total:", totalAmount, "Payment due:", paymentAmount);


  if ($("paymentAmount")) {
    $("paymentAmount").textContent =
      `₹${formatCurrency(
        paymentAmount
      )}`;
  }


  if ($("upiAmount")) {
    $("upiAmount").textContent =
      formatCurrency(
        paymentAmount
      );
  }


  // ----------------------------------------------------------
  // UPI
  // ----------------------------------------------------------

  const upiId =
    PAYMENT_CONFIG?.upi?.id ||
    "";


  if (upiIdElement) {
    upiIdElement.textContent =
      upiId ||
      "UPI ID not configured";
  }


  const upiUri =
    buildUpiUri(
      paymentAmount,
      bookingId
    );


  if (
    paymentAmount > 0 &&
    upiId
  ) {
    generateQRCode(
      upiUri
    );

  } else if (qrContainer) {
    qrContainer.innerHTML = `
      <div style="
        padding:20px;
        text-align:center;
        color:#111;
        font-size:13px;
      ">
        Payment amount unavailable.
      </div>
    `;
  }


  initialiseUPIButtons(
    upiUri
  );


  setActiveMethod(
    "upi"
  );

  if ($("paymentPlanNote")) {
    $("paymentPlanNote").textContent =
      booking.paymentPlan === "advance"
        ? `₹${formatCurrency(remainingBalance)} will remain payable at pickup.`
        : "Your booking is being paid in full today.";
  }
}


// ============================================================
// GET FIREBASE ID TOKEN
// ============================================================
//
// This is the bridge between Firebase Auth and your Node API.
//
// Node's middleware/auth.js expects:
//
// Authorization: Bearer <Firebase ID token>
//
// ============================================================

async function getAuthToken(
  currentUser
) {
  if (!currentUser) {
    throw new Error(
      "You must be signed in to submit payment."
    );
  }


  try {
    const token =
      await currentUser.getIdToken(
        true
      );


    if (!token) {
      throw new Error(
        "Could not obtain your authentication token."
      );
    }


    return token;

  } catch (error) {
    console.error(
      "AUTH TOKEN ERROR:",
      error
    );

    throw new Error(
      "Your login session could not be verified. Please sign in again."
    );
  }
}


// ============================================================
// UPLOAD PAYMENT SCREENSHOT TO NODE + SQLITE
// ============================================================
//
// POST /api/media/upload
//
// multipart/form-data:
//
// file       = screenshot
// category   = payment_screenshot
// relatedId  = bookingId
//
// Authorization:
// Bearer <Firebase ID token>
//
// ============================================================

async function uploadPaymentScreenshot(
  file,
  currentUser,
  reference
) {
  console.log(
    "Starting local SQL media upload..."
  );


  // ----------------------------------------------------------
  // GET AUTH TOKEN
  // ----------------------------------------------------------

  const token =
    await getAuthToken(
      currentUser
    );


  // ----------------------------------------------------------
  // FORM DATA
  // ----------------------------------------------------------

  const formData =
    new FormData();


  formData.append(
    "file",
    file
  );


  formData.append(
    "category",
    "payment_screenshot"
  );


  formData.append(
    "relatedId",
    String(bookingId)
  );


  // ----------------------------------------------------------
  // REQUEST
  // ----------------------------------------------------------

  const response =
    await fetch(
      getMediaApiUrl(
        "/api/media/upload"
      ),
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,
        },

        body: formData,
      }
    );


  // ----------------------------------------------------------
  // RESPONSE
  // ----------------------------------------------------------

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }


  if (!response.ok) {
    console.error(
      "MEDIA SERVER ERROR:",
      response.status,
      data
    );


    const message =
      data?.error ||
      `Media server returned HTTP ${response.status}.`;


    throw new Error(
      message
    );
  }


  if (
    !data ||
    !data.id
  ) {
    console.error(
      "Invalid media server response:",
      data
    );

    throw new Error(
      "The screenshot uploaded, but the media server did not return a file ID."
    );
  }


  console.log(
    "LOCAL SQL MEDIA UPLOAD COMPLETE:",
    data
  );


  return data;
}


// ============================================================
// DELETE MEDIA FILE IF FIRESTORE UPDATE FAILS
// ============================================================
//
// This prevents an orphan screenshot from staying in uploads/
// if the Firestore booking update fails.
//
// ============================================================

async function deleteUploadedMedia(
  mediaId,
  currentUser
) {
  if (!mediaId) {
    return;
  }


  try {
    const token =
      await getAuthToken(
        currentUser
      );


    const response =
      await fetch(
        getMediaApiUrl(
          `/api/media/${encodeURIComponent(
            mediaId
          )}`
        ),
        {
          method:
            "DELETE",

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );


    if (!response.ok) {
      console.warn(
        "Could not clean up uploaded payment screenshot:",
        response.status
      );
    } else {
      console.log(
        "Uploaded screenshot cleaned up."
      );
    }

  } catch (error) {
    console.warn(
      "Media cleanup failed:",
      error
    );
  }
}


// ============================================================
// SUBMIT PAYMENT
// ============================================================

async function submitPayment(
  event,
  booking,
  currentUser
) {
  event.preventDefault();
  event.stopPropagation();


  console.log(
    "========================================"
  );

  console.log(
    "PAYMENT SUBMISSION STARTED"
  );

  console.log(
    "Booking:",
    bookingId
  );

  console.log(
    "Payment method:",
    activeMethod
  );

  console.log(
    "Media API:",
    MEDIA_API_URL
  );

  console.log(
    "========================================"
  );


  const refInput =
    $("upiReference");

  const fileInput =
    $("paymentScreenshot");


  // ----------------------------------------------------------
  // CHECK INPUTS
  // ----------------------------------------------------------

  if (!refInput) {
    console.error(
      "Missing #upiReference"
    );

    setStatus(
      "Payment reference field is missing from the page.",
      "form-status--error"
    );

    return;
  }


  if (!fileInput) {
    console.error(
      "Missing #paymentScreenshot"
    );

    setStatus(
      "Payment screenshot field is missing from the page.",
      "form-status--error"
    );

    return;
  }


  const reference =
    refInput.value.trim();

  const file =
    fileInput.files?.[0];


  // ----------------------------------------------------------
  // REFERENCE VALIDATION
  // ----------------------------------------------------------

  if (!reference) {
    setStatus(
      "Enter your UTR / transaction ID first.",
      "form-status--error"
    );

    refInput.focus();

    return;
  }


  if (
    reference.length < 4
  ) {
    setStatus(
      "Please enter a valid payment reference / transaction ID.",
      "form-status--error"
    );

    refInput.focus();

    return;
  }


  if (
    reference.length > 200
  ) {
    setStatus(
      "Payment reference is too long.",
      "form-status--error"
    );

    refInput.focus();

    return;
  }


  // ----------------------------------------------------------
  // FILE REQUIRED
  // ----------------------------------------------------------

  if (!file) {
    setStatus(
      "Please upload a screenshot of the successful payment.",
      "form-status--error"
    );

    return;
  }


  // ----------------------------------------------------------
  // FILE TYPE
  // ----------------------------------------------------------

  if (
    !ALLOWED_SCREENSHOT_TYPES.includes(
      file.type
    )
  ) {
    setStatus(
      "Please upload a JPG, PNG, or WebP screenshot.",
      "form-status--error"
    );

    return;
  }


  // ----------------------------------------------------------
  // FILE SIZE
  // ----------------------------------------------------------

  if (
    file.size >
    PAYMENT_SCREENSHOT_MAX_SIZE
  ) {
    setStatus(
      "Payment screenshot must be smaller than 5 MB.",
      "form-status--error"
    );

    return;
  }


  // ----------------------------------------------------------
  // AUTHORIZATION
  // ----------------------------------------------------------

  if (
    !booking ||
    !booking.userId ||
    booking.userId !==
      currentUser.uid
  ) {
    setStatus(
      "You are not authorized to submit payment for this booking.",
      "form-status--error"
    );

    return;
  }


  // ----------------------------------------------------------
  // DISABLE SUBMIT
  // ----------------------------------------------------------

  setButtonState(
    true,
    "Uploading screenshot..."
  );


  setStatus(
    "Uploading your payment screenshot..."
  );


  let uploadedMediaId =
    null;


  try {

    // ========================================================
    // STEP 1 — UPLOAD TO NODE + SQLITE
    // ========================================================

    const media =
      await uploadPaymentScreenshot(
        file,
        currentUser,
        reference
      );


    uploadedMediaId =
      media.id;


    console.log(
      "Payment screenshot media ID:",
      uploadedMediaId
    );


    // ========================================================
    // STEP 2 — UPDATE FIRESTORE BOOKING
    // ========================================================

    setButtonState(
      true,
      "Saving payment..."
    );


    setStatus(
      "Screenshot uploaded. Saving your payment reference..."
    );


    await updateDoc(
      doc(
        db,
        "bookings",
        bookingId
      ),
      {
        paymentMethod:
          activeMethod,

        paymentPlan:
          booking.paymentPlan || "full",

        paymentAmount:
          Number(booking.paymentAmount ?? booking.totalAmount ?? 0),

        paymentAmountPaid:
          Number(booking.paymentAmount ?? booking.totalAmount ?? 0),

        remainingBalance:
          Number(booking.remainingBalance ?? 0),

        paymentRef:
          reference,

        // IMPORTANT:
        // This is NOT a Firebase Storage URL.
        //
        // It is the SQLite media row ID.
        paymentScreenshotMediaId:
          String(
            uploadedMediaId
          ),

        // Keep this useful metadata in Firestore.
        paymentScreenshotCategory:
          "payment_screenshot",

        paymentStatus:
          "pending_verification",

        paymentSubmittedAt:
          serverTimestamp(),

        paymentSubmittedBy:
          currentUser.uid,
      }
    );


    console.log(
      "FIRESTORE PAYMENT UPDATE COMPLETE"
    );


    // ========================================================
    // STEP 3 — SUCCESS
    // ========================================================

    setButtonState(
      true,
      "Payment Submitted"
    );


    setStatus(
      "Payment submitted successfully. Your booking is now pending verification.",
      "form-status--success"
    );


    // ========================================================
    // STEP 4 — REDIRECT
    // ========================================================

    redirectToBookings(
      700
    );


  } catch (error) {

    console.error(
      "========================================"
    );

    console.error(
      "PAYMENT SUBMISSION ERROR"
    );

    console.error(
      error
    );

    console.error(
      "Message:",
      error?.message
    );

    console.error(
      "========================================"
    );


    // --------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------
    //
    // If the screenshot successfully reached SQLite but
    // Firestore failed afterward, delete the media row/file.
    //
    // --------------------------------------------------------

    if (
      uploadedMediaId
    ) {
      await deleteUploadedMedia(
        uploadedMediaId,
        currentUser
      );
    }


    // --------------------------------------------------------
    // USER MESSAGE
    // --------------------------------------------------------

    let message =
      "Couldn't submit your payment. Please try again.";


    if (
      error?.message
    ) {
      message =
        error.message;
    }


    // --------------------------------------------------------
    // NETWORK ERRORS
    // --------------------------------------------------------

    if (
      error instanceof
      TypeError
    ) {
      message =
        `Could not connect to the payment upload server at ${MEDIA_API_URL}. Make sure your Node.js server is running.`;
    }


    setStatus(
      message,
      "form-status--error"
    );


    setButtonState(
      false,
      "Submit Payment Reference"
    );
  }
}


// ============================================================
// FORM INITIALISATION
// ============================================================

function initialisePaymentForm(
  booking,
  currentUser
) {
  if (!paymentForm) {
    console.error(
      "CRITICAL: #paymentForm does not exist."
    );

    return;
  }


  // ----------------------------------------------------------
  // PREVENT DUPLICATE LISTENER
  // ----------------------------------------------------------

  if (
    paymentForm.dataset.paymentHandlerAttached ===
    "true"
  ) {
    console.warn(
      "Payment submit handler already attached."
    );

    return;
  }


  paymentForm.dataset.paymentHandlerAttached =
    "true";


  // ----------------------------------------------------------
  // FORM SUBMIT
  // ----------------------------------------------------------

  paymentForm.addEventListener(
    "submit",
    (event) => {
      submitPayment(
        event,
        booking,
        currentUser
      );
    }
  );


  console.log(
    "Payment form listener attached."
  );
}


// ============================================================
// START PAYMENT PAGE
// ============================================================

async function startPaymentPage() {
  console.log(
    "========================================"
  );

  console.log(
    "KRUIZLY PAYMENT PAGE STARTING"
  );

  console.log(
    "Booking ID:",
    bookingId
  );

  console.log(
    "Media API:",
    MEDIA_API_URL
  );

  console.log(
    "========================================"
  );


  // ----------------------------------------------------------
  // BOOKING ID
  // ----------------------------------------------------------

  if (!bookingId) {
    showError(
      "No booking to pay for. Please start your booking from the fleet page."
    );

    return;
  }


  // ----------------------------------------------------------
  // AUTH
  // ----------------------------------------------------------

  onAuthStateChanged(
    auth,
    async (user) => {
      console.log(
        "AUTH STATE:",
        user
          ? user.uid
          : "NOT LOGGED IN"
      );


      // --------------------------------------------------------
      // NOT LOGGED IN
      // --------------------------------------------------------

      if (!user) {
        const next =
          `payment.html?booking=${encodeURIComponent(
            bookingId
          )}`;


        window.location.href =
          `index.html?next=${encodeURIComponent(
            next
          )}`;


        return;
      }


      // --------------------------------------------------------
      // LOAD BOOKING
      // --------------------------------------------------------

      let bookingSnapshot;


      try {
        console.log(
          "Loading booking..."
        );


        bookingSnapshot =
          await getDoc(
            doc(
              db,
              "bookings",
              bookingId
            )
          );

      } catch (error) {
        console.error(
          "BOOKING LOAD ERROR:",
          error
        );


        showError(
          "Couldn't load this booking. Please try again."
        );


        return;
      }


      // --------------------------------------------------------
      // BOOKING DOES NOT EXIST
      // --------------------------------------------------------

      if (
        !bookingSnapshot.exists()
      ) {
        showError(
          "That booking does not exist."
        );

        return;
      }


      const booking =
        bookingSnapshot.data();


      console.log(
        "BOOKING LOADED:",
        booking
      );


      // --------------------------------------------------------
      // SECURITY
      // --------------------------------------------------------

      if (
        booking.userId !==
        user.uid
      ) {
        showError(
          "This booking does not belong to your account."
        );

        return;
      }


      // --------------------------------------------------------
      // ALREADY PAID
      // --------------------------------------------------------

      if (
        booking.paymentStatus ===
          "paid" ||
        booking.paymentStatus ===
          "advance_paid" ||
        booking.paymentStatus ===
          "pay_at_pickup"
      ) {
        if (paymentVehicleName) {
          paymentVehicleName.textContent =
            booking.vehicleName ||
            "Your vehicle";
        }


        setStatus(
          "This booking is already confirmed. Check My Bookings for details."
        );


        hidePaymentInterface();

        redirectToBookings(
          900
        );

        return;
      }


      // --------------------------------------------------------
      // ALREADY SUBMITTED
      // --------------------------------------------------------

      if (
        booking.paymentStatus ===
        "pending_verification"
      ) {
        if (paymentVehicleName) {
          paymentVehicleName.textContent =
            booking.vehicleName ||
            "Your vehicle";
        }


        setStatus(
          "We've received your payment reference and are verifying it. Check My Bookings for the latest status."
        );


        hidePaymentInterface();

        redirectToBookings(
          900
        );

        return;
      }


      // --------------------------------------------------------
      // INITIALISE UI
      // --------------------------------------------------------

      await initialisePaymentUI(
        booking
      );


      // --------------------------------------------------------
      // TABS
      // --------------------------------------------------------

      initialisePaymentTabs();


      // --------------------------------------------------------
      // SCREENSHOT PREVIEW
      // --------------------------------------------------------

      initialiseScreenshotPreview();


      // --------------------------------------------------------
      // FORM
      // --------------------------------------------------------

      initialisePaymentForm(
        booking,
        user
      );


      console.log(
        "========================================"
      );

      console.log(
        "KRUIZLY PAYMENT PAGE READY"
      );

      console.log(
        "Local media API:",
        MEDIA_API_URL
      );

      console.log(
        "========================================"
      );
    }
  );
}


// ============================================================
// RUN
// ============================================================

startPaymentPage();
