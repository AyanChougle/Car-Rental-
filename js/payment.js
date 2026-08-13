// ============================================================
// CARRENTPE - PAYMENT / CHECKOUT
// ============================================================
//
// Manual payment verification:
//
// 1. Customer opens checkout
// 2. Customer chooses UPI or Bank Transfer
// 3. Customer makes payment
// 4. Customer enters transaction / UTR
// 5. Customer uploads screenshot
// 6. Firestore paymentStatus = pending_verification
//
// IMPORTANT:
// This is manual payment verification.
// It is NOT an automatic payment gateway.
// ============================================================

import { auth, db, storage } from "./firebase-init.js";

import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

import { PAYMENT_CONFIG } from "./payment-config.js";

import "./nav-helper.js";


// ============================================================
// HELPERS
// ============================================================

function $(id) {
  return document.getElementById(id);
}


function formatCurrency(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-IN").format(amount);
}


function formatDate(iso) {
  if (!iso) return "—";

  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}


function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ============================================================
// URL / BOOKING
// ============================================================

const params = new URLSearchParams(window.location.search);

const bookingId = params.get("booking");


// ============================================================
// PAGE ELEMENTS
// ============================================================

const paymentForm = $("paymentForm");

const paymentStatus = $("paymentStatus");

const paymentVehicleName = $("paymentVehicleName");

const payButton = $("submitPaymentBtn");

const upiTab = $("upiTab");

const bankTab = $("offlineTab");

const upiSection = $("upiPaymentSection");

const bankSection = $("offlinePaymentSection");

const qrContainer = $("upiQr");

const upiIdElement = $("upiId");

const openUpiButton = $("openUpiBtn");


// ============================================================
// UPI URI
// ============================================================

function buildUpiUri(amount, bookingId) {

  const upiId = PAYMENT_CONFIG?.upi?.id || "";

  const payeeName =
    PAYMENT_CONFIG?.upi?.payeeName || "CARRENTPE";

  const safeAmount =
    Number(amount || 0).toFixed(2);

  const transactionNote =
    `CARRENTPE Booking ${String(bookingId)
      .slice(-6)
      .toUpperCase()}`;

  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: safeAmount,
    cu: "INR",
    tn: transactionNote,
    tr: String(bookingId),
  });

  return `upi://pay?${params.toString()}`;
}


// ============================================================
// ERROR
// ============================================================

function showError(message) {

  console.error(message);

  if (paymentVehicleName) {
    paymentVehicleName.textContent = message;
  }

  if (paymentStatus) {
    paymentStatus.textContent = message;
    paymentStatus.classList.add("form-status--error");
  }

  if (paymentForm) {
    paymentForm.hidden = true;
  }
}


// ============================================================
// HIDE PAYMENT INTERFACE
// ============================================================

function hidePaymentInterface() {

  if (upiTab) {
    upiTab.style.display = "none";
  }

  if (bankTab) {
    bankTab.style.display = "none";
  }

  if (upiSection) {
    upiSection.style.display = "none";
  }

  if (bankSection) {
    bankSection.style.display = "none";
  }

  if (paymentForm) {
    paymentForm.hidden = true;
  }
}


// ============================================================
// PAYMENT METHOD
// ============================================================

let activeMethod = "upi";


function setActiveMethod(method) {

  activeMethod =
    method === "bank"
      ? "bank"
      : "upi";

  const isUpi =
    activeMethod === "upi";


  // ----------------------------------------------------------
  // UPI TAB
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // BANK TAB
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // UPI PANEL
  // ----------------------------------------------------------

  if (upiSection) {

    upiSection.style.display =
      isUpi
        ? ""
        : "none";
  }


  // ----------------------------------------------------------
  // BANK PANEL
  // ----------------------------------------------------------

  if (bankSection) {

    bankSection.style.display =
      isUpi
        ? "none"
        : "block";
  }


  console.log(
    "Payment method:",
    activeMethod
  );
}


