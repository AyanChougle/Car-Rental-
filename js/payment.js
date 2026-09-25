// ============================================================
// KRUIZLY - PAYMENT / CHECKOUT
// Direct PHP + MySQL Backend
// ============================================================
//
// Payment flow:
//
// 1. Customer opens checkout
// 2. Customer chooses UPI / Bank Transfer
// 3. Customer makes payment
// 4. Customer enters UTR / transaction ID
// 5. Customer selects payment screenshot
// 6. Screenshot uploads to Hostinger PHP API (/api/media/upload)
// 7. Hostinger PHP saves file to /uploads/
// 8. MySQL saves media & payment records
// 9. Booking payment status updated to pending_verification
// ============================================================

import { checkAuth, getCurrentUser } from "./auth.js?v=20260917-v1";
import { api } from "./kruizly-api.js?v=20260917-v1";

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

const MEDIA_API_URL =
  window.MEDIA_API_URL ||
  (window.__KRUIZLY_API_URL__ ? window.__KRUIZLY_API_URL__.replace(/\/api$/, '') : window.location.origin);


// ============================================================
// CONSTANTS
// ============================================================

const PAYMENT_SCREENSHOT_MAX_SIZE =
  5 * 1024 * 1024;

const ALLOWED_PAYMENT_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "svg", "avif", "heic", "heif",
  "zip", "zipx", "7z", "rar", "tar", "gz", "tgz", "bz2", "xz", "tar.gz", "tar.bz2", "tar.xz",
  "pdf", "doc", "docx"
];

