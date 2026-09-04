import { auth } from "./firebase-init.js";
import { checkAuth, getCurrentUser, isExecutiveUser, isManagerUser, isAdminUser } from "./auth.js?v=20260904-v4";
import { api } from "./kruizly-api.js?v=20260904-v4";

import "./nav-helper.js";
import { openReturnModal } from "./return-inspection.js";
import { MEDIA_SERVER_URL } from "./media-config.js";
import { formatBookingNumber } from "./booking-reference.js";

async function getAuthToken() {
  try {
    if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === "function") {
      return await auth.currentUser.getIdToken();
    }
    if (currentUser && typeof currentUser.getIdToken === "function") {
      return await currentUser.getIdToken();
    }
  } catch (_) {}
  return "";
}

/* =========================================================
   ELEMENTS
========================================================= */

const managerContent = document.getElementById("managerContent");
const accessDenied = document.getElementById("managerAccessDenied");

const activeCountEl = document.getElementById("mgrActiveCount");
const pickupCountEl = document.getElementById("mgrPickupCount");
const returnCountEl = document.getElementById("mgrReturnCount");

const bookingsWrap = document.getElementById("mgrBookingsWrap");
const bookingSortOrder = document.getElementById("mgrBookingSortOrder");
const bookingDateFrom = document.getElementById("mgrBookingDateFrom");
const bookingDateTo = document.getElementById("mgrBookingDateTo");
const bookingDateClear = document.getElementById("mgrBookingDateClear");

let currentUser = null;
let currentManagerBookings = [];
let currentManagerUsers = [];
let managerBookingSortDirection = "desc";
let managerBookingDateFrom = "";
let managerBookingDateTo = "";
const MANAGER_BOOKINGS_PER_PAGE = 10;
let managerBookingPage = 1;
let activeExecutivePickupBooking = null;
let executivePickupPreviewUrls = [];
let activeManagerPaymentBooking = null;
let managerPaymentScreenshotObjectUrl = null;
let activeManagerDocument = null;
let managerDocumentObjectUrl = null;
let managerDocumentObjectUrls = [];

if (bookingSortOrder) {
  bookingSortOrder.value = managerBookingSortDirection;
  bookingSortOrder.addEventListener("change", () => {
    managerBookingSortDirection = bookingSortOrder.value;
    managerBookingPage = 1;
    renderManagerBookingsTable(getSortedManagerBookings());
  });
}

[bookingDateFrom, bookingDateTo].forEach((input) => {
  input?.addEventListener("change", () => {
    managerBookingDateFrom = bookingDateFrom?.value || "";
    managerBookingDateTo = bookingDateTo?.value || "";
    managerBookingPage = 1;
    renderManagerBookingsTable(getSortedManagerBookings());
  });
});

bookingDateClear?.addEventListener("click", () => {
  if (bookingDateFrom) bookingDateFrom.value = "";
  if (bookingDateTo) bookingDateTo.value = "";
  managerBookingDateFrom = "";
  managerBookingDateTo = "";
  managerBookingPage = 1;
  renderManagerBookingsTable(getSortedManagerBookings());
});

/* =========================================================
   FORCE HIDDEN STATE
   This prevents CSS from overriding the HTML hidden attribute.
========================================================= */

function setVisible(element, visible) {
  if (!element) return;

  element.hidden = !visible;
  element.style.display = visible ? "" : "none";
}

/* =========================================================
   AUTH / MANAGER ACCESS
========================================================= */

async function initManagerAuth() {
  setVisible(managerContent, false);
  setVisible(accessDenied, false);

  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    showAccessDenied();
    return;
  }

  currentUser = getCurrentUser();
  if (isExecutiveUser(currentUser) || isManagerUser(currentUser) || isAdminUser(currentUser)) {
    setVisible(accessDenied, false);
    setVisible(managerContent, true);
    await loadManagerData();
  } else {
    showAccessDenied();
  }
}

initManagerAuth();

/* =========================================================
   ACCESS DENIED
========================================================= */

function showAccessDenied() {
  setVisible(accessDenied, true);
  setVisible(managerContent, false);
}

/* =========================================================
   LOAD ALL DATA
========================================================= */

async function loadManagerData() {
  await Promise.all([
    loadExecutiveProfiles(),
    loadManagerBookings(),
  ]);
}

async function loadExecutiveProfiles() {
  try {
    const res = await api.get("/users");
    currentManagerUsers = res.users || [];
  } catch (err) {
    console.error("Failed to load user profiles:", err);
  }
}

/* =========================================================
   PAYMENT VERIFICATION
========================================================= */

function closeManagerPaymentModal() {
  const modal =
    document.getElementById("managerPaymentModal");

  if (modal) {
    modal.hidden = true;
  }

  if (managerPaymentScreenshotObjectUrl) {
    URL.revokeObjectURL(
      managerPaymentScreenshotObjectUrl
    );
    managerPaymentScreenshotObjectUrl = null;
  }

  activeManagerPaymentBooking = null;
}

async function fetchManagerPaymentScreenshot(mediaId) {
  if (!currentUser) {
    throw new Error("Manager authentication is required.");
  }

  const token = await getAuthToken();

  const response = await fetch(
    `${MEDIA_SERVER_URL}/api/media/file/${encodeURIComponent(mediaId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Could not load screenshot (${response.status}).`
    );
  }

  return URL.createObjectURL(
    await response.blob()
  );
}

async function openManagerPaymentModal(booking) {
  closeManagerPaymentModal();
  activeManagerPaymentBooking = booking;

  const modal =
    document.getElementById("managerPaymentModal");
  const title =
    document.getElementById("managerPaymentModalTitle");
  const body =
    document.getElementById("managerPaymentModalBody");

  if (!modal || !body) return;

  if (title) {
    title.textContent =
      `Booking #${formatBookingNumber(booking)}`;
  }

  const screenshotMarkup =
    booking.paymentScreenshotURL
      ? `
        <img
          src="${escapeHtml(booking.paymentScreenshotURL)}"
          alt="Payment screenshot"
          style="width:100%;max-height:400px;object-fit:contain;border-radius:10px;background:#000;"
        />
      `
      : booking.paymentScreenshotMediaId
        ? `
          <div
            id="managerPaymentScreenshotPreview"
            style="min-height:120px;display:grid;place-items:center;color:var(--sub);border:1px solid var(--line);border-radius:10px;"
          >
            Loading payment screenshot...
          </div>
        `
        : `<p style="color:var(--sub);">No payment screenshot uploaded.</p>`;

  body.innerHTML = `
    <div style="display:grid;gap:12px;">
      <div class="manager-summary-row">
        <span>Customer</span>
        <strong>${escapeHtml(booking.userName || "Customer")}</strong>
      </div>
      <div class="manager-summary-row">
        <span>Vehicle</span>
        <strong>${escapeHtml(booking.vehicleName || "Vehicle")}</strong>
      </div>
      <div class="manager-summary-row">
        <span>Amount</span>
        <strong>&#8377;${formatMoney(booking.totalAmount)}</strong>
      </div>
      <div class="manager-summary-row">
        <span>Method</span>
        <strong>${escapeHtml(booking.paymentMethod || "UPI")}</strong>
      </div>
      <div class="manager-summary-row">
        <span>Reference</span>
        <strong style="font-family:monospace;">${escapeHtml(booking.paymentRef || "—")}</strong>
      </div>
      ${screenshotMarkup}
    </div>
  `;

  modal.hidden = false;

  if (
    booking.paymentScreenshotMediaId &&
    !booking.paymentScreenshotURL
  ) {
    const preview = document.getElementById(
      "managerPaymentScreenshotPreview"
    );

    try {
      const objectUrl =
        await fetchManagerPaymentScreenshot(
          booking.paymentScreenshotMediaId
        );

      if (
        activeManagerPaymentBooking !== booking ||
        !preview?.isConnected
      ) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      managerPaymentScreenshotObjectUrl = objectUrl;
      preview.innerHTML = `
        <img
          src="${escapeHtml(objectUrl)}"
          alt="Payment screenshot"
          style="width:100%;max-height:400px;object-fit:contain;border-radius:10px;background:#000;"
        />
      `;
    } catch (error) {
      console.error("Manager payment screenshot error:", error);

      if (preview?.isConnected) {
        preview.innerHTML = `
          <p style="color:#ef476f;padding:16px;text-align:center;">
            The screenshot was uploaded, but its preview could not be loaded.
          </p>
        `;
      }
    }
  }
}

