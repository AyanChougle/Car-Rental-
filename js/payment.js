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

import { checkAuth, getCurrentUser } from "./auth.js?v=20260904-v17";
import { api } from "./kruizly-api.js?v=20260904-v17";

import { PAYMENT_CONFIG } from "./payment-config.js";
import { formatBookingNumber } from "./booking-reference.js";

import "./nav-helper.js";
import {
  calculateDuration,
  formatCurrency,
  formatHumanDateTime,
  parseDateTime
} from "./booking-calculator.js";
import { recordCouponUsage } from "./coupon-service.js";


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
  (window.__KRUIZLY_API_URL__ ? window.__KRUIZLY_API_URL__.replace(/\/api$/, '') : window.location.origin);


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
// OPEN UPI APP & DEEP LINKS
// ============================================================

function openUPIApp(appOrUri) {
  const upiId = PAYMENT_CONFIG?.upi?.id || "svcmerc00314092@svcbank";
  const payeeName = PAYMENT_CONFIG?.upi?.payeeName || "KRUIZLY";
  const safeAmount = Number(paymentAmount || 0).toFixed(2);
  const transactionNote = `KRUIZLY Booking ${String(formatBookingNumber(bookingId))}`;

  const query = `pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${safeAmount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;

  let targetUrl = `upi://pay?${query}`;

  if (typeof appOrUri === "string" && !appOrUri.startsWith("upi://")) {
    switch (appOrUri) {
      case "gpay":
        targetUrl = `tez://upi/pay?${query}`;
        break;
      case "phonepe":
        targetUrl = `phonepe://pay?${query}`;
        break;
      case "paytm":
        targetUrl = `paytmmp://pay?${query}`;
        break;
      case "bhim":
        targetUrl = `bhim://pay?${query}`;
        break;
      default:
        targetUrl = `upi://pay?${query}`;
        break;
    }
  }

  // Attempt to open the UPI app intent
  window.location.href = targetUrl;

  // Fallback / helper: copy UPI ID to clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(upiId).catch(() => {});
  }
}

// ============================================================
// UPI BUTTONS & COPY
// ============================================================

function initialiseUPIButtons(upiUri) {
  if (openUpiButton) {
    openUpiButton.type = "button";
    openUpiButton.addEventListener("click", (event) => {
      event.preventDefault();
      openUPIApp("default");
    });
  }

  document.querySelectorAll(".upi-app-btn").forEach((button) => {
    button.type = "button";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const app = button.dataset.app || "default";
      openUPIApp(app);
    });
  });

  wireCopyButton();
}

// ============================================================
// WIRE COPY BUTTON & FLOATING TOAST
// ============================================================

function showKruizlyToast(message) {
  const existing = document.querySelector(".kruizly-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "kruizly-toast";
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4fd7ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 300ms ease";
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function wireCopyButton() {
  const copyBtn = document.getElementById("copyUpiBtn");
  if (!copyBtn || copyBtn.dataset.wired === "true") return;
  copyBtn.dataset.wired = "true";

  copyBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    const upiSpan = document.getElementById("upiId");
    const textToCopy = upiSpan ? upiSpan.textContent.trim() : "svcmerc00314092@svcbank";

    let copiedSuccessfully = false;

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        copiedSuccessfully = true;
      } catch (_) {}
    }

    if (!copiedSuccessfully) {
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        copiedSuccessfully = true;
      } catch (_) {}
      document.body.removeChild(textarea);
    }

    copyBtn.classList.add("copied");
    copyBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      <span>Copied!</span>
    `;

    showKruizlyToast(`UPI ID "${textToCopy}" copied!`);

    setTimeout(() => {
      copyBtn.classList.remove("copied");
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy</span>
      `;
    }, 2500);
  });
}