const ALLOWED_SCREENSHOT_TYPES = [
  "image/jpeg", "image/pjpeg", "image/png", "image/x-png", "image/webp", "image/gif",
  "image/bmp", "image/x-ms-bmp", "image/x-bmp", "image/tiff", "image/x-tiff",
  "image/svg+xml", "image/svg", "image/avif", "image/heic", "image/heic-sequence",
  "image/heif", "image/heif-sequence",
  "application/zip", "application/x-zip-compressed", "application/x-zip", "multipart/x-zip",
  "application/x-zipx", "application/x-7z-compressed", "application/x-7z",
  "application/vnd.rar", "application/x-rar-compressed", "application/x-rar",
  "application/x-tar", "application/tar", "application/gzip", "application/x-gzip",
  "application/x-compressed-tar", "application/x-tgz",
  "application/x-bzip2", "application/x-bzip", "application/bzip2",
  "application/x-xz", "application/octet-stream", "binary/octet-stream",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

function isAllowedPaymentFile(file) {
  if (!file) return false;
  const name = (file.name || "").toLowerCase();
  const ext = name.split(".").pop();
  const blocked = ["php", "exe", "bat", "cmd", "sh", "bash", "js", "vbs", "jar", "cgi"];
  if (blocked.includes(ext)) {
    return false;
  }
  return true;
}


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

let currentBooking = null;
let currentPaymentPlan = "advance";
let currentPaymentAmount = 0;
let totalBookingAmount = 0;
let isAdvancePaidVerified = false;


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
  const safeAmount = Number(currentPaymentAmount || 0).toFixed(2);
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

    if (!isAllowedPaymentFile(file)) {
      input.value = "";
      if (dropzoneTitle) dropzoneTitle.textContent = "Click or drag screenshot here";
      if (preview) {
        preview.innerHTML = `<div class="form-status form-status--error">Supported formats: JPG, PNG, WEBP, GIF, BMP, TIFF, SVG, AVIF, HEIC, ZIP, RAR, 7Z, TAR, GZ, BZ2, XZ, PDF.</div>`;
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
    if (!booking) return;

    const catalog =
      Array.isArray(window.fleetVehicles) ? window.fleetVehicles : [];

    let vehicle =
      catalog.find(
        (item) =>
          item.regNo && (item.regNo === booking.vehicleReg || item.regNo === booking.carId)
      );

    if (!vehicle && booking.vehicleName) {
      vehicle = catalog.find(
        (item) => `${item.brand} ${item.model}`.toLowerCase() === String(booking.vehicleName).toLowerCase().trim()
      );
    }

    if (!vehicle && booking.vehicleName) {
      const parts = String(booking.vehicleName).trim().split(" ");
      vehicle = { brand: parts[0] || "", model: parts.slice(1).join(" ") || "" };
    }

    if (
      !vehicle ||
      typeof window.fleetImagePath !== "function"
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

    // Clean up any previously appended images
    container.querySelectorAll("img").forEach((img) => img.remove());

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
        if ($("paymentVehicleIcon")) {
          $("paymentVehicleIcon").style.display =
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
}

// ============================================================
// PAYMENT PLAN SWITCHER & UI SYNC
// ============================================================

function setupPaymentPlanPicker(booking, totalAmount, isAdvancePaid, advPaid, remBal) {
  const planPicker = $("paymentPlanPicker");
  const advanceCard = $("planAdvanceCard");
  const fullCard = $("planFullCard");
  const radioAdvance = $("radioPlanAdvance");
  const radioFull = $("radioPlanFull");
  const planAdvanceAmountLabel = $("planAdvanceAmountLabel");
  const planFullAmountLabel = $("planFullAmountLabel");
  const planFullTitle = $("planFullTitle");
  const planFullSubtitle = $("planFullSubtitle");
  const alreadyPaidNotice = $("advanceAlreadyPaidNotice");
  const noticeAdvancePaid = $("noticeAdvancePaid");
  const noticeRemainingDue = $("noticeRemainingDue");

  if (!planPicker) return;

  planPicker.style.display = "";

  const fullAmountToPay = isAdvancePaid && remBal > 0 ? remBal : totalAmount;

  if (planAdvanceAmountLabel) {
    planAdvanceAmountLabel.textContent = `₹${formatCurrency(Math.min(500, totalAmount))}`;
  }
  if (planFullAmountLabel) {
    planFullAmountLabel.textContent = `₹${formatCurrency(fullAmountToPay)}`;
  }

  if (isAdvancePaid) {
    // Advance token is already confirmed
    if (alreadyPaidNotice) {
      alreadyPaidNotice.style.display = "block";
      if (noticeAdvancePaid) noticeAdvancePaid.textContent = `₹${formatCurrency(advPaid || 500)}`;
      if (noticeRemainingDue) noticeRemainingDue.textContent = `₹${formatCurrency(remBal)}`;
    }
    if (advanceCard) {
      advanceCard.style.opacity = "0.5";
      advanceCard.style.cursor = "not-allowed";
      if (advanceCard.querySelector("strong")) {
        advanceCard.querySelector("strong").textContent = "Advance Token (Paid)";
      }
    }
    if (planFullTitle) {
      planFullTitle.textContent = "Pay Remaining Balance";
    }
    if (planFullSubtitle) {
      planFullSubtitle.textContent = `Pay remaining ₹${formatCurrency(remBal)} to complete 100% full payment`;
    }
  } else {
    if (alreadyPaidNotice) {
      alreadyPaidNotice.style.display = "none";
    }
    if (planFullTitle) {
      planFullTitle.textContent = "Pay Full Amount";
    }
    if (planFullSubtitle) {
      planFullSubtitle.textContent = "Pay 100% rental now and avoid waiting at pickup";
    }
  }

  // Card click listeners
  if (advanceCard && !isAdvancePaid) {
    advanceCard.onclick = (e) => {
      e.preventDefault();
      if (radioAdvance) radioAdvance.checked = true;
      updatePaymentPlan("advance");
    };
  }

  if (fullCard) {
    fullCard.onclick = (e) => {
      e.preventDefault();
      if (radioFull) radioFull.checked = true;
      updatePaymentPlan("full");
    };
  }

  if (radioAdvance && !isAdvancePaid) {
    radioAdvance.onchange = () => {
      if (radioAdvance.checked) updatePaymentPlan("advance");
    };
  }

  if (radioFull) {
    radioFull.onchange = () => {
      if (radioFull.checked) updatePaymentPlan("full");
    };
  }
}

function updatePaymentPlan(newPlan) {
  currentPaymentPlan = newPlan;

  const total = totalBookingAmount || Number(currentBooking?.totalAmount ?? currentBooking?.finalAmount ?? 0);
  const advPaid = Number(currentBooking?.advanceAmount || (isAdvancePaidVerified ? 500 : 0));
  const remBal = Number(
    currentBooking?.remainingBalance !== undefined && currentBooking?.remainingBalance !== null
      ? currentBooking.remainingBalance
      : Math.max(0, total - advPaid)
  );

  if (newPlan === "full") {
    currentPaymentAmount = (isAdvancePaidVerified && remBal > 0) ? remBal : total;
  } else {
    currentPaymentAmount = Math.min(500, total);
  }

  // Update card styles
  const advanceCard = $("planAdvanceCard");
  const fullCard = $("planFullCard");
  const radioAdvance = $("radioPlanAdvance");
  const radioFull = $("radioPlanFull");

  if (advanceCard && fullCard) {
    if (newPlan === "full") {
      advanceCard.classList.remove("active");
      advanceCard.style.borderColor = "rgba(255, 255, 255, 0.1)";
      advanceCard.style.background = "rgba(255, 255, 255, 0.03)";
      if (radioAdvance) radioAdvance.checked = false;

      fullCard.classList.add("active");
      fullCard.style.borderColor = "#00d2ff";
      fullCard.style.background = "rgba(0, 210, 255, 0.08)";
      if (radioFull) radioFull.checked = true;
    } else {
      fullCard.classList.remove("active");
      fullCard.style.borderColor = "rgba(255, 255, 255, 0.1)";
      fullCard.style.background = "rgba(255, 255, 255, 0.03)";
      if (radioFull) radioFull.checked = false;

      advanceCard.classList.add("active");
      advanceCard.style.borderColor = "#00d2ff";
      advanceCard.style.background = "rgba(0, 210, 255, 0.08)";
      if (radioAdvance) radioAdvance.checked = true;
    }
  }

  // Update payment amounts in UI
  if ($("paymentAmount")) {
    $("paymentAmount").textContent = `₹${formatCurrency(currentPaymentAmount)}`;
  }
  if ($("upiAmount")) {
    $("upiAmount").textContent = `₹${formatCurrency(currentPaymentAmount)}`;
  }

  // Remaining balance row
  const remainingCalculated = Math.max(0, total - (newPlan === "full" ? total : currentPaymentAmount));
  if ($("paymentRemainingRow")) {
    if (newPlan === "advance" && !isAdvancePaidVerified) {
      $("paymentRemainingRow").style.display = "flex";
      if ($("paymentRemaining")) {
        $("paymentRemaining").textContent = `₹${formatCurrency(remainingCalculated)}`;
      }
    } else {
      $("paymentRemainingRow").style.display = "none";
    }
  }

  // Note
  if ($("paymentPlanNote")) {
    if (newPlan === "full") {
      $("paymentPlanNote").textContent = isAdvancePaidVerified
        ? `Paying remaining balance of ₹${formatCurrency(currentPaymentAmount)} to complete full rental payment.`
        : "Paying 100% full rental payment today.";
    } else {
      $("paymentPlanNote").textContent = `Token booking fee of ₹${formatCurrency(currentPaymentAmount)} to lock reservation. Balance of ₹${formatCurrency(remainingCalculated)} due at vehicle handover.`;
    }
  }

  // UPI configuration & QR code
  const upiId = PAYMENT_CONFIG?.upi?.id || "";
  if (upiIdElement) {
    upiIdElement.textContent = upiId || "UPI ID not configured";
  }

  const upiUri = buildUpiUri(currentPaymentAmount, bookingId);
  if (currentPaymentAmount > 0 && upiId) {
    generateQRCode(upiUri);
  } else if (qrContainer) {
    qrContainer.innerHTML = `
      <div style="padding:20px;text-align:center;color:#111;font-size:13px;">
        Payment amount unavailable.
      </div>
    `;
  }

  initialiseUPIButtons(upiUri);

  if (currentBooking) {
    currentBooking.paymentPlan = newPlan;
    currentBooking.paymentAmount = currentPaymentAmount;
  }
}

// ============================================================
// INITIALISE PAYMENT UI
// ============================================================

async function initialisePaymentUI(booking) {
  console.log("Initialising payment UI...", booking);

  currentBooking = booking;

  displayBooking(booking);
  await loadVehicleImage(booking);

  let totalAmount = Number(
    booking.totalAmount ??
    booking.finalAmount ??
    booking.amount ??
    0
  );

  // Self-healing fallback calculation for any booking record missing pre-calculated totals
  if (totalAmount <= 0) {
    const catalog = window.fleetVehicles || [];
    const vehicle = catalog.find((item) => item.regNo === booking.vehicleReg) || {};
    const priceDay = Number(booking.priceDay || vehicle.priceDay || 2600);
    const depositVal = Number(booking.securityDeposit || vehicle.securityDeposit || 3000);
    const driverVal = booking.withDriver ? Number(booking.driverPrice || vehicle.driverPrice || 1500) : 0;
    const numDays = Number(booking.days || booking.durationDays || 1);

    totalAmount = Math.max(0, (priceDay * numDays) + (driverVal * numDays) + depositVal);
  }

  totalBookingAmount = totalAmount;

  isAdvancePaidVerified = (booking.paymentStatus === "advance_paid") || (Number(booking.advanceAmount || 0) > 0);
  const advPaid = Number(booking.advanceAmount || (isAdvancePaidVerified ? 500 : 0));
  const remBal = Number(
    booking.remainingBalance !== undefined && booking.remainingBalance !== null
      ? booking.remainingBalance
      : Math.max(0, totalAmount - advPaid)
  );

  const urlPlan = urlParams.get("plan");
  let initialPlan = "advance";

  if (isAdvancePaidVerified) {
    initialPlan = "full";
  } else if (urlPlan === "full" || booking.paymentPlan === "full") {
    initialPlan = "full";
  }

  setupPaymentPlanPicker(booking, totalAmount, isAdvancePaidVerified, advPaid, remBal);
  updatePaymentPlan(initialPlan);

  setActiveMethod("upi");
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

  if (!isAllowedPaymentFile(file)) {
    setStatus(
      "Supported formats: JPG, PNG, WEBP, GIF, BMP, TIFF, SVG, AVIF, HEIC, ZIP, RAR, 7Z, TAR, GZ, BZ2, XZ, PDF.",
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
    // STEP 1 — UPLOAD SCREENSHOT TO MEDIA API
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

    const total = totalBookingAmount || Number(booking.finalAmount ?? booking.totalAmount ?? 0);
    const plan = currentPaymentPlan || booking.paymentPlan || "full";
    const payAmount = Number(
      currentPaymentAmount ||
      booking.paymentAmount ??
      booking.paymentAmountPaid ??
      (plan === "advance" ? Math.min(500, total) : total)
    );
    const remBalance = plan === "full" ? 0 : Math.max(0, total - payAmount);

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
      paymentPlan: plan,
      amount: payAmount,
      paymentAmount: payAmount,
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
        "Unable to connect to the KRUIZLY payment server. Please check your internet connection and try again.";
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

    const userUids = [
      String(user.uid || "").trim(),
      String(user.id || "").trim(),
      String(user.firebaseUid || "").trim()
    ].filter(Boolean);

    const bookingUids = [
      String(booking.userId || "").trim(),
      String(booking.firebaseUid || "").trim(),
      String(booking.user_id || "").trim()
    ].filter(Boolean);

    const isOwner = !bookingUids.length ||
                    userUids.some(u => bookingUids.includes(u)) ||
                    (user.email && booking.userEmail && String(user.email).trim().toLowerCase() === String(booking.userEmail).trim().toLowerCase()) ||
                    (user.role === "admin" || user.role === "manager");

    if (!isOwner) {
      showError("This booking does not belong to your account.");
      return;
    }

    const totalAmt = Number(booking.finalAmount ?? booking.totalAmount ?? booking.amount ?? 0);
    const advPaidAmt = Number(booking.advanceAmount || (booking.paymentPlan === "advance" && booking.paymentStatus === "advance_paid" ? 500 : 0));
    const remBal = Number(booking.remainingBalance !== undefined && booking.remainingBalance !== null ? booking.remainingBalance : (booking.paymentPlan === "advance" ? Math.max(0, totalAmt - (advPaidAmt || 500)) : 0));
    const urlPlan = urlParams.get("plan");

    // Only redirect if booking is cancelled or rejected
    if (booking.status === "cancelled" || booking.status === "rejected") {
      setStatus("This booking is cancelled. Please create a new booking.");
      hidePaymentInterface();
      redirectToBookings(1500);
      return;
    }

    // If completely 100% paid
    if (booking.paymentStatus === "paid" || (booking.paymentStatus === "advance_paid" && remBal <= 0 && urlPlan !== "full")) {
      if (paymentVehicleName) {
        paymentVehicleName.textContent = booking.vehicleName || "Your vehicle";
      }
      setStatus("This booking is already confirmed and 100% fully paid. Check My Bookings for details.");
      hidePaymentInterface();
      redirectToBookings(1200);
      return;
    }

    // If pending verification of previous payment reference and not explicitly requesting full payment settlement
    if (
      booking.paymentStatus === "pending_verification" &&
      booking.paymentRef &&
      urlPlan !== "full"
    ) {
      if (paymentVehicleName) {
        paymentVehicleName.textContent = booking.vehicleName || "Your vehicle";
      }
      setStatus("We've received your payment reference and are verifying it. Check My Bookings for the latest status.");
      hidePaymentInterface();
      redirectToBookings(1500);
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