function renderManagerPayments() {
  if (!paymentsWrap) return;

  const pending = currentManagerBookings.filter(
    (booking) =>
      booking.paymentStatus === "pending_verification"
  );

  if (pendingPaymentCountEl) {
    pendingPaymentCountEl.textContent = pending.length;
  }

  if (!pending.length) {
    paymentsWrap.innerHTML = `
      <p style="color:var(--sub);">
        No payments awaiting verification.
      </p>
    `;
    return;
  }

  paymentsWrap.innerHTML = `
    <div style="width:100%;overflow-x:auto;">
      <table class="admin-table" style="width:100%;min-width:760px;border-collapse:collapse;text-align:left;">
        <thead>
          <tr style="border-bottom:1px solid var(--line);color:var(--sub);">
            <th style="padding:12px;">Booking</th>
            <th style="padding:12px;">Customer</th>
            <th style="padding:12px;">Vehicle</th>
            <th style="padding:12px;">Amount</th>
            <th style="padding:12px;">Reference</th>
            <th style="padding:12px;text-align:right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${pending.map((booking) => `
            <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
              <td style="padding:12px;font-family:monospace;">#${escapeHtml(formatBookingNumber(booking))}</td>
              <td style="padding:12px;">${escapeHtml(booking.userName || "Customer")}</td>
              <td style="padding:12px;">${escapeHtml(booking.vehicleName || "Vehicle")}</td>
              <td style="padding:12px;color:var(--accent);font-weight:700;">&#8377;${formatMoney(booking.totalAmount)}</td>
              <td style="padding:12px;font-family:monospace;">${escapeHtml(booking.paymentRef || "—")}</td>
              <td style="padding:12px;text-align:right;">
                <button type="button" class="btn btn-dark manager-review-payment-btn" data-booking-id="${escapeHtml(booking.id)}">
                  Review
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  paymentsWrap
    .querySelectorAll(".manager-review-payment-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const booking = currentManagerBookings.find(
          (item) => item.id === button.dataset.bookingId
        );

        if (booking) {
          openManagerPaymentModal(booking);
        }
      });
    });
}

function initialiseManagerPaymentModal() {
  const modal =
    document.getElementById("managerPaymentModal");
  const closeButton =
    document.getElementById("closeManagerPaymentModal");
  const approveButton =
    document.getElementById("managerApprovePaymentBtn");
  const rejectButton =
    document.getElementById("managerRejectPaymentBtn");

  closeButton?.addEventListener(
    "click",
    closeManagerPaymentModal
  );

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeManagerPaymentModal();
    }
  });

  approveButton?.addEventListener("click", async () => {
    if (!activeManagerPaymentBooking) return;

    const booking = activeManagerPaymentBooking;
    approveButton.disabled = true;
    approveButton.textContent = "Approving...";

    try {
      await api.post(`/payments/${booking.id}/verify`, {
        status: "verified"
      });

      closeManagerPaymentModal();
      await loadManagerBookings();
    } catch (error) {
      console.error("Manager payment approval error:", error);
      alert("Could not approve payment.\n\n" + error.message);
    } finally {
      approveButton.disabled = false;
      approveButton.textContent = "Approve & Confirm Booking";
    }
  });

  rejectButton?.addEventListener("click", async () => {
    if (!activeManagerPaymentBooking) return;

    const reason = prompt("Reason for rejecting this payment:");
    if (reason === null) return;

    const booking = activeManagerPaymentBooking;
    rejectButton.disabled = true;

    try {
      await api.post(`/payments/${booking.id}/verify`, {
        status: "rejected",
        rejectionReason: reason || "Payment could not be verified."
      });

      closeManagerPaymentModal();
      await loadManagerBookings();
    } catch (error) {
      console.error("Manager payment rejection error:", error);
      alert("Could not reject payment.\n\n" + error.message);
    } finally {
      rejectButton.disabled = false;
    }
  });
}

/* =========================================================
   EXECUTIVE PICKUP HANDOVER
========================================================= */

function clearExecutivePickupPreviews() {
  executivePickupPreviewUrls.forEach((url) =>
    URL.revokeObjectURL(url)
  );
  executivePickupPreviewUrls = [];
}

function closeExecutivePickupModal() {
  const modal =
    document.getElementById("executivePickupModal");
  const input =
    document.getElementById("executivePickupPhotos");
  const preview =
    document.getElementById("executivePickupPreview");
  const status =
    document.getElementById("executivePickupStatus");

  if (modal) {
    modal.hidden = true;
    modal.style.display = "";
  }
  if (input) input.value = "";
  if (preview) preview.innerHTML = "";
  if (status) status.textContent = "";
  clearExecutivePickupPreviews();
  activeExecutivePickupBooking = null;
}

function openExecutivePickupModal(booking) {
  closeExecutivePickupModal();
  activeExecutivePickupBooking = booking;

  const modal =
    document.getElementById("executivePickupModal");
  const title =
    document.getElementById("executivePickupModalTitle");
  const notes =
    document.getElementById("executivePickupNotes");
  const odoInput =
    document.getElementById("executivePickupOdo");
  const fastagInput =
    document.getElementById("executivePickupFastag");
  const fuelSelect =
    document.getElementById("executivePickupFuel");

  if (!modal) {
    alert("Pickup handover is unavailable on this page. Please refresh and try again.");
    return;
  }

  if (title) {
    title.textContent =
      `Pickup — ${booking.vehicleName || "Vehicle"} (#${formatBookingNumber(booking)})`;
  }

  if (notes) notes.value = booking.pickupNotes || "";
  if (odoInput) odoInput.value = booking.pickupOdometer != null ? booking.pickupOdometer : "";
  if (fastagInput) fastagInput.value = booking.pickupFastagBalance != null ? booking.pickupFastagBalance : "";
  if (fuelSelect) fuelSelect.value = booking.pickupFuelLevel || "";

  const fullPaidCheck = document.getElementById("executivePickupFullPaidCheck");
  const balanceDisplay = document.getElementById("executivePickupBalanceDisplay");
  const payModeSelect = document.getElementById("executivePickupPayMode");
  const payRefInput = document.getElementById("executivePickupPayRef");

  const totalAmount = Number(booking.finalAmount || booking.totalAmount || booking.rentalTotal || 0);
  const paidSoFar = Number(booking.paymentAmountPaid || booking.advanceAmount || (booking.paymentStatus === "paid" ? totalAmount : 0));
  const remaining = Math.max(0, Number(booking.remainingBalance ?? (totalAmount - paidSoFar)));

  if (balanceDisplay) {
    balanceDisplay.textContent = `₹${Math.round(remaining).toLocaleString("en-IN")}`;
  }

  if (fullPaidCheck) {
    fullPaidCheck.checked = (booking.paymentStatus === "paid" || remaining > 0);
  }

  if (payModeSelect) {
    payModeSelect.value = booking.paymentMode || "UPI";
  }

  if (payRefInput) {
    payRefInput.value = booking.paymentRef || "";
  }

  modal.hidden = false;
  modal.style.display = "flex";
}

async function uploadExecutivePickupPhoto(file, bookingId) {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", "inspection_photo");
  formData.append("relatedId", bookingId);

  const response = await fetch(
    `${MEDIA_SERVER_URL}/api/media/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.id) {
    throw new Error(
      data.error || `Photo upload failed (${response.status}).`
    );
  }

  return data;
}

async function removeExecutiveMedia(mediaId) {
  try {
    const token = await getAuthToken();
    await fetch(
      `${MEDIA_SERVER_URL}/api/media/${encodeURIComponent(mediaId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (error) {
    console.warn("Could not clean up pickup photo:", error);
  }
}

async function fetchExecutiveMedia(mediaId) {
  const token = await getAuthToken();
  const response = await fetch(
    `${MEDIA_SERVER_URL}/api/media/file/${encodeURIComponent(mediaId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Could not load pickup photo (${response.status}).`);
  }

  return URL.createObjectURL(await response.blob());
}

function initialiseExecutivePickupModal() {
  const modal =
    document.getElementById("executivePickupModal");
  const closeButton =
    document.getElementById("closeExecutivePickupModal");
  const input =
    document.getElementById("executivePickupPhotos");
  const preview =
    document.getElementById("executivePickupPreview");
  const notes =
    document.getElementById("executivePickupNotes");
  const status =
    document.getElementById("executivePickupStatus");
  const saveButton =
    document.getElementById("saveExecutivePickupBtn");
  const odoInput =
    document.getElementById("executivePickupOdo");
  const fastagInput =
    document.getElementById("executivePickupFastag");
  const fuelSelect =
    document.getElementById("executivePickupFuel");

  closeButton?.addEventListener("click", closeExecutivePickupModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeExecutivePickupModal();
  });

  input?.addEventListener("change", () => {
    clearExecutivePickupPreviews();
    if (preview) preview.innerHTML = "";

    const files = [...(input.files || [])];

    // Update the styled label button text
    const uploadBtn = document.querySelector(".pickup-upload-btn");
    if (uploadBtn) {
      if (files.length) {
        uploadBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          ${files.length} photo${files.length === 1 ? "" : "s"} selected
        `;
        uploadBtn.style.background = "rgba(79, 215, 255, 0.14)";
      } else {
        uploadBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Choose Photos
        `;
        uploadBtn.style.background = "";
      }
    }

    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      executivePickupPreviewUrls.push(url);

      if (preview) {
        preview.insertAdjacentHTML(
          "beforeend",
          `<img src="${escapeHtml(url)}" alt="Selected pickup condition" style="width:100%;height:110px;object-fit:cover;border-radius:10px;border:1px solid var(--line);" />`
        );
      }
    });
  });

  saveButton?.addEventListener("click", async () => {
    const booking = activeExecutivePickupBooking;
    const files = [...(input?.files || [])];

    if (!booking) return;

    if (!files.length) {
      if (status) {
        status.textContent = "Upload at least one pickup-condition photo before confirming.";
        status.style.color = "#ef476f";
      }
      input?.focus();
      return;
    }

    const invalidFile = files.find(
      (file) =>
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
    );

    if (invalidFile) {
      if (status) {
        status.textContent = "Use JPG, PNG, or WebP images up to 10 MB each.";
        status.style.color = "#ef476f";
      }
      return;
    }

    // Collect new fields
    const odoRaw = odoInput?.value?.trim();
    const fastagRaw = fastagInput?.value?.trim();
    const fuelLevel = fuelSelect?.value || "";
    const pickupOdometer = odoRaw !== "" && !isNaN(Number(odoRaw)) ? Number(odoRaw) : null;
    const pickupFastagBalance = fastagRaw !== "" && !isNaN(Number(fastagRaw)) ? Number(fastagRaw) : null;

    const uploadedIds = [];
    saveButton.disabled = true;
    saveButton.textContent = "Uploading pickup photos...";

    try {
      for (const file of files) {
        const uploaded = await uploadExecutivePickupPhoto(file, booking.id);
        uploadedIds.push(uploaded.id);
      }

      const updatePayload = {
        pickupStatus: "picked_up",
        pickupAt: new Date().toISOString(),
        pickupHandledBy: currentUser?.uid || null,
        pickupNotes: notes?.value.trim() || "",
        pickupPhotoMediaIds: uploadedIds,
        updatedAt: new Date().toISOString(),
      };

      if (pickupOdometer !== null) updatePayload.pickupOdometer = pickupOdometer;
      if (pickupFastagBalance !== null) updatePayload.pickupFastagBalance = pickupFastagBalance;
      if (fuelLevel) updatePayload.pickupFuelLevel = fuelLevel;

      const fullPaidChecked = document.getElementById("executivePickupFullPaidCheck")?.checked;
      const payMode = document.getElementById("executivePickupPayMode")?.value || "UPI";
      const payRef = document.getElementById("executivePickupPayRef")?.value.trim() || "";

      if (fullPaidChecked || payRef) {
        const fullTotal = Number(booking.finalAmount || booking.totalAmount || booking.rentalTotal || 0);
        updatePayload.paymentPlan = "full";
        updatePayload.paymentStatus = "paid";
        updatePayload.paymentAmountPaid = fullTotal;
        updatePayload.paymentAmount = fullTotal;
        updatePayload.advanceAmount = fullTotal;
        updatePayload.remainingBalance = 0;
        updatePayload.remainingAmount = 0;
        updatePayload.paymentMode = payMode;
        if (payRef) updatePayload.paymentRef = payRef;
        updatePayload.pickupPaymentCollected = true;
        updatePayload.pickupPaymentCollectedAt = new Date().toISOString();
        updatePayload.pickupPaymentCollectedBy = currentUser?.displayName || currentUser?.email || currentUser?.uid || "Executive";
      }

      await api.put(`/bookings/${booking.id}`, updatePayload);

      closeExecutivePickupModal();
      await loadManagerBookings();
    } catch (error) {
      await Promise.all(
        uploadedIds.map((id) => removeExecutiveMedia(id))
      );
      console.error("Executive pickup error:", error);

      if (status) {
        status.textContent = error.message || "Could not confirm pickup.";
        status.style.color = "#ef476f";
      }
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Upload Photos & Confirm Pickup";
    }
  });
}