function generateQRCode(upiUri) {
  const qrBox = document.getElementById("upiQr");
  if (!qrBox) return;
  qrBox.innerHTML = "";

  if (typeof window.QRCode !== "undefined") {
    try {
      new window.QRCode(qrBox, {
        text: upiUri,
        width: 124,
        height: 124,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });
      return;
    } catch (e) {
      console.warn("QRCode constructor error:", e);
    }
  }

  // Fallback direct QR code image
  const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=124x124&margin=4&data=${encodeURIComponent(upiUri)}`;
  qrBox.innerHTML = `<img src="${fallbackUrl}" alt="UPI QR Code" width="124" height="124" style="display:block;border-radius:6px;" />`;
}

// ============================================================
// SCREENSHOT PREVIEW & DRAG-AND-DROP
// ============================================================

function initialiseScreenshotPreview() {
  const input = document.getElementById("paymentScreenshot");
  const preview = document.getElementById("paymentPreview");
  const dropzoneLabel = document.getElementById("dropzoneLabel");
  const dropzoneTitle = document.getElementById("dropzoneTitle");

  if (!input) return;

  if (dropzoneLabel) {
    ["dragenter", "dragover"].forEach((eventName) => {
      dropzoneLabel.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzoneLabel.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropzoneLabel.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzoneLabel.classList.remove("dragover");
      });
    });

    dropzoneLabel.addEventListener("drop", (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        input.files = files;
        input.dispatchEvent(new Event("change"));
      }
    });
  }

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (preview) preview.innerHTML = "";

    if (!file) {
      if (dropzoneTitle) dropzoneTitle.textContent = "Click or drag screenshot here";
      return;
    }

    if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
      input.value = "";
      if (dropzoneTitle) dropzoneTitle.textContent = "Click or drag screenshot here";
      if (preview) {
        preview.innerHTML = `<div class="form-status form-status--error">Please select a valid JPG, PNG, or WEBP image.</div>`;
      }
      return;
    }

    if (file.size > PAYMENT_SCREENSHOT_MAX_SIZE) {
      input.value = "";
      if (dropzoneTitle) dropzoneTitle.textContent = "Click or drag screenshot here";
      if (preview) {
        preview.innerHTML = `<div class="form-status form-status--error">File size is ${(file.size / (1024 * 1024)).toFixed(1)} MB (Max 5 MB allowed).</div>`;
      }
      return;
    }

    if (dropzoneTitle) {
      dropzoneTitle.textContent = "Change screenshot";
    }

    const fileSizeStr = file.size > 1024 * 1024 
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
      : `${Math.round(file.size / 1024)} KB`;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (preview) {
        preview.innerHTML = `
          <div class="payment-preview-card">
            <img src="${e.target.result}" alt="Payment Screenshot Preview" class="payment-preview-thumb" />
            <div class="payment-preview-meta">
              <span class="payment-preview-name">${file.name}</span>
              <span class="payment-preview-size">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                ${fileSizeStr} • Ready to submit
              </span>
            </div>
            <button type="button" class="payment-preview-remove" id="removeScreenshotBtn" title="Remove screenshot" aria-label="Remove screenshot">×</button>
          </div>
        `;

        const removeBtn = document.getElementById("removeScreenshotBtn");
        if (removeBtn) {
          removeBtn.addEventListener("click", () => {
            input.value = "";
            preview.innerHTML = "";
            if (dropzoneTitle) dropzoneTitle.textContent = "Click or drag screenshot here";
          });
        }
      }
    };
    reader.readAsDataURL(file);
  });
}





// ============================================================
// VEHICLE IMAGE
// ============================================================

async function loadVehicleImage(
  booking
) {
  try {
    const catalog =
      Array.isArray(window.fleetVehicles) ? window.fleetVehicles : [];

    const vehicle =
      catalog.find(
        (item) =>
          item.regNo === (booking.vehicleReg || booking.carId)
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

  const pickupLocation = booking.pickupLocation || booking.location || "Gavson Business Park, Ghansoli";
  const dropLocation = booking.dropLocation || booking.location || "Gavson Business Park, Ghansoli";

  if ($("paymentPickup")) {
    $("paymentPickup").textContent = `${formatHumanDateTime(booking.pickupDate)} • ${pickupLocation}`;
  }

  if ($("paymentDrop")) {
    $("paymentDrop").textContent = `${formatHumanDateTime(booking.dropDate)} • ${dropLocation}`;
  }

  if ($("paymentDateRange")) {
    $("paymentDateRange").textContent =
      `${formatHumanDateTime(booking.pickupDate)} – ${formatHumanDateTime(booking.dropDate)}`;
  }

  // Authoritative duration calculation from actual pickup and drop date/time
  const durationResult = calculateDuration(booking.pickupDate, booking.dropDate);
  let formattedDuration = durationResult.valid
    ? durationResult.formattedDuration
    : (booking.duration || "");

  if (!formattedDuration || !formattedDuration.includes("hr")) {
    const d = Math.max(1, Number(booking.days) || 1);
    const h = Math.max(1, Number(booking.hours) || (d * 24));
    formattedDuration = `${d} Day${d > 1 ? "s" : ""} (${h} hrs)`;
  }

  if ($("paymentDuration")) {
    $("paymentDuration").textContent = formattedDuration;
  }

  const totalAmount = Number(booking.totalAmount ?? booking.finalAmount ?? booking.rentalTotal ?? 0);
  const couponDiscount = Number(booking.couponDiscount || 0);
  const couponCode = booking.couponCode;
  const paymentPlan = booking.paymentPlan || "advance";
  const paymentAmount = Number(booking.paymentAmount ?? (paymentPlan === "advance" ? Math.min(500, totalAmount) : totalAmount));
  const remainingBalance = Math.max(0, totalAmount - paymentAmount);

  if ($("paymentTotalRental")) {
    $("paymentTotalRental").textContent = `₹${formatCurrency(totalAmount)}`;
  }

  if ($("paymentCouponRow")) {
    if (couponDiscount > 0) {
      $("paymentCouponRow").style.display = "flex";
      if ($("paymentCouponLabel")) {
        $("paymentCouponLabel").textContent = `Coupon Discount (${couponCode || "Applied"})`;
      }
      if ($("paymentCouponDiscount")) {
        $("paymentCouponDiscount").textContent = `-₹${formatCurrency(couponDiscount)}`;
      }
    } else {
      $("paymentCouponRow").style.display = "none";
    }
  }

  if ($("paymentAmount")) {
    $("paymentAmount").textContent = `₹${formatCurrency(paymentAmount)}`;
  }

  if ($("paymentRemainingRow")) {
    if (paymentPlan === "advance") {
      $("paymentRemainingRow").style.display = "flex";
      if ($("paymentRemaining")) {
        $("paymentRemaining").textContent = `₹${formatCurrency(remainingBalance)}`;
      }
    } else {
      $("paymentRemainingRow").style.display = "none";
    }
  }

  if ($("paymentPlanNote")) {
    $("paymentPlanNote").textContent = paymentPlan === "advance"
      ? `Advance booking fee to lock reservation. Balance of ₹${formatCurrency(remainingBalance)} due at vehicle handover.`
      : "100% full rental payment.";
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

  let totalAmount =
    Number(
      booking.totalAmount ??
      booking.amount ??
      0
    );

  let paymentAmount = Number(
    booking.paymentAmount ??
    (booking.paymentPlan === "advance" ? 500 : totalAmount)
  );

  // Self-healing fallback calculation for any booking record missing pre-calculated totals
  if (paymentAmount <= 0 || totalAmount <= 0) {
    const catalog = window.fleetVehicles || [];
    const vehicle = catalog.find((item) => item.regNo === booking.vehicleReg) || {};
    const priceDay = Number(booking.priceDay || vehicle.priceDay || 2600);
    const depositVal = Number(booking.securityDeposit || vehicle.securityDeposit || 3000);
    const driverVal = booking.withDriver ? Number(booking.driverPrice || vehicle.driverPrice || 1500) : 0;
    const numDays = Number(booking.days || booking.durationDays || 1);

    totalAmount = Math.max(0, (priceDay * numDays) + (driverVal * numDays) + depositVal);
    paymentAmount = booking.paymentPlan === "advance" ? 500 : totalAmount;
  }

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
    $("upiAmount").textContent = `₹${formatCurrency(paymentAmount)}`;
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


async function uploadPaymentScreenshot(
  file,
  currentUser,
  reference
) {
  console.log("Starting payment screenshot upload via API...");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", "payment_proof");
  formData.append("relatedId", String(bookingId));

  const result = await api.upload("/media/upload", formData);
  console.log("PAYMENT SCREENSHOT UPLOAD COMPLETE:", result);
  return result;
}


// ============================================================
// DELETE MEDIA FILE IF SUBMISSION FAILS
// ============================================================

async function deleteUploadedMedia(
  mediaId,
  currentUser
) {
  if (!mediaId) return;

  try {
    await api.delete("/media/delete", { id: mediaId });
    console.log("Uploaded screenshot cleaned up:", mediaId);
  } catch (error) {
    console.warn("Media cleanup error:", error);
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

    const total = Number(booking.finalAmount ?? booking.totalAmount ?? 0);
    const plan = booking.paymentPlan || "full";
    const payAmount = Number(
      booking.paymentAmount ??
      booking.paymentAmountPaid ??
      (plan === "advance" ? Math.min(500, total) : total)
    );
    const remBalance = Math.max(0, total - payAmount);

    const finalBookingRecord = {
      ...booking,
      bookingId,
      bookingNumber: bookingId,
      userId: currentUser.uid,
      userName: booking.userName || currentUser.displayName || currentUser.email || "",
      userEmail: currentUser.email || booking.userEmail || "",
      userPhone: booking.userPhone || null,
      paymentMethod: activeMethod,
      paymentPlan: plan,
      paymentAmount: payAmount,
      paymentAmountPaid: payAmount,
      remainingBalance: remBalance,
      remainingAmount: remBalance,
      paymentRef: reference,
      paymentScreenshotMediaId: String(uploadedMediaId),
      paymentScreenshotCategory: "payment_screenshot",
      paymentStatus: "pending_verification",
      status: "pending_verification",
      bookingStatus: "pending_verification",
      paymentSubmittedAt: new Date().toISOString(),
      paymentSubmittedBy: currentUser.uid,
    };

    if (media?.url) {
      finalBookingRecord.paymentScreenshotDataUrl = media.url;
      finalBookingRecord.paymentScreenshotURL = media.url;
      finalBookingRecord.paymentScreenshotUrl = media.url;
      finalBookingRecord.screenshotUrl = media.url;
    }

    // Save/sync booking to MySQL
    await api.post("/bookings", finalBookingRecord);

    // Record payment submission
    await api.post("/payments/submit", {
      bookingId,
      amount: payAmount,
      method: activeMethod || "upi",
      utr: reference,
      screenshotUrl: media?.url || null,
      screenshotMediaId: media?.mediaId || media?.id || null
    });

    try {
      sessionStorage.removeItem("kruizly_pending_booking");
    } catch (_) {}

    console.log(
      "MYSQL PAYMENT UPDATE COMPLETE"
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


  // Initialize interactive baseline UI immediately
  initialisePaymentTabs();
  wireCopyButton();
  initialiseScreenshotPreview();
  generateQRCode(buildUpiUri(1000, bookingId || ""));

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

  async function initPaymentAuth() {
    const isAuthenticated = await checkAuth();
    const user = getCurrentUser();

    console.log("AUTH STATE:", user ? (user.id || user.uid) : "NOT LOGGED IN");

    if (!isAuthenticated || !user) {
      const next = `payment.html?booking=${encodeURIComponent(bookingId)}`;
      window.location.href = `index.html?next=${encodeURIComponent(next)}`;
      return;
    }

    let booking = null;

    try {
      const rawPending = sessionStorage.getItem("kruizly_pending_booking");
      if (rawPending) {
        const parsed = JSON.parse(rawPending);
        if (parsed && String(parsed.bookingId || parsed.bookingNumber) === String(bookingId)) {
          booking = parsed;
        }
      }
    } catch (_) {}

    if (!booking) {
      try {
        const bRes = await api.get(`/bookings/${bookingId}`);
        if (bRes?.booking) {
          booking = bRes.booking;
        }
      } catch (error) {
        console.warn("Backend booking read fallback:", error.message);
      }
    }

    if (!booking) {
      showError("That booking does not exist. Please start your booking from the vehicle fleet.");
      return;
    }

    console.log("BOOKING LOADED:", booking);

    const userId = user.id || user.uid;
    if (booking.userId && booking.userId !== userId && booking.firebaseUid && booking.firebaseUid !== userId) {
      showError("This booking does not belong to your account.");
      return;
    }

    if (
      booking.paymentStatus === "paid" ||
      booking.paymentStatus === "advance_paid" ||
      booking.paymentStatus === "pay_at_pickup"
    ) {
      if (paymentVehicleName) {
        paymentVehicleName.textContent = booking.vehicleName || "Your vehicle";
      }
      setStatus("This booking is already confirmed. Check My Bookings for details.");
      hidePaymentInterface();
      redirectToBookings(900);
      return;
    }

    if (
      booking.paymentStatus === "pending_verification" &&
      booking.paymentRef
    ) {
      if (paymentVehicleName) {
        paymentVehicleName.textContent = booking.vehicleName || "Your vehicle";
      }
      setStatus("We've received your payment reference and are verifying it. Check My Bookings for the latest status.");
      hidePaymentInterface();
      redirectToBookings(900);
      return;
    }

    await initialisePaymentUI(booking);
    initialisePaymentTabs();
    initialiseScreenshotPreview();
    initialisePaymentForm(booking, user);

    console.log("========================================");
    console.log("KRUIZLY PAYMENT PAGE READY");
    console.log("========================================");
  }

  initPaymentAuth();
}


// ============================================================
// RUN
// ============================================================

startPaymentPage();