// ============================================================
// PAYMENT TABS
// ============================================================

if (upiTab) {

  upiTab.type = "button";

  upiTab.addEventListener(
    "click",
    function (event) {

      event.preventDefault();

      setActiveMethod("upi");
    }
  );
}


if (bankTab) {

  bankTab.type = "button";

  bankTab.addEventListener(
    "click",
    function (event) {

      event.preventDefault();

      setActiveMethod("bank");
    }
  );
}


// ============================================================
// OPEN UPI APP
// ============================================================

function openUPIApp(upiUri) {

  if (!upiUri) {

    alert("UPI payment is not configured.");

    return;
  }

  console.log(
    "Opening UPI:",
    upiUri
  );

  /*
   * IMPORTANT:
   *
   * This works on supported mobile devices where
   * a UPI application can handle upi:// links.
   *
   * Desktop Chrome cannot directly open Google Pay,
   * PhonePe, Paytm etc. through this protocol.
   *
   * On desktop, use the QR code.
   */

  window.location.href = upiUri;
}


// ============================================================
// QR CODE
// ============================================================

function generateQRCode(upiUri) {

  if (!qrContainer) {

    console.error(
      "QR container #upiQr was not found."
    );

    return;
  }


  qrContainer.innerHTML = "";


  if (
    typeof window.QRCode ===
    "undefined"
  ) {

    console.error(
      "QRCode library is not loaded."
    );

    qrContainer.innerHTML = `
      <div style="
        color:#111;
        text-align:center;
        font-size:12px;
        padding:20px;
      ">
        QR library unavailable.
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

        colorDark: "#000000",

        colorLight: "#ffffff",

        correctLevel:
          window.QRCode.CorrectLevel.M,
      }
    );


    console.log(
      "UPI QR generated successfully."
    );

  } catch (error) {

    console.error(
      "QR generation failed:",
      error
    );

    qrContainer.innerHTML = `
      <div style="
        color:#111;
        text-align:center;
        font-size:12px;
        padding:20px;
      ">
        QR generation failed.
      </div>
    `;
  }
}


// ============================================================
// UPI APP BUTTONS
// ============================================================

function setupUPIButtons(upiUri) {

  if (openUpiButton) {

    openUpiButton.type =
      "button";

    openUpiButton.addEventListener(
      "click",
      function (event) {

        event.preventDefault();

        openUPIApp(upiUri);
      }
    );
  }


  document
    .querySelectorAll(".upi-app-btn")
    .forEach((button) => {

      button.type = "button";

      button.addEventListener(
        "click",
        function (event) {

          event.preventDefault();

          openUPIApp(upiUri);
        }
      );
    });
}


// ============================================================
// PAYMENT SCREENSHOT PREVIEW
// ============================================================

function setupScreenshotPreview() {

  const fileInput =
    $("paymentScreenshot");

  const preview =
    $("paymentPreview");


  if (!fileInput || !preview) {
    return;
  }


  fileInput.addEventListener(
    "change",
    function () {

      const file =
        fileInput.files?.[0];


      preview.innerHTML = "";


      if (!file) {
        return;
      }


      if (
        !file.type.startsWith("image/")
      ) {
        return;
      }


      const image =
        document.createElement("img");


      image.src =
        URL.createObjectURL(file);


      image.alt =
        "Payment screenshot preview";


      preview.appendChild(
        image
      );
    }
  );
}


// ============================================================
// INITIALIZE PAYMENT
// ============================================================

async function initPaymentForm(booking) {

  console.log(
    "Initializing payment:",
    booking
  );


  // ==========================================================
  // VEHICLE
  // ==========================================================

  if (paymentVehicleName) {

    paymentVehicleName.textContent =
      booking.vehicleName ||
      "Vehicle";
  }


  const iconSpan =
    $("paymentVehicleIcon");


  if (iconSpan) {

    iconSpan.textContent =
      booking.vehicleIcon ||
      "🚗";
  }


  // ==========================================================
  // VEHICLE IMAGE
  // ==========================================================

  try {

    const catalog =
      window.fleetVehicles ||
      [];


    const vehicle =
      catalog.find(
        (v) =>
          v.regNo ===
          booking.vehicleReg
      );


    if (
      vehicle &&
      typeof window.fleetImagePath ===
        "function"
    ) {

      const imagePath =
        window.fleetImagePath(
          vehicle
        );


      const imageContainer =
        $("paymentVehicleImage");


      if (
        imageContainer &&
        imagePath
      ) {

        const image =
          document.createElement("img");


        image.src =
          imagePath;


        image.alt =
          booking.vehicleName ||
          "Vehicle";


        image.onload =
          function () {

            if (iconSpan) {

              iconSpan.style.display =
                "none";
            }
          };


        image.onerror =
          function () {

            image.remove();
          };


        imageContainer.prepend(
          image
        );
      }
    }

  } catch (error) {

    console.warn(
      "Vehicle image could not be loaded:",
      error
    );
  }


  // ==========================================================
  // BOOKING ID
  // ==========================================================

  if ($("paymentBookingId")) {

    $("paymentBookingId").textContent =
      bookingId
        .slice(-6)
        .toUpperCase();
  }


  // ==========================================================
  // PICKUP
  // ==========================================================

  if ($("paymentPickup")) {

    $("paymentPickup").textContent =
      booking.pickupLocation ||
      booking.pickup ||
      "Gavson Business Park, Ghansoli";
  }


  // ==========================================================
  // DROP
  // ==========================================================

  if ($("paymentDrop")) {

    $("paymentDrop").textContent =
      booking.dropLocation ||
      booking.drop ||
      "Gavson Business Park, Ghansoli";
  }


  // ==========================================================
  // DATE
  // ==========================================================

  if ($("paymentDateRange")) {

    $("paymentDateRange").textContent =
      `${formatDate(
        booking.pickupDate
      )} – ${formatDate(
        booking.dropDate
      )}`;
  }


  // ==========================================================
  // DURATION
  // ==========================================================

  if ($("paymentDuration")) {

    let duration =
      booking.duration ||
      booking.durationDays;


    if (!duration) {

      const start =
        booking.pickupDate
          ? new Date(
              `${booking.pickupDate}T00:00:00`
            )
          : null;


      const end =
        booking.dropDate
          ? new Date(
              `${booking.dropDate}T00:00:00`
            )
          : null;


      if (
        start &&
        end &&
        !isNaN(start) &&
        !isNaN(end)
      ) {

        duration =
          Math.max(
            1,
            Math.ceil(
              (end - start) /
                (1000 * 60 * 60 * 24)
            )
          );
      }
    }


    $("paymentDuration").textContent =
      duration
        ? `${duration} day${Number(duration) === 1 ? "" : "s"}`
        : "1 day";
  }


  // ==========================================================
  // TOTAL
  // ==========================================================

  const totalAmount =
    Number(
      booking.totalAmount ||
      booking.amount ||
      0
    );


  console.log(
    "Payment amount:",
    totalAmount
  );


  if (totalAmount <= 0) {

    console.warn(
      "Booking has zero or missing totalAmount."
    );
  }


  // LEFT SUMMARY
  if ($("paymentAmount")) {

    $("paymentAmount").textContent =
      `₹${formatCurrency(
        totalAmount
      )}`;
  }


  // UPI AMOUNT
  if ($("upiAmount")) {

    /*
     * HTML already contains ₹
     * outside the span.
     *
     * Therefore DO NOT put another ₹ here.
     */

    $("upiAmount").textContent =
      formatCurrency(
        totalAmount
      );
  }


  // ==========================================================
  // UPI ID
  // ==========================================================

  const upiId =
    PAYMENT_CONFIG?.upi?.id ||
    "";


  if (upiIdElement) {

    upiIdElement.textContent =
      upiId ||
      "UPI ID not configured";
  }


  // ==========================================================
  // BUILD UPI URI
  // ==========================================================

  const upiUri =
    buildUpiUri(
      totalAmount,
      bookingId
    );


  console.log(
    "UPI URI:",
    upiUri
  );


  // ==========================================================
  // GENERATE QR
  // ==========================================================

  if (
    totalAmount > 0 &&
    upiId
  ) {

    generateQRCode(
      upiUri
    );

  } else {

    if (qrContainer) {

      qrContainer.innerHTML = `
        <div style="
          color:#111;
          text-align:center;
          font-size:12px;
          padding:20px;
        ">
          Payment amount unavailable.
        </div>
      `;
    }
  }


  // ==========================================================
  // UPI BUTTONS
  // ==========================================================

  setupUPIButtons(
    upiUri
  );


  // ==========================================================
  // SCREENSHOT PREVIEW
  // ==========================================================

  setupScreenshotPreview();


  // ==========================================================
  // DEFAULT METHOD
  // ==========================================================

  setActiveMethod(
    "upi"
  );


  // ==========================================================
  // PAYMENT FORM
  // ==========================================================

  if (!paymentForm) {

    console.warn(
      "paymentForm not found."
    );

    return;
  }


  // ==========================================================
  // PREVENT DUPLICATE LISTENER
  // ==========================================================

  if (
    paymentForm.dataset.initialized ===
    "true"
  ) {

    return;
  }


  paymentForm.dataset.initialized =
    "true";


  // ==========================================================
  // SUBMIT PAYMENT
  // ==========================================================

  paymentForm.addEventListener(
    "submit",
    async function (event) {

      event.preventDefault();

      event.stopPropagation();


      // ------------------------------------------------------
      // REFERENCE
      // ------------------------------------------------------

      const refInput =
        $("upiReference");


      const fileInput =
        $("paymentScreenshot");


      if (!refInput) {

        console.error(
          "upiReference input not found."
        );

        return;
      }


      const refValue =
        refInput.value.trim();


      // ------------------------------------------------------
      // VALIDATE REFERENCE
      // ------------------------------------------------------

      if (!refValue) {

        if (paymentStatus) {

          paymentStatus.classList.add(
            "form-status--error"
          );

          paymentStatus.textContent =
            "Enter your payment reference / transaction ID first.";
        }


        refInput.focus();

        return;
      }


      // ------------------------------------------------------
      // REQUIRE SCREENSHOT
      // ------------------------------------------------------

      const file =
        fileInput?.files?.[0];


      if (!file) {

        if (paymentStatus) {

          paymentStatus.classList.add(
            "form-status--error"
          );

          paymentStatus.textContent =
            "Please upload your payment screenshot.";
        }


        return;
      }


      // ------------------------------------------------------
      // DISABLE SUBMIT
      // ------------------------------------------------------

      if (payButton) {

        payButton.disabled =
          true;

        payButton.textContent =
          "Submitting...";
      }


      if (paymentStatus) {

        paymentStatus.classList.remove(
          "form-status--error"
        );

        paymentStatus.textContent =
          "Submitting your payment reference...";
      }


      try {

        // ====================================================
        // VALIDATE SCREENSHOT
        // ====================================================

        const allowedTypes = [
          "image/jpeg",
          "image/png",
          "image/webp",
        ];


        if (
          !allowedTypes.includes(
            file.type
          )
        ) {

          throw new Error(
            "Please upload a JPG, PNG, or WebP screenshot."
          );
        }


        const maxSize =
          5 * 1024 * 1024;


        if (
          file.size >
          maxSize
        ) {

          throw new Error(
            "Payment screenshot must be smaller than 5 MB."
          );
        }


        // ====================================================
        // FILE EXTENSION
        // ====================================================

        const extension =
          file.name
            .split(".")
            .pop()
            ?.toLowerCase() ||
          "jpg";


        // ====================================================
        // STORAGE PATH
        // ====================================================

        const fileRef =
          ref(
            storage,
            `payment_screenshots/${bookingId}/${Date.now()}.${extension}`
          );


        // ====================================================
        // UPLOAD
        // ====================================================

        await uploadBytes(
          fileRef,
          file
        );


        // ====================================================
        // DOWNLOAD URL
        // ====================================================

        const screenshotURL =
          await getDownloadURL(
            fileRef
          );


        // ====================================================
        // UPDATE FIRESTORE
        // ====================================================

        await updateDoc(
          doc(
            db,
            "bookings",
            bookingId
          ),
          {

            paymentMethod:
              activeMethod,

            paymentRef:
              refValue,

            paymentScreenshotURL:
              screenshotURL,

            paymentStatus:
              "pending_verification",

            paymentSubmittedAt:
              serverTimestamp(),
          }
        );


        // ====================================================
        // SUCCESS
        // ====================================================

        if (paymentStatus) {

          paymentStatus.classList.remove(
            "form-status--error"
          );

          paymentStatus.textContent =
            "Payment submitted successfully. We'll verify it and confirm your booking.";
        }


        // ====================================================
        // REDIRECT
        // ====================================================

        setTimeout(
          function () {

            window.location.href =
              "bookings.html";

          },
          1200
        );

      } catch (error) {

        console.error(
          "Payment submission failed:",
          error
        );


        if (paymentStatus) {

          paymentStatus.classList.add(
            "form-status--error"
          );

          paymentStatus.textContent =
            error?.message ||
            "Couldn't submit your payment reference. Please try again.";
        }


        if (payButton) {

          payButton.disabled =
            false;

          payButton.textContent =
            "Submit Payment Reference";
        }
      }
    }
  );


  console.log(
    "CARRENTPE payment page initialized successfully."
  );
}


// ============================================================
// START
// ============================================================

if (!bookingId) {

  showError(
    "No booking to pay for — please start your booking from the fleet page."
  );

} else {

  onAuthStateChanged(
    auth,
    async function (user) {

      // ======================================================
      // NOT LOGGED IN
      // ======================================================

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


      // ======================================================
      // LOAD BOOKING
      // ======================================================

      let snap;


      try {

        snap =
          await getDoc(
            doc(
              db,
              "bookings",
              bookingId
            )
          );

      } catch (error) {

        console.error(
          "Failed to load booking:",
          error
        );


        showError(
          "Couldn't load that booking. Please try again."
        );


        return;
      }


      // ======================================================
      // BOOKING DOES NOT EXIST
      // ======================================================

      if (!snap.exists()) {

        showError(
          "That booking doesn't exist anymore."
        );


        return;
      }


      const booking =
        snap.data();


      // ======================================================
      // SECURITY
      // ======================================================

      if (
        booking.userId !==
        user.uid
      ) {

        showError(
          "This booking doesn't belong to your account."
        );


        return;
      }


      // ======================================================
      // ALREADY PAID
      // ======================================================

      if (
        booking.paymentStatus ===
          "paid" ||
        booking.paymentStatus ===
          "pay_at_pickup"
      ) {

        if (paymentVehicleName) {

          paymentVehicleName.textContent =
            booking.vehicleName ||
            "Your vehicle";
        }


        if (paymentStatus) {

          paymentStatus.textContent =
            "This booking is already confirmed. Check My Bookings for details.";
        }


        hidePaymentInterface();

        return;
      }


      // ======================================================
      // PAYMENT ALREADY SUBMITTED
      // ======================================================

      if (
        booking.paymentStatus ===
        "pending_verification"
      ) {

        if (paymentVehicleName) {

          paymentVehicleName.textContent =
            booking.vehicleName ||
            "Your vehicle";
        }


        if (paymentStatus) {

          paymentStatus.textContent =
            "We've received your payment reference and are verifying it. Check My Bookings for the latest status.";
        }


        hidePaymentInterface();

        return;
      }


      // ======================================================
      // INITIALIZE
      // ======================================================

      await initPaymentForm(
        booking
      );
    }
  );
}