initialiseExecutivePickupModal();

async function openExecutiveBookingDetails(booking) {
  document.getElementById("executiveBookingDetails")?.remove();

  const customer = currentManagerUsers.find(
    (user) => user.id === booking.userId || user.uid === booking.userId || user.id === booking.firebaseUid || user.uid === booking.firebaseUid || (user.email && booking.userEmail && user.email.toLowerCase() === booking.userEmail.toLowerCase())
  ) || {};
  const mediaIds = Array.isArray(booking.pickupPhotoMediaIds)
    ? booking.pickupPhotoMediaIds
    : [];

  const returnInspection = booking.returnInspection || {};
  const returnMediaIds = Array.isArray(returnInspection.returnPhotoMediaIds) && returnInspection.returnPhotoMediaIds.length
    ? returnInspection.returnPhotoMediaIds
    : Array.isArray(returnInspection.photos)
      ? returnInspection.photos.map((p) => p.mediaId || p.url).filter(Boolean)
      : Array.isArray(returnInspection.returnPhotos)
        ? returnInspection.returnPhotos
        : [];

  const returnItems = (Array.isArray(returnInspection.items) ? returnInspection.items : []).filter(
    (i) => i.checked === true || i.checked === "true"
  );
  const returnNotes = returnInspection.notes || booking.returnNotes || "";

  const overlay = document.createElement("div");
  overlay.id = "executiveBookingDetails";
  overlay.className = "manager-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "executiveBookingDetailsTitle");
  overlay.innerHTML = `
    <div class="card manager-modal-card executive-details-modal">
      <button type="button" class="manager-modal-close" id="closeExecutiveBookingDetails" aria-label="Close booking details">&times;</button>
      <header class="executive-details-header">
        <span class="section-label">Booking details</span>
        <h3 id="executiveBookingDetailsTitle" class="manager-modal-title">Customer &amp; Trip Overview</h3>
        <p class="manager-modal-subtitle">Booking #${escapeHtml(formatBookingNumber(booking))}</p>
      </header>

      <div class="executive-details-tabs" role="tablist" aria-label="Booking detail sections">
        <button type="button" role="tab" id="executiveOverviewTab" aria-controls="executiveOverviewPanel" aria-selected="true" class="active" data-details-tab="overview">
          Overview
        </button>
        <button type="button" role="tab" id="executivePhotosTab" aria-controls="executivePhotosPanel" aria-selected="false" tabindex="-1" data-details-tab="photos">
          Pickup Photos <span>${mediaIds.length}</span>
        </button>
        ${returnMediaIds.length ? `
        <button type="button" role="tab" id="executiveReturnPhotosTab" aria-controls="executiveReturnPhotosPanel" aria-selected="false" tabindex="-1" data-details-tab="return-photos">
          Return Photos <span>${returnMediaIds.length}</span>
        </button>
        ` : ""}
      </div>

      <section id="executiveOverviewPanel" class="executive-details-panel" role="tabpanel" aria-labelledby="executiveOverviewTab" data-details-panel="overview">
        <div class="executive-details-grid">
          ${[
            ["Customer", customer.name || customer.fullName || customer.displayName || booking.userName || booking.customerName || "Customer"],
            ["Email", customer.email || booking.userEmail || booking.customerEmail || "—"],
            ["Phone", customer.phone || customer.phoneNumber || booking.userPhone || booking.customerPhone || booking.phone || "—"],
            ["Age", customer.age || booking.userAge || booking.age || "—"],
            ["Vehicle", booking.vehicleName || "Vehicle"],
            ["Registration", booking.vehicleReg || booking.registration || booking.vehicleRegistration || booking.regNo || booking.regNumber || "—"],
            ["Pickup", formatDisplayDate(booking.pickupDate)],
            ["Drop", formatDisplayDate(booking.dropDate)],
            ["Booking status", formatStatus(booking.status || booking.bookingStatus)],
            ["Pickup status", formatStatus(booking.pickupStatus || (booking.status === "in_trip" || booking.status === "completed" ? "picked_up" : "awaiting pickup"))],
            ["Pickup Odometer", booking.pickupOdometer != null ? `${Number(booking.pickupOdometer).toLocaleString("en-IN")} km` : (booking.startOdometer != null ? `${Number(booking.startOdometer).toLocaleString("en-IN")} km` : "—")],
            ["Return Odometer", returnInspection.returnOdometer != null ? `${Number(returnInspection.returnOdometer).toLocaleString("en-IN")} km` : (booking.endOdometer != null ? `${Number(booking.endOdometer).toLocaleString("en-IN")} km` : "—")],
            ["Pickup FASTag", booking.pickupFastagBalance != null ? `₹${Number(booking.pickupFastagBalance).toLocaleString("en-IN")}` : (booking.startFastag != null ? `₹${Number(booking.startFastag).toLocaleString("en-IN")}` : "—")],
            ["Return FASTag", returnInspection.returnFastagBalance != null ? `₹${Number(returnInspection.returnFastagBalance).toLocaleString("en-IN")}` : (booking.returnFastag != null ? `₹${Number(booking.returnFastag).toLocaleString("en-IN")}` : "—")],
            ["Fuel Level", booking.pickupFuelLevel || booking.fuelLevel || returnInspection.fuelLevel || "—"],
          ].map(([label, value]) => `
            <div class="executive-detail-item">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>
          `).join("")}
        </div>
        ${booking.pickupNotes ? `<div class="executive-detail-notes"><span>Pickup notes</span><p>${escapeHtml(booking.pickupNotes)}</p></div>` : ""}
        ${returnNotes ? `<div class="executive-detail-notes" style="margin-top:10px;"><span>Return notes</span><p>${escapeHtml(returnNotes)}</p></div>` : ""}

        ${(returnInspection && (returnInspection.processedAt || returnInspection.returnOdometer != null || returnItems.length > 0 || returnInspection.deductionTotal > 0)) ? `
        <div class="executive-detail-notes" style="margin-top:14px; border:1px solid rgba(79,215,255,0.25); background:rgba(79,215,255,0.03); border-radius:10px; padding:14px;">
          <span style="color:#4fd7ff; font-weight:800; text-transform:uppercase; font-size:0.75rem; letter-spacing:0.05em; display:block; margin-bottom:8px;">Return Inspection &amp; Deductions</span>
          ${returnItems.length ? `
            <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px;">
              ${returnItems.map((item) => `
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:4px 0; border-bottom:1px dashed var(--line);">
                  <span>${escapeHtml(item.label || item.name || item.key)}</span>
                  <strong style="color:#ef476f;">₹${Number(item.amount || 0).toLocaleString("en-IN")}</strong>
                </div>
              `).join("")}
            </div>
          ` : `<p style="margin:0 0 8px; color:var(--sub); font-size:0.85rem;">No damage deductions recorded.</p>`}
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; border-top:1px solid var(--line); padding-top:8px;">
            <span>Total Deductions: <strong style="color:#ef476f;">₹${Number(returnInspection.deductionTotal || 0).toLocaleString("en-IN")}</strong></span>
            <span>Deposit Refund: <strong style="color:#34d399;">₹${Number(returnInspection.depositRefund ?? Math.max(0, (booking.securityDeposit || 0) - (returnInspection.deductionTotal || 0))).toLocaleString("en-IN")}</strong></span>
          </div>
        </div>
        ` : ""}
      </section>

      <section id="executivePhotosPanel" class="executive-details-panel" role="tabpanel" aria-labelledby="executivePhotosTab" data-details-panel="photos" hidden>
        <div id="executivePickupPhotoGallery" class="executive-details-gallery">
          ${mediaIds.length ? '<div class="manager-state">Loading pickup photos...</div>' : '<div class="executive-details-empty">No pickup photos recorded yet.</div>'}
        </div>
      </section>

      ${returnMediaIds.length ? `
      <section id="executiveReturnPhotosPanel" class="executive-details-panel" role="tabpanel" aria-labelledby="executiveReturnPhotosTab" data-details-panel="return-photos" hidden>
        <div id="executiveReturnPhotoGallery" class="executive-details-gallery">
          <div class="manager-state">Loading return photos...</div>
        </div>
      </section>
      ` : ""}
    </div>
  `;

  document.body.appendChild(overlay);
  const previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const objectUrls = [];
  let closed = false;
  function handleDetailsKeydown(event) {
    if (event.key === "Escape") close();
  }
  const close = () => {
    if (closed) return;
    closed = true;
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    document.removeEventListener("keydown", handleDetailsKeydown);
    document.body.style.overflow = previousBodyOverflow;
    overlay.remove();
  };

  overlay.querySelector("#closeExecutiveBookingDetails")?.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", handleDetailsKeydown);

  const detailTabs = Array.from(
    overlay.querySelectorAll("[data-details-tab]")
  );
  const detailPanels = Array.from(
    overlay.querySelectorAll("[data-details-panel]")
  );

  detailTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.detailsTab;

      detailTabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
        item.tabIndex = active ? 0 : -1;
      });

      detailPanels.forEach((panel) => {
        panel.hidden = panel.dataset.detailsPanel !== target;
      });
    });
  });

  overlay.querySelector("#closeExecutiveBookingDetails")?.focus();

  if (mediaIds.length) {
    const gallery = overlay.querySelector("#executivePickupPhotoGallery");
    const photos = await Promise.all(
      mediaIds.map(async (id) => {
        try {
          const url = await fetchExecutiveMedia(id);
          if (closed) {
            URL.revokeObjectURL(url);
            return "";
          }
          objectUrls.push(url);
          return `<img src="${escapeHtml(url)}" alt="Pickup condition photo" />`;
        } catch {
          return `<div class="executive-details-photo-error">Photo unavailable</div>`;
        }
      })
    );

    if (gallery?.isConnected) {
      gallery.innerHTML = photos.filter(Boolean).join("");
    }
  }

  if (returnMediaIds.length) {
    const returnGallery = overlay.querySelector("#executiveReturnPhotoGallery");
    const returnPhotos = await Promise.all(
      returnMediaIds.map(async (mediaRef) => {
        try {
          let url = "";
          if (typeof mediaRef === "string" && (mediaRef.startsWith("http") || mediaRef.startsWith("blob:") || mediaRef.startsWith("data:"))) {
            url = mediaRef;
          } else {
            const mediaId = typeof mediaRef === "object" ? (mediaRef.mediaId || mediaRef.url) : mediaRef;
            url = await fetchExecutiveMedia(mediaId);
            if (closed) {
              URL.revokeObjectURL(url);
              return "";
            }
            objectUrls.push(url);
          }
          return `<img src="${escapeHtml(url)}" alt="Return condition photo" />`;
        } catch {
          return `<div class="executive-details-photo-error">Photo unavailable</div>`;
        }
      })
    );

    if (returnGallery?.isConnected) {
      returnGallery.innerHTML = returnPhotos.filter(Boolean).join("");
    }
  }
}

/* =========================================================
   BOOKINGS
========================================================= */

async function loadManagerBookings() {
  if (!bookingsWrap) return;

  bookingsWrap.innerHTML = `
    <p style="color: var(--sub);">
      Loading bookings...
    </p>
  `;

  try {
    const res = await api.get("/bookings");
    const bookings = Array.isArray(res.bookings) ? res.bookings : [];
    currentManagerBookings = bookings;

    /* =====================================================
       ACTIVE TRIPS
    ===================================================== */

    const activeTrips = bookings.filter(
      (booking) =>
        booking.status === "confirmed" &&
        booking.pickupStatus === "picked_up"
    );

    if (activeCountEl) {
      activeCountEl.textContent =
        activeTrips.length;
    }

    /* =====================================================
       PICKUPS TODAY
    ===================================================== */

    const today = new Date();

    const todayISO =
      today.getFullYear() +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0");

    const pickupsToday = bookings.filter(
      (booking) =>
        booking.pickupDate === todayISO &&
        booking.status === "confirmed" &&
        booking.pickupStatus !== "picked_up"
    );

    if (pickupCountEl) {
      pickupCountEl.textContent =
        pickupsToday.length;
    }

    const returnsToday = bookings.filter(
      (booking) =>
        (booking.dropDate || booking.returnDate || booking.endDate) === todayISO &&
        booking.status === "confirmed" &&
        booking.pickupStatus === "picked_up"
    );

    if (returnCountEl) {
      returnCountEl.textContent = returnsToday.length;
    }

    renderManagerBookingsTable(getSortedManagerBookings());

  } catch (error) {
    console.error(
      "Error loading manager bookings:",
      error
    );

    bookingsWrap.innerHTML = `
      <div style="
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 12px;
      ">

        <p style="
          color: #ef476f;
          margin-bottom: 8px;
        ">
          Couldn't load bookings.
        </p>

        <small style="color: var(--sub);">
          ${escapeHtml(
            error.message || "Unknown error"
          )}
        </small>

      </div>
    `;
  }
}

function getManagerBookingDateMillis(booking) {
  const value =
    booking.pickupDate ||
    booking.startDate ||
    booking.bookingDate ||
    booking.createdAt;

  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value === "number") {
    return value;
  }

  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? `${value}T00:00:00`
    : value;
  const parsed = new Date(dateValue).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDisplayDate(value) {
  if (!value) return "—";
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value?.toMillis === "function") {
    date = new Date(value.toMillis());
  } else if (typeof value === "number") {
    date = new Date(value);
  } else {
    const stringVal = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(stringVal)) {
      const [y, m, d] = stringVal.slice(0, 10).split("-").map(Number);
      date = new Date(y, m - 1, d);
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(stringVal)) {
      const [d, m, y] = stringVal.split(" ")[0].split("/").map(Number);
      date = new Date(y, m - 1, d);
    } else {
      date = new Date(stringVal);
    }
  }

  if (!date || Number.isNaN(date.getTime())) return String(value || "—");

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getSortedManagerBookings() {
  const direction = managerBookingSortDirection === "asc" ? 1 : -1;
  const from = managerBookingDateFrom
    ? new Date(`${managerBookingDateFrom}T00:00:00`).getTime()
    : null;
  const to = managerBookingDateTo
    ? new Date(`${managerBookingDateTo}T23:59:59.999`).getTime()
    : null;

  return currentManagerBookings.filter((booking) => {
    const date = getManagerBookingDateMillis(booking);
    return (!from || date >= from) && (!to || date <= to);
  }).sort((a, b) => {
    const dateDifference =
      getManagerBookingDateMillis(a) - getManagerBookingDateMillis(b);

    if (dateDifference !== 0) {
      return dateDifference * direction;
    }

    return String(a.id).localeCompare(String(b.id)) * direction;
  });
}

/* =========================================================
   BOOKING TABLE
========================================================= */

function renderManagerBookingsTable(bookings) {
  if (!bookingsWrap) return;

  if (!bookings.length) {
    bookingsWrap.innerHTML = `
      <div style="
        padding: 30px;
        text-align: center;
        color: var(--sub);
      ">
        No bookings currently in the system.
      </div>
    `;

    return;
  }

  const totalPages = Math.max(
    1,
    Math.ceil(bookings.length / MANAGER_BOOKINGS_PER_PAGE)
  );
  managerBookingPage = Math.min(managerBookingPage, totalPages);
  const pageStart =
    (managerBookingPage - 1) * MANAGER_BOOKINGS_PER_PAGE;
  const pageBookings = bookings.slice(
    pageStart,
    pageStart + MANAGER_BOOKINGS_PER_PAGE
  );

  let html = `
    <div style="
      width: 100%;
      overflow-x: auto;
    ">

      <table
        class="admin-table"
        style="
          width: 100%;
          min-width: 1080px;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.9rem;
        "
      >

        <thead>

          <tr style="
            border-bottom: 1px solid var(--line);
            color: var(--sub);
          ">

            <th style="padding: 14px;">
              Customer
            </th>

            <th style="padding: 14px;">
              Vehicle
            </th>

            <th style="padding: 14px;">
              Pickup
            </th>

            <th style="padding: 14px;">
              Return
            </th>

            <th style="padding: 14px;">
              Payment
            </th>

            <th style="padding: 14px;">
              Status
            </th>

            <th style="
              padding: 14px;
              text-align: right;
            ">
              Action
            </th>

          </tr>

        </thead>

        <tbody>
  `;

  pageBookings.forEach((booking) => {
    const status = String(
      booking.status || "unknown"
    )
      .trim()
      .toLowerCase();

    /* =====================================================
       CUSTOMER
    ===================================================== */

    const customer =
      booking.userName ||
      booking.customerName ||
      booking.name ||
      "Customer";

    const phone =
      booking.userPhone ||
      booking.phone ||
      booking.userEmail ||
      booking.email ||
      "—";

    /* =====================================================
       VEHICLE
    ===================================================== */

    const vehicle =
      booking.vehicleName ||
      booking.carName ||
      booking.vehicle ||
      "Vehicle";

    const registration =
      booking.vehicleReg ||
      booking.regNumber ||
      booking.registration ||
      "—";

    /* =====================================================
       DATES
    ===================================================== */

    const pickup = formatDisplayDate(
      booking.pickupDate ||
      booking.startDate ||
      ""
    );

    const drop = formatDisplayDate(
      booking.dropDate ||
      booking.returnDate ||
      booking.endDate ||
      ""
    );

    const paymentStatus = formatStatus(
      booking.paymentStatus || "payment pending"
    );
    const paymentAmount = Number(
      booking.totalAmount ?? booking.amount ?? booking.total ?? 0
    );

    /* =====================================================
       STATUS CLASS
    ===================================================== */

    let statusClass = "pending";
    let displayBookingStatus = formatStatus(status);

    if (
      status === "confirmed" ||
      status === "completed"
    ) {
      statusClass = "verified";
    }

    if (
      status === "cancelled" ||
      status === "rejected" ||
      status === "failed" ||
      booking.paymentStatus === "rejected"
    ) {
      statusClass = "rejected";
      if (booking.paymentStatus === "rejected") {
        displayBookingStatus = "Payment Rejected";
      }
    }

    /* =====================================================
       ACTIONS
    ===================================================== */

    const detailsButton = `
      <button
        type="button"
        class="btn btn-outline executive-booking-details-btn"
        data-booking-id="${escapeHtml(booking.id)}"
        style="white-space:nowrap;"
      >
        Details
      </button>
    `;

    let actionCell = detailsButton;

    /* -----------------------------------------------------
       CONFIRMED BOOKING
    ----------------------------------------------------- */

    if (status === "confirmed") {
      const pickupComplete =
        booking.pickupStatus === "picked_up";

      actionCell = `
        <div style="
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          align-items: center;
          flex-wrap: wrap;
        ">

          ${detailsButton}

          ${pickupComplete
            ? `
              <button
                type="button"
                class="btn btn-dark process-return-btn"
                data-booking-id="${escapeHtml(booking.id)}"
                style="white-space:nowrap;"
              >
                Process Drop
              </button>
            `
            : `
              <button
                type="button"
                class="btn btn-dark executive-pickup-btn"
                data-booking-id="${escapeHtml(booking.id)}"
                style="white-space:nowrap;"
              >
                Start Pickup
              </button>
            `}

          <button
            type="button"
            class="btn btn-outline mgr-status-btn"
            data-booking-id="${escapeHtml(booking.id)}"
            data-status="cancelled"
            style="
              color: #ef476f;
              border-color: #ef476f;
              white-space: nowrap;
            "
          >
            Cancel
          </button>

        </div>
      `;
    }

    /* -----------------------------------------------------
       COMPLETED BOOKING
       
       IMPORTANT:
       Do NOT call openReturnModal() here.
       We use a dedicated report button.
    ----------------------------------------------------- */

    if (status === "completed") {
      actionCell = `
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          ${detailsButton}
          <button
            type="button"
            class="btn btn-outline view-return-report-btn"
            data-booking-id="${escapeHtml(booking.id)}"
            style="white-space:nowrap;"
          >
            Return Report
          </button>
        </div>
      `;
    }

    /* =====================================================
       ROW
    ===================================================== */

    html += `
      <tr style="
        border-bottom:
          1px solid rgba(255,255,255,0.06);
      ">

        <td style="padding: 14px;">

          <strong>
            ${escapeHtml(customer)}
          </strong>

          <br>

          <span style="
            color: var(--sub);
            font-size: 0.8rem;
          ">
            ${escapeHtml(phone)}
          </span>

        </td>

        <td style="padding: 14px;">

          ${escapeHtml(vehicle)}

          <br>

          <span style="
            color: var(--sub);
            font-size: 0.8rem;
          ">
            ${escapeHtml(registration)}
          </span>

        </td>

        <td style="padding: 14px;">
          ${escapeHtml(pickup)}
        </td>

        <td style="padding: 14px;">
          ${escapeHtml(drop)}
        </td>

        <td style="padding: 14px;">
          <strong>₹${Number.isFinite(paymentAmount) ? paymentAmount.toLocaleString("en-IN") : "0"}</strong>
          <div style="margin-top: 4px; color: var(--sub); font-size: 0.75rem;">
            ${escapeHtml(paymentStatus)}
          </div>
        </td>

        <td style="padding: 14px;">

          <span class="
            fleet-status
            ${statusClass}
          ">
            ${escapeHtml(displayBookingStatus)}
          </span>

          ${status === "confirmed" ? `
            <div style="margin-top:6px;color:var(--sub);font-size:.75rem;">
              ${escapeHtml(formatStatus(booking.pickupStatus || "awaiting pickup"))}
            </div>
          ` : ""}

        </td>

        <td style="
          padding: 14px;
          text-align: right;
        ">

          ${actionCell}

        </td>

      </tr>
    `;
  });

  html += `
        </tbody>

      </table>

    </div>
    ${renderManagerPagination(totalPages, bookings.length)}
  `;

  bookingsWrap.innerHTML = html;

  attachBookingButtonEvents();

  bookingsWrap
    .querySelectorAll("[data-manager-page-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        managerBookingPage +=
          button.dataset.managerPageAction === "next" ? 1 : -1;
        renderManagerBookingsTable(getSortedManagerBookings());
        bookingsWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
}

function renderManagerPagination(totalPages, totalItems) {
  if (totalPages <= 1) return "";

  return `
    <nav class="data-pagination" aria-label="Executive booking pages">
      <span class="data-pagination__summary">
        Page <strong>${managerBookingPage}</strong> of <strong>${totalPages}</strong> · <span style="color:var(--kr-text-muted);">${totalItems} bookings</span>
      </span>
      <div class="data-pagination__actions">
        <button type="button" class="btn-pagination" data-manager-page-action="previous" ${managerBookingPage === 1 ? "disabled" : ""}>
          &larr; Previous
        </button>
        <button type="button" class="btn-pagination" data-manager-page-action="next" ${managerBookingPage === totalPages ? "disabled" : ""}>
          Next &rarr;
        </button>
      </div>
    </nav>`;
}

/* =========================================================
   BOOKING BUTTON EVENTS
========================================================= */

function attachBookingButtonEvents() {

  bookingsWrap
    .querySelectorAll(".executive-booking-details-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const booking = currentManagerBookings.find(
          (item) => item.id === button.dataset.bookingId
        );

        if (booking) openExecutiveBookingDetails(booking);
      });
    });

  bookingsWrap
    .querySelectorAll(".executive-pickup-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const booking = currentManagerBookings.find(
          (item) => item.id === button.dataset.bookingId
        );

        if (booking) openExecutivePickupModal(booking);
      });
    });

  /* =====================================================
     CANCEL BUTTONS
  ===================================================== */

  const statusButtons =
    bookingsWrap.querySelectorAll(
      ".mgr-status-btn"
    );

  statusButtons.forEach((button) => {

    button.addEventListener(
      "click",
      async (event) => {

        event.preventDefault();

        const bookingId =
          button.dataset.bookingId;

        const newStatus =
          button.dataset.status;

        if (!bookingId) {
          alert(
            "This booking does not have a valid ID."
          );
          return;
        }

        const confirmed =
          window.confirm(
            "Are you sure you want to cancel this booking?"
          );

        if (!confirmed) return;

        const originalText =
          button.textContent;

        button.disabled = true;
        button.textContent =
          "Cancelling...";

        try {

          await api.post("/bookings/cancel", {
            bookingId: bookingId,
            reason: "Cancelled from Manager/Executive panel"
          });

          await loadManagerBookings();

        } catch (error) {

          console.error(
            "Failed to cancel booking:",
            error
          );

          alert(
            "Failed to cancel booking.\n\n" +
            error.message
          );

          button.disabled = false;
          button.textContent =
            originalText;
        }
      }
    );

  });

  /* =====================================================
     PROCESS RETURN BUTTONS
  ===================================================== */

  const returnButtons =
    bookingsWrap.querySelectorAll(
      ".process-return-btn"
    );

  returnButtons.forEach((button) => {

    button.addEventListener(
      "click",
      async (event) => {

        event.preventDefault();

        const bookingId =
          button.dataset.bookingId;

        if (!bookingId) {
          alert(
            "This booking does not have a valid ID."
          );
          return;
        }

        const booking =
          currentManagerBookings.find(
            (item) =>
              item.id === bookingId
          );

        if (!booking) {
          alert(
            "Could not find this booking."
          );
          return;
        }

        try {

          openReturnModal({
            booking,
            currentUser,

            onSaved: async () => {
              await loadManagerBookings();
            },
          });

        } catch (error) {

          console.error(
            "Failed to open return inspection:",
            error
          );

          alert(
            "Could not open the return inspection.\n\n" +
            error.message
          );
        }
      }
    );

  });

  /* =====================================================
     VIEW RETURN REPORT BUTTONS
     
     THIS IS THE IMPORTANT FIX.
  ===================================================== */

  const reportButtons =
    bookingsWrap.querySelectorAll(
      ".view-return-report-btn"
    );

  reportButtons.forEach((button) => {

    button.addEventListener(
      "click",
      async (event) => {

        event.preventDefault();

        const bookingId =
          button.dataset.bookingId;

        if (!bookingId) {
          alert(
            "This booking does not have a valid ID."
          );
          return;
        }

        const booking =
          currentManagerBookings.find(
            (item) =>
              item.id === bookingId
          );

        if (!booking) {
          alert(
            "Could not find this booking."
          );
          return;
        }

        openReturnReport(booking);
      }
    );

  });
}

/* =========================================================
   RETURN REPORT
========================================================= */

function openReturnReport(booking) {

  const inspection =
    booking.returnInspection || {};

  const overlay =
    document.createElement("div");

  overlay.id =
    "managerReturnReportOverlay";

  overlay.className = "manager-modal";

  const vehicleName =
    booking.vehicleName ||
    booking.carName ||
    "Vehicle";

  const registration =
    booking.vehicleReg ||
    booking.regNumber ||
    booking.registration ||
    "—";

  const customer =
    booking.userName ||
    booking.customerName ||
    "Customer";

  const deposit =
    getNumber(
      inspection.securityDeposit ??
      inspection.deposit ??
      booking.securityDeposit ??
      booking.deposit ??
      0
    );

  /* =====================================================
     INSPECTION ITEMS (ONLY CHECKED ITEMS ARE DEDUCTED)
  ===================================================== */

  const rawItems =
    inspection.items ||
    inspection.checklist ||
    inspection.damageItems ||
    [];

  const items = (Array.isArray(rawItems) ? rawItems : []).filter((item) => {
    if (typeof item === "string") return true;
    return item.checked === true || item.checked === "true";
  });

  const calculatedDeductions = items.reduce((sum, item) => {
    if (typeof item === "string") return sum;
    return sum + getNumber(item.amount ?? item.deduction ?? item.cost ?? 0);
  }, 0);

  const deductions = getNumber(
    inspection.totalDeductions ??
    inspection.deductions ??
    inspection.deductionTotal ??
    calculatedDeductions
  );

  const refund =
    getNumber(
      inspection.refundableAmount ??
      inspection.depositRefund ??
      inspection.refundAmount ??
      Math.max(deposit - deductions, 0)
    );

  const notes =
    inspection.invoiceNotes ||
    inspection.notes ||
    booking.returnNotes ||
    "No inspection notes were added.";

  const returnPhotoRefs =
    Array.isArray(inspection.returnPhotoMediaIds) && inspection.returnPhotoMediaIds.length
      ? inspection.returnPhotoMediaIds.map((mediaId, index) => ({
          mediaId,
          name: `Photo ${index + 1}`,
        }))
      : Array.isArray(inspection.photos)
        ? inspection.photos
        : [];

  const completedAt =
    formatDateTime(
      inspection.completedAt ||
      inspection.returnedAt ||
      booking.completedAt
    );

  const inspectedBy =
    inspection.inspectedByName ||
    inspection.inspectedBy ||
    booking.returnedBy ||
    "Executive";

  let itemsHtml = "";

  if (Array.isArray(items) && items.length) {

    itemsHtml = `
      <div style="
        margin-top: 24px;
      ">

        <h4 style="
          margin: 0 0 12px;
          font-size: 1rem;
        ">
          Inspection Items
        </h4>

        <div style="
          display: flex;
          flex-direction: column;
          gap: 8px;
        ">

          ${items.map((item) => {

            if (
              typeof item === "string"
            ) {
              return `
                <div style="
                  padding: 12px;
                  border: 1px solid var(--line);
                  border-radius: 10px;
                ">
                  ${escapeHtml(item)}
                </div>
              `;
            }

            const title =
              item.name ||
              item.title ||
              item.label ||
              item.description ||
              "Inspection item";

            const amount =
              getNumber(
                item.amount ??
                item.deduction ??
                item.cost ??
                0
              );

            const status =
              item.status ||
              item.condition ||
              (item.checked
                ? "Checked"
                : "");

            return `
              <div style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;

                padding: 12px;

                border: 1px solid var(--line);
                border-radius: 10px;
              ">

                <div>

                  <strong>
                    ${escapeHtml(title)}
                  </strong>

                  ${
                    status
                      ? `
                        <div style="
                          margin-top: 4px;
                          color: var(--sub);
                          font-size: 0.82rem;
                        ">
                          ${escapeHtml(status)}
                        </div>
                      `
                      : ""
                  }

                </div>

                ${
                  amount > 0
                    ? `
                      <strong style="
                        color: #ef476f;
                        white-space: nowrap;
                      ">
                        ₹${formatMoney(amount)}
                      </strong>
                    `
                    : ""
                }

              </div>
            `;
          }).join("")}

        </div>

      </div>
    `;

  } else {

    itemsHtml = `
      <div style="
        margin-top: 24px;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 10px;
        color: var(--sub);
        font-size: 0.9rem;
      ">
        No individual inspection items were recorded.
      </div>
    `;
  }

  /* =====================================================
     CREATE REPORT
  ===================================================== */

  overlay.innerHTML = `
    <div class="rr-card">

      <!-- HEADER -->
      <div class="rr-header">
        <div class="rr-header-text">
          <span class="rr-label">Return Inspection</span>
          <h3 class="rr-title">Return Report</h3>
        </div>
        <button type="button" id="closeManagerReturnReport" class="manager-modal-close" aria-label="Close">&times;</button>
      </div>

      <!-- VEHICLE INFO GRID -->
      <div class="rr-info-grid">
        <div class="rr-info-cell">
          <span class="rr-info-key">Vehicle</span>
          <strong class="rr-info-val">${escapeHtml(vehicleName)}</strong>
        </div>
        <div class="rr-info-cell">
          <span class="rr-info-key">Registration</span>
          <strong class="rr-info-val">${escapeHtml(registration)}</strong>
        </div>
        <div class="rr-info-cell">
          <span class="rr-info-key">Customer</span>
          <strong class="rr-info-val">${escapeHtml(customer)}</strong>
        </div>
      </div>

      <!-- ODOMETER & FASTAG LOG -->
      <div class="rr-info-grid" style="margin-top: 10px;">
        <div class="rr-info-cell">
          <span class="rr-info-key">Pickup Odometer</span>
          <strong class="rr-info-val">${booking.pickupOdometer != null ? `${Number(booking.pickupOdometer).toLocaleString("en-IN")} km` : "—"}</strong>
        </div>
        <div class="rr-info-cell">
          <span class="rr-info-key">Return Odometer</span>
          <strong class="rr-info-val">${inspection.returnOdometer != null ? `${Number(inspection.returnOdometer).toLocaleString("en-IN")} km` : "—"}</strong>
        </div>
        <div class="rr-info-cell">
          <span class="rr-info-key">Distance Driven</span>
          <strong class="rr-info-val">${(inspection.returnOdometer != null && booking.pickupOdometer != null && Number(inspection.returnOdometer) >= Number(booking.pickupOdometer)) ? `${(Number(inspection.returnOdometer) - Number(booking.pickupOdometer)).toLocaleString("en-IN")} km` : "—"}</strong>
        </div>
        <div class="rr-info-cell">
          <span class="rr-info-key">Pickup FASTag</span>
          <strong class="rr-info-val">${booking.pickupFastagBalance != null ? `₹${Number(booking.pickupFastagBalance).toLocaleString("en-IN")}` : "—"}</strong>
        </div>
        <div class="rr-info-cell">
          <span class="rr-info-key">Return FASTag</span>
          <strong class="rr-info-val">${inspection.returnFastagBalance != null ? `₹${Number(inspection.returnFastagBalance).toLocaleString("en-IN")}` : "—"}</strong>
        </div>
        <div class="rr-info-cell">
          <span class="rr-info-key">Fuel Level</span>
          <strong class="rr-info-val">${escapeHtml(booking.pickupFuelLevel || "—")}</strong>
        </div>
      </div>

      <!-- FINANCIAL SUMMARY -->
      <div class="rr-finance">
        <div class="rr-finance-row">
          <span>Security Deposit</span>
          <strong>₹${formatMoney(deposit)}</strong>
        </div>
        <div class="rr-finance-row">
          <span>Total Deductions</span>
          <strong class="rr-deduct">₹${formatMoney(deductions)}</strong>
        </div>
        <div class="rr-finance-row rr-finance-row--total">
          <span>Refundable to Customer</span>
          <strong class="rr-refund">₹${formatMoney(refund)}</strong>
        </div>
      </div>

      <!-- INSPECTION ITEMS -->
      <div class="rr-section">
        <span class="rr-section-title">Inspection Items</span>
        ${items.length ? `
        <div class="rr-items-list">
          ${items.map((item) => {
            if (typeof item === "string") {
              return `<div class="rr-item"><span class="rr-item-name">${escapeHtml(item)}</span></div>`;
            }
            const title = item.name || item.title || item.label || item.description || "Inspection item";
            const amount = getNumber(item.amount ?? item.deduction ?? item.cost ?? 0);
            return `
              <div class="rr-item">
                <span class="rr-item-name">${escapeHtml(title)}</span>
                ${amount > 0 ? `<span class="rr-item-amount">₹${formatMoney(amount)}</span>` : `<span class="rr-item-nil">—</span>`}
              </div>
            `;
          }).join("")}
        </div>
        ` : `
        <div style="padding: 14px; border: 1px solid var(--line); border-radius: 10px; color: var(--sub); font-size: 0.88rem;">
          No damage or extra deductions recorded.
        </div>
        `}
      </div>

      <!-- RETURN PHOTOS -->
      ${returnPhotoRefs.length ? `
      <div class="rr-section">
        <span class="rr-section-title">Return Photos</span>
        <div id="managerReturnPhotosGrid" class="rr-photos-grid">
          <div class="manager-state">Loading return photos...</div>
        </div>
      </div>
      ` : ""}

      <!-- NOTES -->
      <div class="rr-section">
        <span class="rr-section-title">Inspection Notes</span>
        <div class="rr-notes">${escapeHtml(notes)}</div>
      </div>

      <!-- META FOOTER -->
      <div class="rr-meta">
        <div class="rr-meta-item">
          <span class="rr-meta-key">Inspected By</span>
          <span class="rr-meta-val">${escapeHtml(inspectedBy)}</span>
        </div>
        <div class="rr-meta-item">
          <span class="rr-meta-key">Completed</span>
          <span class="rr-meta-val">${escapeHtml(completedAt)}</span>
        </div>
      </div>

      <!-- CLOSE BUTTON -->
      <div class="rr-footer">
        <button type="button" id="closeManagerReturnReportBtn" class="btn btn-dark">
          Close Report
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  if (returnPhotoRefs.length) {
    (async () => {
      const grid = overlay.querySelector("#managerReturnPhotosGrid");
      if (!grid) return;

      const photos = await Promise.all(
        returnPhotoRefs.map(async (photo, index) => {
          try {
            if (photo.mediaId) {
              const url = await fetchExecutiveMedia(photo.mediaId);
              return { url, name: photo.name || `Photo ${index + 1}` };
            }

            const url =
              typeof photo === "string"
                ? photo
                : photo?.url || photo?.downloadURL || photo?.src || "";

            if (!url) return null;

            return { url, name: photo?.name || `Photo ${index + 1}` };
          } catch {
            return null;
          }
        })
      );

      if (!grid.isConnected) return;

      const rendered = photos
        .filter(Boolean)
        .map(
          (photo, index) => `
            <figure style="
              margin: 0;
              overflow: hidden;
              border: 1px solid var(--line);
              border-radius: 12px;
              background: rgba(255,255,255,.02);
            ">
              <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || `Photo ${index + 1}`)}" style="display:block;width:100%;height:170px;object-fit:cover;background:#080808;" />
              <figcaption style="
                padding: 8px 10px;
                color: var(--sub);
                font-size: 0.74rem;
                letter-spacing: .03em;
                text-transform: uppercase;
              ">${escapeHtml(photo.name || `Photo ${index + 1}`)}</figcaption>
            </figure>
          `
        )
        .join("");

      grid.innerHTML = rendered || `<div class="manager-state">No return photos available.</div>`;
    })();
  }

  /* =====================================================
     CLOSE BUTTONS
  ===================================================== */

  const closeReport = () => {

    overlay.remove();

  };

  document
    .getElementById(
      "closeManagerReturnReport"
    )
    ?.addEventListener(
      "click",
      closeReport
    );

  document
    .getElementById(
      "closeManagerReturnReportBtn"
    )
    ?.addEventListener(
      "click",
      closeReport
    );

  /* Click outside modal */

  overlay.addEventListener(
    "click",
    (event) => {

      if (event.target === overlay) {
        closeReport();
      }

    }
  );

  /* ESC */

  const escHandler = (event) => {

    if (event.key === "Escape") {

      closeReport();

      document.removeEventListener(
        "keydown",
        escHandler
      );
    }

  };

  document.addEventListener(
    "keydown",
    escHandler
  );
}

/* =========================================================
   DRIVER DOCUMENTS
========================================================= */

function closeManagerDocumentModal() {
  const modal =
    document.getElementById("managerDocumentModal");

  if (modal) {
    modal.hidden = true;
  }

  if (managerDocumentObjectUrl) {
    URL.revokeObjectURL(managerDocumentObjectUrl);
    managerDocumentObjectUrl = null;
  }

  managerDocumentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  managerDocumentObjectUrls = [];

  activeManagerDocument = null;
}

async function fetchManagerDocumentPreview(mediaUrl) {
  if (!mediaUrl) {
    throw new Error("Document preview information is missing.");
  }

  const token = await getAuthToken();
  const url = String(mediaUrl).startsWith("http")
    ? String(mediaUrl)
    : `${MEDIA_SERVER_URL}${mediaUrl}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not load document (${response.status}).`
    );
  }

  return URL.createObjectURL(await response.blob());
}

async function openManagerDocumentModal(user, type) {
  closeManagerDocumentModal();
  activeManagerDocument = { user, type };

  const modal =
    document.getElementById("managerDocumentModal");
  const title =
    document.getElementById("managerDocumentModalTitle");
  const body =
    document.getElementById("managerDocumentModalBody");
  const approveButton =
    document.getElementById("managerApproveDocumentBtn");
  const rejectButton =
    document.getElementById("managerRejectDocumentBtn");

  if (!modal || !body) return;

  const isLicense = type === "license";
  const documentLabel = isLicense
    ? "Driving Licence"
    : "Aadhaar Card";
  const mediaUrls = isLicense
    ? [user.licenseFrontURL || user.licenseURL, user.licenseBackURL].filter(Boolean)
    : [user.aadharFrontURL || user.aadharURL, user.aadharBackURL].filter(Boolean);
  const mediaUrl = mediaUrls[0];
  const status = isLicense
    ? user.licenseStatus
    : user.aadharStatus;

  if (title) {
    title.textContent =
      `${user.name || "Customer"} — ${documentLabel}`;
  }

  const isComplete = isLicense ? mediaUrls.length === 2 : mediaUrls.length > 0;
  if (approveButton) approveButton.disabled = !isComplete;
  if (rejectButton) rejectButton.disabled = !mediaUrl;

  body.innerHTML = `
    <div style="display:grid;gap:14px;">
      <div class="manager-summary-row">
        <span>Account</span>
        <strong>${escapeHtml(user.email || user.phone || user.id)}</strong>
      </div>
      <div class="manager-summary-row">
        <span>Document</span>
        <strong>${escapeHtml(documentLabel)}</strong>
      </div>
      <div class="manager-summary-row">
        <span>Current status</span>
        <strong>${escapeHtml(formatStatus(status || "pending"))}</strong>
      </div>
      <div
        id="managerDocumentPreview"
        style="min-height:260px;display:grid;place-items:center;color:var(--sub);border:1px solid var(--line);border-radius:12px;background:#080909;overflow:hidden;"
      >
        ${mediaUrl ? "Loading protected document..." : "No document has been uploaded."}
      </div>
    </div>
  `;

  modal.hidden = false;

  if (!mediaUrl) return;

  const preview =
    document.getElementById("managerDocumentPreview");

  try {
    const objectUrl =
      await fetchManagerDocumentPreview(mediaUrl);

    if (
      activeManagerDocument?.user !== user ||
      activeManagerDocument?.type !== type ||
      !preview?.isConnected
    ) {
      URL.revokeObjectURL(objectUrl);
      return;
    }

    managerDocumentObjectUrl = objectUrl;
    preview.innerHTML = `
      <img
        src="${escapeHtml(objectUrl)}"
        alt="${escapeHtml(documentLabel)} uploaded by ${escapeHtml(user.name || "customer")}"
        style="display:block;width:100%;max-height:520px;object-fit:contain;background:#080909;"
      />
    `;

    if (isLicense && mediaUrls[1]) {
      const backObjectUrl = await fetchManagerDocumentPreview(mediaUrls[1]);
      managerDocumentObjectUrls.push(backObjectUrl);
      preview.insertAdjacentHTML("beforeend", `
        <img src="${escapeHtml(backObjectUrl)}" alt="Driving licence back uploaded by ${escapeHtml(user.name || "customer")}" style="display:block;width:100%;max-height:520px;object-fit:contain;background:#080909;border-top:1px solid var(--line);" />
      `);
    }
  } catch (error) {
    console.error("Manager document preview error:", error);

    if (preview?.isConnected) {
      preview.innerHTML = `
        <p style="color:#ef476f;padding:18px;text-align:center;">
          The document exists, but its protected preview could not be loaded.
        </p>
      `;
    }
  }
}

async function setManagerDocumentStatus(status) {
  if (!activeManagerDocument) return false;

  const { user, type } = activeManagerDocument;
  const statusField = `${type}Status`;
  const reasonField = `${type}RejectionReason`;
  let rejectionReason = "";

  if (status === "rejected") {
    const enteredReason = prompt(
      `Reason for rejecting this ${type === "license" ? "driving licence" : "Aadhaar card"}:`
    );

    if (enteredReason === null) return false;
    rejectionReason =
      enteredReason.trim() || "Document could not be verified.";
  }

  const updates = {
    [statusField]: status,
    [reasonField]: status === "rejected" ? rejectionReason : null,
    [`${type}ReviewedAt`]: new Date().toISOString(),
    [`${type}ReviewedBy`]: currentUser?.uid || null,
  };

  const otherStatus = type === "license"
    ? user.aadharStatus
    : user.licenseStatus;

  if (status === "verified" && otherStatus === "verified") {
    updates.documentsVerifiedAt = new Date().toISOString();
    updates.documentsVerifiedBy = currentUser?.uid || null;
  }

  try {
    await api.post("/verification/user-status", {
      userId: user.id || user.uid,
      documentType: type,
      status: status,
      rejectionReason: status === "rejected" ? rejectionReason : null
    });

    user[statusField] = status;
    user[reasonField] = status === "rejected" ? rejectionReason : null;
    return true;
  } catch (err) {
    console.error("Document update error:", err);
    throw err;
  }
}

function initialiseManagerDocumentModal() {
  const modal =
    document.getElementById("managerDocumentModal");
  const closeButton =
    document.getElementById("closeManagerDocumentModal");
  const approveButton =
    document.getElementById("managerApproveDocumentBtn");
  const rejectButton =
    document.getElementById("managerRejectDocumentBtn");

  closeButton?.addEventListener(
    "click",
    closeManagerDocumentModal
  );

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeManagerDocumentModal();
    }
  });

  approveButton?.addEventListener("click", async () => {
    approveButton.disabled = true;
    approveButton.textContent = "Approving...";

    try {
      const updated =
        await setManagerDocumentStatus("verified");

      if (updated) {
        closeManagerDocumentModal();
        await loadManagerDocs();
      }
    } catch (error) {
      console.error("Manager document approval error:", error);
      alert("Could not approve the document.\n\n" + error.message);
    } finally {
      approveButton.disabled = false;
      approveButton.textContent = "Approve Document";
    }
  });

  rejectButton?.addEventListener("click", async () => {
    rejectButton.disabled = true;
    rejectButton.textContent = "Rejecting...";

    try {
      const updated =
        await setManagerDocumentStatus("rejected");

      if (updated) {
        closeManagerDocumentModal();
        await loadManagerDocs();
      }
    } catch (error) {
      console.error("Manager document rejection error:", error);
      alert("Could not reject the document.\n\n" + error.message);
    } finally {
      rejectButton.disabled = false;
      rejectButton.textContent = "Reject Document";
    }
  });
}

async function loadManagerDocs() {

  if (!docsWrap) return;

  docsWrap.innerHTML = `
    <p style="color: var(--sub);">
      Loading pending document verifications...
    </p>
  `;

  try {

    const res = await api.get("/users");
    const users = res.users || [];

    currentManagerUsers = users;

    const pendingDocs =
      users.filter((user) => {

        return (
          user.licenseStatus === "pending" ||
          user.aadharStatus === "pending"
        );

      });

    if (pendingDocCountEl) {

      pendingDocCountEl.textContent =
        pendingDocs.length;

    }

    renderManagerDocsList(
      pendingDocs
    );

  } catch (error) {

    console.error(
      "Error loading manager documents:",
      error
    );

    docsWrap.innerHTML = `
      <div style="
        padding: 20px;
      ">

        <p style="
          color: #ef476f;
          margin-bottom: 8px;
        ">
          Couldn't load documents.
        </p>

        <small style="color: var(--sub);">
          ${escapeHtml(
            error.message ||
            "Unknown error"
          )}
        </small>

      </div>
    `;
  }
}

/* =========================================================
   DOCUMENT TABLE
========================================================= */

function renderManagerDocsList(users) {

  if (!docsWrap) return;

  if (!users.length) {

    docsWrap.innerHTML = `
      <div style="
        padding: 30px;
        text-align: center;
        color: var(--sub);
      ">
        All pending driver documents
        have been verified!
      </div>
    `;

    return;
  }

  let html = `

    <div style="
      width: 100%;
      overflow-x: auto;
    ">

      <table
        class="admin-table"
        style="
          width: 100%;
          min-width: 850px;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.9rem;
        "
      >

        <thead>

          <tr style="
            border-bottom: 1px solid var(--line);
            color: var(--sub);
          ">

            <th style="padding: 14px;">
              User
            </th>

            <th style="padding: 14px;">
              Contact
            </th>

            <th style="padding: 14px;">
              License
            </th>

            <th style="padding: 14px;">
              Aadhaar
            </th>

            <th style="
              padding: 14px;
              text-align: right;
            ">
              Action
            </th>

          </tr>

        </thead>

        <tbody>
  `;

  users.forEach((user) => {

    const licenseStatus =
      user.licenseStatus ||
      "unknown";

    const aadharStatus =
      user.aadharStatus ||
      "unknown";

    const documentActions = [
      licenseStatus === "pending"
        ? `
          <button
            type="button"
            class="btn btn-dark mgr-review-document-btn"
            data-user-id="${escapeHtml(user.id)}"
            data-document-type="license"
          >
            Review Licence
          </button>
        `
        : "",
      aadharStatus === "pending"
        ? `
          <button
            type="button"
            class="btn btn-outline mgr-review-document-btn"
            data-user-id="${escapeHtml(user.id)}"
            data-document-type="aadhar"
          >
            Review Aadhaar
          </button>
        `
        : "",
    ].filter(Boolean).join("");

    html += `

      <tr style="
        border-bottom:
          1px solid rgba(255,255,255,0.06);
      ">

        <td style="padding: 14px;">

          <strong>
            ${escapeHtml(
              user.name ||
              "User"
            )}
          </strong>

        </td>

        <td style="padding: 14px;">

          ${escapeHtml(
            user.email ||
            "—"
          )}

          <br>

          <span style="
            color: var(--sub);
            font-size: 0.8rem;
          ">
            ${escapeHtml(
              user.phone ||
              "—"
            )}
          </span>

        </td>

        <td style="padding: 14px;">

          <span class="
            fleet-status
            ${getDocumentStatusClass(
              licenseStatus
            )}
          ">
            ${escapeHtml(
              formatStatus(
                licenseStatus
              )
            )}
          </span>

        </td>

        <td style="padding: 14px;">

          <span class="
            fleet-status
            ${getDocumentStatusClass(
              aadharStatus
            )}
          ">
            ${escapeHtml(
              formatStatus(
                aadharStatus
              )
            )}
          </span>

        </td>

        <td style="
          padding: 14px;
          text-align: right;
        ">

          <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
            ${documentActions}
          </div>

        </td>

      </tr>
    `;
  });

  html += `

        </tbody>

      </table>

    </div>
  `;

  docsWrap.innerHTML = html;

  attachDocumentButtonEvents();
}

/* =========================================================
   DOCUMENT VERIFICATION
========================================================= */

function attachDocumentButtonEvents() {

  const verifyButtons =
    docsWrap.querySelectorAll(
      ".mgr-review-document-btn"
    );

  verifyButtons.forEach((button) => {

    button.addEventListener(
      "click",
      (event) => {

        event.preventDefault();

        const userId =
          button.dataset.userId;

        const type =
          button.dataset.documentType;

        if (!userId) {

          alert(
            "Missing user ID."
          );

          return;
        }

        if (!type) {
          alert("Missing document type.");
          return;
        }

        const user = currentManagerUsers.find(
          (item) => item.id === userId
        );

        if (!user) {
          alert("Could not find this user account.");
          return;
        }

        openManagerDocumentModal(user, type);
      }
    );

  });
}

/* =========================================================
   HELPERS
========================================================= */

function getDocumentStatusClass(status) {

  const value =
    String(status || "")
      .toLowerCase();

  if (value === "verified") {
    return "verified";
  }

  if (
    value === "rejected" ||
    value === "failed"
  ) {
    return "rejected";
  }

  return "pending";
}

/* =========================================================
   STATUS FORMATTER
========================================================= */

function formatStatus(status) {

  return String(status || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

/* =========================================================
   NUMBER
========================================================= */

function getNumber(value) {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

/* =========================================================
   MONEY
========================================================= */

function formatMoney(value) {

  return getNumber(value)
    .toLocaleString(
      "en-IN",
      {
        maximumFractionDigits: 2,
      }
    );
}

/* =========================================================
   DATE / TIME
========================================================= */

function formatDateTime(value) {

  if (!value) {
    return "Not recorded";
  }

  try {

    /* Firestore Timestamp */

    if (
      value &&
      typeof value.toDate ===
        "function"
    ) {
      return value
        .toDate()
        .toLocaleString("en-IN");
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return String(value);
    }

    return date.toLocaleString(
      "en-IN"
    );

  } catch {

    return String(value);
  }
}

/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}
