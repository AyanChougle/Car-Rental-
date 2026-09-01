// ============================================================================
// KRUIZLY ADMIN DASHBOARD
// Complete admin controller
// ============================================================================

import { auth, db, storage } from "./firebase-init.js";

import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

import "./nav-helper.js";

import { openReturnModal } from "./return-inspection.js";
import { formatBookingNumber } from "./booking-reference.js";

// ============================================================================
// DOM
// ============================================================================

const $ = (id) => document.getElementById(id);

const adminContent = $("adminContent");

const usersTableWrap = $("usersTableWrap");
const paymentsTableWrap = $("paymentsTableWrap");
const bookingsTableWrap = $("bookingsTableWrap");
const hostCarsTableWrap = $("hostCarsTableWrap");
const fleetManagementWrap = $("fleetManagementWrap");
const fleetUploadForm = $("fleetUploadForm");
const fleetUploadStatus = $("fleetUploadStatus");
const fleetUploadSubmit = $("fleetUploadSubmit");
const exportFirebaseExcelBtn = $("exportFirebaseExcelBtn");
const firebaseExportStatus = $("firebaseExportStatus");

// ============================================================================
// STATE
// ============================================================================

let currentUser = null;

let usersData = [];
let bookingsData = [];
let hostCarsData = [];

let activeDocUser = null;
let activeDocType = null;
let activeDocObjectUrls = [];
let activePaymentBooking = null;
let activePaymentScreenshotObjectUrl = null;

let bookingSortDirection = "desc";
let bookingStatus = "all";
let bookingDateFrom = "";
let bookingDateTo = "";
const ADMIN_BOOKINGS_PER_PAGE = 10;
const ADMIN_PAYMENTS_PER_PAGE = 10;
let adminBookingPage = 1;
let adminPaymentPage = 1;

let expandedBookingId = null;
let expandedHostPhotoId = null;
let editingFleetRegNo = null;

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatINR(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "₹0";
  }

  return `₹${Math.round(number).toLocaleString("en-IN")}`;
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Math.round(number).toLocaleString("en-IN");
}

function toMillis(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    );
  }

  if (typeof value === "object" && typeof value.toMillis === "function") {
    const d = new Date(value.toMillis());
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const stringValue = String(value);

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(stringValue)) {
    const [year, month, day] = stringValue.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  // DD/MM/YYYY or DD/MM/YYYY HH:mm
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(stringValue)) {
    const [day, month, year] = stringValue.split(" ")[0].split("/").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(stringValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
}

function formatDate(value) {
  const date = parseDateOnly(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getBookingDateValue(booking) {
  /*
   * IMPORTANT:
   *
   * Use the actual rental/booking date first.
   * createdAt is only a fallback.
   *
   * This fixes the date filter for your existing bookings.
   */

  return (
    booking.bookingDate ||
    booking.pickupDate ||
    booking.date ||
    booking.createdAt ||
    booking.dropDate ||
    ""
  );
}

function getBookingDateMillis(booking) {
  const value = getBookingDateValue(booking);

  if (!value) {
    return 0;
  }

  if (
    typeof value === "object" &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  if (typeof value === "number") {
    return value;
  }

  const date = parseDateOnly(value);

  if (!date) {
    return 0;
  }

  return date.getTime();
}

function getBookingDisplayDate(booking) {
  return formatDate(getBookingDateValue(booking));
}

function getStatusClass(status) {
  const value = String(status || "").toLowerCase();

  if (
    value === "confirmed" ||
    value === "completed" ||
    value === "paid" ||
    value === "verified" ||
    value === "approved"
  ) {
    return "verified";
  }

  if (
    value === "cancelled" ||
    value === "rejected" ||
    value === "failed"
  ) {
    return "rejected";
  }

  return "pending";
}

function paymentStatusText(booking) {
  switch (booking.paymentStatus) {
    case "paid":
      return `Paid${
        booking.paymentRef
          ? ` • ${escapeHtml(booking.paymentRef)}`
          : ""
      }`;

    case "advance_paid":
      return `Advance paid • ${formatINR(booking.paymentAmountPaid || booking.paymentAmount || 500)} received • ${formatINR(booking.remainingBalance || 0)} due at pickup`;

    case "pending_verification":
      return `Verification Pending${
        booking.paymentRef
          ? ` • ${escapeHtml(booking.paymentRef)}`
          : ""
      }`;

    case "rejected":
      return `Rejected${
        booking.paymentRejectionReason
          ? ` — ${escapeHtml(booking.paymentRejectionReason)}`
          : ""
      }`;

    case "pay_at_pickup":
      return "Pay at Pickup";

    default:
      return "Unpaid";
  }
}

function getStartOdometer(booking) {
  return (
    booking.pickupOdometer ??
    booking.odometerStart ??
    booking.startOdometer ??
    booking.startOdo ??
    ""
  );
}

function getEndOdometer(booking) {
  return (
    booking.returnInspection?.returnOdometer ??
    booking.returnOdometer ??
    booking.odometerEnd ??
    booking.endOdometer ??
    booking.endOdo ??
    ""
  );
}

function getStartFastag(booking) {
  return (
    booking.pickupFastagBalance ??
    booking.fastagStart ??
    booking.startFastag ??
    ""
  );
}

function getReturnFastag(booking) {
  return (
    booking.returnInspection?.returnFastagBalance ??
    booking.returnFastagBalance ??
    booking.fastagReturn ??
    booking.returnFastag ??
    ""
  );
}

function calculateDistance(start, end) {
  const startNumber = Number(start);
  const endNumber = Number(end);

  if (
    !Number.isFinite(startNumber) ||
    !Number.isFinite(endNumber) ||
    startNumber < 0 ||
    endNumber < startNumber
  ) {
    return null;
  }

  return endNumber - startNumber;
}

// ============================================================================
// FORCE MODAL VISIBILITY
//
// IMPORTANT:
// Your HTML uses `hidden` on the modals.
// Setting only style.display = "flex" is not enough.
// ============================================================================

function showModal(id) {
  const modal = $(id);

  if (!modal) {
    console.error(`Modal #${id} was not found.`);
    return false;
  }

  modal.hidden = false;
  modal.removeAttribute("hidden");

  modal.style.display = "flex";

  return true;
}

function hideModal(id) {
  const modal = $(id);

  if (!modal) {
    return;
  }

  modal.style.display = "none";
  modal.hidden = true;

  if (id === "docModal" && activeDocObjectUrls.length) {
    activeDocObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    activeDocObjectUrls = [];
  }

  if (id === "docModal") {
    activeDocUser = null;
    activeDocType = null;
  }

  if (
    id === "paymentModal" &&
    activePaymentScreenshotObjectUrl
  ) {
    URL.revokeObjectURL(
      activePaymentScreenshotObjectUrl
    );
    activePaymentScreenshotObjectUrl = null;
  }

  if (id === "paymentModal") {
    activePaymentBooking = null;
  }
}

// ============================================================================
// AUTH
// ============================================================================

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (adminContent) {
    adminContent.hidden = false;
    adminContent.removeAttribute("hidden");
  }

  loadAllAdminData();
});

// Initialize UI listeners immediately so tabs and controls work on page load
function initialiseAdmin() {
  initialiseTabs();
  initialiseBookingFilters();
  initialiseDocumentModal();
  initialisePaymentModal();
  initialiseReturnModal();
  initialiseInvoiceEditorModal();
  initialiseFirebaseExport();
  initialiseFleetUpload();
  initialiseCouponManagement();
}

initialiseAdmin();

// ============================================================================
// TABS
// ============================================================================

function initialiseTabs() {
  const tabs = document.querySelectorAll(
    ".admin-tabs .tab-btn"
  );

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.tab;

      tabs.forEach((item) => {
        item.classList.remove(
          "active",
          "btn-dark"
        );

        item.classList.add(
          "btn-outline"
        );
      });

      tab.classList.add(
        "active",
        "btn-dark"
      );

      tab.classList.remove(
        "btn-outline"
      );

      document
        .querySelectorAll(".tab-panel")
        .forEach((panel) => {
          panel.hidden = panel.id !== targetId;
        });
    });
  });

  const userSearch = $("userSearchInput");

  if (userSearch) {
    userSearch.addEventListener(
      "input",
      () => {
        const query =
          userSearch.value
            .toLowerCase()
            .trim();

        const filtered =
          usersData.filter((user) => {
            const name =
              String(user.name || "")
                .toLowerCase();

            const email =
              String(user.email || "")
                .toLowerCase();

            const phone =
              String(user.phone || "")
                .toLowerCase();

            return (
              name.includes(query) ||
              email.includes(query) ||
              phone.includes(query)
            );
          });

        renderUsersTable(filtered);
      }
    );
  }
}

// ============================================================================
// BOOKING FILTERS
// ============================================================================

function initialiseBookingFilters() {
  const statusFilter =
    $("bookingStatusFilter");

  if (statusFilter) {
    statusFilter.addEventListener(
      "change",
      () => {
        bookingStatus =
          statusFilter.value;

        adminBookingPage = 1;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const sortSelect =
    $("bookingSortOrder");

  if (sortSelect) {
    sortSelect.value =
      bookingSortDirection;

    sortSelect.addEventListener(
      "change",
      () => {
        bookingSortDirection =
          sortSelect.value;

        sortBookings();

        adminBookingPage = 1;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const dateFrom =
    $("bookingDateFrom");

  if (dateFrom) {
    dateFrom.addEventListener(
      "change",
      () => {
        bookingDateFrom =
          dateFrom.value;

        adminBookingPage = 1;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const dateTo =
    $("bookingDateTo");

  if (dateTo) {
    dateTo.addEventListener(
      "change",
      () => {
        bookingDateTo =
          dateTo.value;

        adminBookingPage = 1;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const clearDate =
    $("bookingDateClear");

  if (clearDate) {
    clearDate.addEventListener(
      "click",
      () => {
        bookingDateFrom = "";
        bookingDateTo = "";
        adminBookingPage = 1;

        if (dateFrom) {
          dateFrom.value = "";
        }

        if (dateTo) {
          dateTo.value = "";
        }

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }
}

// ============================================================================
// SORT
// ============================================================================

function sortBookings() {
  bookingsData.sort(
    (a, b) => {
      const dateA =
        getBookingDateMillis(a);

      const dateB =
        getBookingDateMillis(b);

      if (
        bookingSortDirection ===
        "asc"
      ) {
        return dateA - dateB;
      }

      return dateB - dateA;
    }
  );
}

// ============================================================================
// FILTER
// ============================================================================

function getFilteredBookings() {
  let result = [
    ...bookingsData
  ];

  // STATUS
  if (bookingStatus !== "all") {
    result = result.filter(
      (booking) =>
        String(
          booking.status || ""
        ).toLowerCase() ===
        bookingStatus
    );
  }

  // FROM DATE
  if (bookingDateFrom) {
    const from =
      parseDateOnly(
        bookingDateFrom
      );

    if (from) {
      const fromTime =
        from.getTime();

      result =
        result.filter(
          (booking) =>
            getBookingDateMillis(
              booking
            ) >= fromTime
        );
    }
  }

  // TO DATE
  if (bookingDateTo) {
    const to =
      parseDateOnly(
        bookingDateTo
      );

    if (to) {
      // Include complete day.
      to.setHours(
        23,
        59,
        59,
        999
      );

      const toTime =
        to.getTime();

      result =
        result.filter(
          (booking) =>
            getBookingDateMillis(
              booking
            ) <= toTime
        );
    }
  }

  return result;
}

// ============================================================================
// LOAD ALL DATA
// ============================================================================

async function loadAllAdminData() {
  await Promise.allSettled([
    loadUsers(),
    loadBookings(),
    loadHostCars(),
    loadFleetManagement(),
    loadCoupons(),
  ]);

  updateUserStats();
  updateBookingStats();
  updateRevenueStats();
}

async function loadFleetManagement() {
  if (!fleetManagementWrap) return;

  try {
    const catalog = Array.isArray(window.fleetVehicles)
      ? window.fleetVehicles
      : [];
    const snapshot = await getDocs(collection(db, "vehicles"));
    const overrides = new Map(
      snapshot.docs.map((item) => [item.id, item.data()])
    );
    const catalogRegistrations = new Set(catalog.map((vehicle) => vehicle.regNo));
    const vehicles = [
      ...catalog.map((vehicle) => ({
        ...vehicle,
        ...(overrides.get(vehicle.regNo) || {}),
        regNo: vehicle.regNo,
      })),
      ...snapshot.docs
        .map((item) => ({ regNo: item.id, ...item.data() }))
        .filter((vehicle) => vehicle.isCustomFleet && !catalogRegistrations.has(vehicle.regNo)),
    ].filter((vehicle) => !vehicle.removed);

    if (!vehicles.length) {
      fleetManagementWrap.innerHTML =
        `<p style="color:var(--sub);">No vehicles in the fleet yet. Add the first one above.</p>`;
      return;
    }

    fleetManagementWrap.innerHTML = `
      <div style="width:100%;overflow-x:auto;">
        <table class="admin-table" style="width:100%;min-width:940px;border-collapse:collapse;text-align:left;">
          <thead>
            <tr style="border-bottom:1px solid var(--line);color:var(--sub);">
              <th style="padding:12px;">Vehicle</th>
              <th style="padding:12px;">Image</th>
              <th style="padding:12px;">Registration</th>
              <th style="padding:12px;">Category</th>
              <th style="padding:12px;">Daily Rate</th>
              <th style="padding:12px;">Availability</th>
              <th style="padding:12px;text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${vehicles.map((vehicle) => {
              const available = Boolean(vehicle.available);
              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
                  <td style="padding:12px;"><strong>${escapeHtml(`${vehicle.brand} ${vehicle.model}`)}</strong></td>
                  <td style="padding:12px;">
                    ${vehicle.imageUrl
                      ? `<img src="${escapeHtml(vehicle.imageUrl)}" alt="${escapeHtml(`${vehicle.brand} ${vehicle.model}`)}" style="display:block;width:72px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--line);" />`
                      : `<span style="color:var(--sub);font-size:.8rem;">Catalog image</span>`}
                  </td>
                  <td style="padding:12px;font-family:monospace;">${escapeHtml(vehicle.regNo)}</td>
                  <td style="padding:12px;">${escapeHtml(vehicle.category || "—")}</td>
                  <td style="padding:12px;">${formatINR(vehicle.priceDay)}</td>
                  <td style="padding:12px;">
                    <span class="status-pill ${available ? "verified" : "rejected"}">
                      ${available ? "Available" : "Unavailable"}
                    </span>
                  </td>
                  <td style="padding:12px;text-align:right;">
                    <button
                      type="button"
                      class="btn btn-outline admin-fleet-edit"
                      data-reg="${escapeHtml(vehicle.regNo)}"
                      style="margin-right:6px;"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="btn ${available ? "btn-outline" : "btn-dark"} admin-fleet-toggle"
                      data-reg="${escapeHtml(vehicle.regNo)}"
                      data-available="${String(available)}"
                    >
                      ${available ? "Mark Unavailable" : "Make Available"}
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline admin-fleet-remove"
                      data-reg="${escapeHtml(vehicle.regNo)}"
                      data-custom="${String(Boolean(vehicle.isCustomFleet))}"
                      style="margin-left:6px;border-color:#ef476f;color:#ef476f;"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    fleetManagementWrap
      .querySelectorAll(".admin-fleet-edit")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const regNo = button.dataset.reg;
          const vehicle = vehicles.find((item) => item.regNo === regNo);
          if (!vehicle) return;

          editingFleetRegNo = regNo;
          if ($("fleetBrand")) $("fleetBrand").value = vehicle.brand || "";
          if ($("fleetModel")) $("fleetModel").value = vehicle.model || "";
          if ($("fleetRegNo")) {
            $("fleetRegNo").value = vehicle.regNo || "";
            $("fleetRegNo").readOnly = true;
          }
          if ($("fleetYear")) $("fleetYear").value = vehicle.year || 2024;
          if ($("fleetCategory")) $("fleetCategory").value = vehicle.category || "economy";
          if ($("fleetTransmission")) $("fleetTransmission").value = vehicle.transmission || "Automatic";
          if ($("fleetFuel")) $("fleetFuel").value = vehicle.fuel || "Petrol";
          if ($("fleetSeats")) $("fleetSeats").value = vehicle.seats || 5;
          if ($("fleetPriceDay")) $("fleetPriceDay").value = vehicle.priceDay || 2000;

          if (fleetUploadSubmit) fleetUploadSubmit.textContent = "Update Vehicle Data";
          const cancelBtn = $("fleetCancelEdit");
          if (cancelBtn) cancelBtn.style.display = "inline-block";

          if (fleetUploadStatus) fleetUploadStatus.textContent = `Editing vehicle ${regNo}. Modify details above and click Update.`;
          fleetUploadForm?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });

    fleetManagementWrap
      .querySelectorAll(".admin-fleet-toggle")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const regNo = button.dataset.reg;
          const vehicle = vehicles.find((item) => item.regNo === regNo);
          if (!vehicle) return;

          const nextAvailable = button.dataset.available !== "true";
          button.disabled = true;
          button.textContent = "Saving...";

          try {
            await setDoc(
              doc(db, "vehicles", regNo),
              {
                regNo,
                brand: vehicle.brand,
                model: vehicle.model,
                category: vehicle.category,
                available: nextAvailable,
                status: nextAvailable ? "available" : "unavailable",
                updatedAt: serverTimestamp(),
                updatedBy: currentUser?.uid || null,
              },
              { merge: true }
            );

            const sourceVehicle = catalog.find((item) => item.regNo === regNo);
            if (sourceVehicle) sourceVehicle.available = nextAvailable ? 1 : 0;
            await loadFleetManagement();
          } catch (error) {
            console.error("FLEET AVAILABILITY ERROR:", error);
            alert("Could not update vehicle availability.\n\n" + error.message);
            button.disabled = false;
          }
        });
      });

    fleetManagementWrap
      .querySelectorAll(".admin-fleet-remove")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const regNo = button.dataset.reg;
          if (!regNo || !confirm(`Remove ${regNo} from the fleet?`)) return;

          button.disabled = true;
          try {
            if (button.dataset.custom === "true") {
              await deleteDoc(doc(db, "vehicles", regNo));
            } else {
              await setDoc(doc(db, "vehicles", regNo), {
                removed: true,
                available: false,
                status: "removed",
                updatedAt: serverTimestamp(),
                updatedBy: currentUser?.uid || null,
              }, { merge: true });
            }
            await loadFleetManagement();
          } catch (error) {
            console.error("FLEET REMOVE ERROR:", error);
            alert("Could not remove this vehicle.\n\n" + error.message);
            button.disabled = false;
          }
        });
      });
  } catch (error) {
    console.error("FLEET MANAGEMENT LOAD ERROR:", error);
    fleetManagementWrap.innerHTML = `
      <p style="color:#ef476f;">
        Could not load fleet management. ${escapeHtml(error.message)}
      </p>
    `;
  }
}

function resetFleetForm() {
  editingFleetRegNo = null;
  fleetUploadForm?.reset();
  if ($("fleetRegNo")) $("fleetRegNo").readOnly = false;
  if (fleetUploadSubmit) fleetUploadSubmit.textContent = "Add to Fleet";
  const cancelBtn = $("fleetCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "none";
}

function initialiseFleetUpload() {
  const cancelBtn = $("fleetCancelEdit");
  cancelBtn?.addEventListener("click", () => {
    resetFleetForm();
    if (fleetUploadStatus) fleetUploadStatus.textContent = "Edit cancelled.";
  });

  fleetUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const getValue = (id) => String($(id)?.value || "").trim();
    const regNo = getValue("fleetRegNo").toUpperCase().replace(/\s+/g, "-");
    const image = $("fleetImage")?.files?.[0];

    if (!regNo) return;
    if (image && (!image.type.startsWith("image/") || image.size > 10 * 1024 * 1024)) {
      if (fleetUploadStatus) fleetUploadStatus.textContent = "Use an image up to 10 MB.";
      return;
    }

    const isEditing = Boolean(editingFleetRegNo);
    fleetUploadSubmit.disabled = true;
    if (fleetUploadStatus) fleetUploadStatus.textContent = isEditing ? "Updating vehicle data..." : "Saving vehicle to fleet...";

    try {
      let imageUrl = null;
      if (image) {
        try {
          const imageRef = ref(storage, `fleet/${regNo}/${Date.now()}-${image.name}`);
          await uploadBytes(imageRef, image, { contentType: image.type });
          imageUrl = await getDownloadURL(imageRef);
        } catch (uploadErr) {
          console.warn("Storage upload failed/unconfigured, converting file to Data URL:", uploadErr);
          imageUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve("assets/fleet/BMW.png");
            reader.readAsDataURL(image);
          });
        }
      }

      const priceDay = Number(getValue("fleetPriceDay"));
      const catalog = Array.isArray(window.fleetVehicles) ? window.fleetVehicles : [];
      const existingVehicle = catalog.find((v) => v.regNo === regNo) || {};

      const vehicleData = {
        regNo,
        brand: getValue("fleetBrand"),
        model: getValue("fleetModel"),
        year: Number(getValue("fleetYear")),
        category: getValue("fleetCategory"),
        transmission: getValue("fleetTransmission"),
        fuel: getValue("fleetFuel"),
        seats: Number(getValue("fleetSeats")),
        priceDay,
        priceHour: Math.max(1, Math.round(priceDay / 24)),
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.uid || null,
      };

      if (imageUrl) {
        vehicleData.imageUrl = imageUrl;
      }

      if (!isEditing) {
        vehicleData.bags = 2;
        vehicleData.driverPrice = 0;
        vehicleData.securityDeposit = 0;
        vehicleData.freeKm = 250;
        vehicleData.extraKm = 0;
        vehicleData.location = "Contact KRUIZLY for pickup location";
        vehicleData.isCustomFleet = true;
        vehicleData.available = true;
        vehicleData.status = "available";
        vehicleData.removed = false;
        vehicleData.createdAt = serverTimestamp();
        vehicleData.createdBy = currentUser?.uid || null;
        if (!imageUrl) {
          vehicleData.imageUrl = existingVehicle.imageUrl || "assets/fleet/BMW.png";
        }
      }

      try {
        await setDoc(doc(db, "vehicles", regNo), vehicleData, { merge: true });
      } catch (dbErr) {
        console.warn("Firestore vehicle save warning:", dbErr);
      }

      // Update in-memory catalog for instant responsiveness
      const sourceVehicle = catalog.find((item) => item.regNo === regNo);
      if (sourceVehicle) {
        Object.assign(sourceVehicle, vehicleData);
      } else {
        catalog.push(vehicleData);
      }
      window.fleetVehicles = catalog;

      resetFleetForm();
      if (fleetUploadStatus) fleetUploadStatus.textContent = isEditing ? `Vehicle ${regNo} updated successfully.` : `Vehicle ${regNo} added to fleet.`;
      await loadFleetManagement();
    } catch (error) {
      console.error("FLEET SAVE ERROR:", error);
      if (fleetUploadStatus) fleetUploadStatus.textContent = `Could not save vehicle: ${error.message}`;
    } finally {
      fleetUploadSubmit.disabled = false;
    }
  });
}

// ============================================================================
// COUPON MANAGEMENT
// ============================================================================

let couponsData = [];
let editingCouponId = null;

const DEFAULT_COUPONS = [
  { id: "WELCOME500", code: "WELCOME500", type: "flat", val: 500, label: "₹500 Flat Off", minOrder: 0, status: "active" },
  { id: "FIRST500", code: "FIRST500", type: "flat", val: 500, label: "₹500 Flat Off", minOrder: 0, status: "active" },
  { id: "KRUIZLY10", code: "KRUIZLY10", type: "percent", val: 10, label: "10% Off Rental", minOrder: 0, status: "active" },
  { id: "KRUIZLY20", code: "KRUIZLY20", type: "percent", val: 20, label: "20% Off Rental", minOrder: 0, status: "active" },
];

async function loadCoupons() {
  const wrap = $("couponsTableWrap");
  if (!wrap) return;

  let localCached = [];
  try {
    const rawLocal = localStorage.getItem("kruizly_coupons");
    if (rawLocal) {
      localCached = JSON.parse(rawLocal);
    }
  } catch (_) {}

  try {
    const snapshot = await getDocs(collection(db, "coupons"));
    let fetched = snapshot.docs.map(docItem => ({ id: docItem.id, ...docItem.data() }));

    if (!fetched.length && !localCached.length) {
      for (const coupon of DEFAULT_COUPONS) {
        try {
          await setDoc(doc(db, "coupons", coupon.id), coupon, { merge: true });
        } catch (_) {}
      }
      fetched = [...DEFAULT_COUPONS];
    } else if (!fetched.length && localCached.length) {
      fetched = localCached;
    } else if (localCached.length) {
      const localMap = new Map(localCached.map(item => [item.id || item.code, item]));
      fetched = fetched.map(item => {
        const localItem = localMap.get(item.id || item.code);
        if (localItem && localItem.status) {
          return { ...item, status: localItem.status };
        }
        return item;
      });
    }

    couponsData = fetched.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
    try {
      localStorage.setItem("kruizly_coupons", JSON.stringify(couponsData));
    } catch (_) {}
    renderCouponsTable();
  } catch (error) {
    couponsData = localCached.length ? localCached : [...DEFAULT_COUPONS];
    renderCouponsTable();
  }
}

function renderCouponsTable() {
  const wrap = $("couponsTableWrap");
  const activeStatEl = $("activeCouponsCount");
  
  const activeCount = couponsData.filter(c => c.status === "active").length;
  if (activeStatEl) activeStatEl.textContent = String(activeCount);

  if (!wrap) return;

  if (!couponsData.length) {
    wrap.innerHTML = `<p style="color:var(--kz-sub);padding:16px 0;">No coupon codes created yet.</p>`;
    return;
  }

  let html = `
    <div style="width:100%;overflow-x:auto;">
      <table class="coupon-table">
        <thead>
          <tr>
            <th>Coupon Code</th>
            <th>Discount</th>
            <th>Label / Description</th>
            <th>Min Order</th>
            <th>Status</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${couponsData.map((c) => {
            const active = c.status === "active";
            const discountLabel = c.type === "percent" ? `${c.val}% Off` : `₹${Number(c.val).toLocaleString("en-IN")} Off`;
            return `
              <tr>
                <td><span class="coupon-code-tag">${escapeHtml(c.code)}</span></td>
                <td><strong style="color:var(--kz-cyan);">${escapeHtml(discountLabel)}</strong></td>
                <td style="color:var(--kz-text);">${escapeHtml(c.label || "—")}</td>
                <td style="color:var(--kz-sub);">₹${Number(c.minOrder || 0).toLocaleString("en-IN")}</td>
                <td>
                  <span class="status-pill ${active ? "verified" : "rejected"}">
                    ${active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style="text-align:right;">
                  <div style="display:inline-flex;gap:8px;justify-content:flex-end;">
                    <button type="button" class="admin-upload-replacement-btn admin-coupon-edit" data-id="${escapeHtml(c.id)}">
                      Edit
                    </button>
                    <button type="button" class="${active ? "admin-btn-reject" : "admin-btn-approve"} admin-coupon-toggle" data-id="${escapeHtml(c.id)}" style="padding:8px 14px;font-size:0.78rem;">
                      ${active ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" class="admin-btn-reject admin-coupon-delete" data-id="${escapeHtml(c.id)}" style="padding:8px 14px;font-size:0.78rem;">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  wrap.innerHTML = html;

  wrap.querySelectorAll(".admin-coupon-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const c = couponsData.find(item => item.id === btn.dataset.id);
      if (!c) return;
      editingCouponId = c.id;
      if ($("couponCodeInput")) $("couponCodeInput").value = c.code || "";
      if ($("couponTypeSelect")) $("couponTypeSelect").value = c.type || "flat";
      if ($("couponValueInput")) $("couponValueInput").value = c.val || "";
      if ($("couponLabelInput")) $("couponLabelInput").value = c.label || "";
      if ($("couponMinOrderInput")) $("couponMinOrderInput").value = c.minOrder || 0;
      if ($("couponStatusSelect")) $("couponStatusSelect").value = c.status || "active";

      if ($("couponBoxHeading")) $("couponBoxHeading").textContent = `Editing Coupon "${c.code}"`;
      if ($("couponFormSubmit")) $("couponFormSubmit").textContent = "Update Coupon";
      if ($("couponCancelBtn")) $("couponCancelBtn").style.display = "inline-block";
      $("couponForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  wrap.querySelectorAll(".admin-coupon-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const c = couponsData.find(item => item.id === btn.dataset.id);
      if (!c) return;
      const isActive = c.status === "active" || c.active === true;
      const nextActive = !isActive;
      const nextStatus = nextActive ? "active" : "inactive";
      btn.disabled = true;

      c.active = nextActive;
      c.status = nextStatus;
      c.updatedAt = new Date().toISOString();

      try {
        await setDoc(doc(db, "coupons", c.id), { active: nextActive, status: nextStatus, updatedAt: serverTimestamp() }, { merge: true });
      } catch (_) {}

      try {
        localStorage.setItem("kruizly_coupons", JSON.stringify(couponsData));
      } catch (_) {}

      renderCouponsTable();
    });
  });

  wrap.querySelectorAll(".admin-coupon-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const c = couponsData.find(item => item.id === btn.dataset.id);
      if (!c || !confirm(`Delete coupon "${c.code}"?`)) return;
      btn.disabled = true;

      couponsData = couponsData.filter(item => item.id !== c.id);

      try {
        await deleteDoc(doc(db, "coupons", c.id));
      } catch (fsErr) {
        console.warn("Firestore coupon delete warning, applying local fallback:", fsErr);
      }

      try {
        localStorage.setItem("kruizly_coupons", JSON.stringify(couponsData));
      } catch (_) {}

      renderCouponsTable();
    });
  });
}

function resetCouponForm() {
  editingCouponId = null;
  $("couponForm")?.reset();
  if ($("couponBoxHeading")) $("couponBoxHeading").textContent = "Add New Coupon Code";
  if ($("couponFormSubmit")) $("couponFormSubmit").textContent = "Save Coupon";
  if ($("couponCancelBtn")) $("couponCancelBtn").style.display = "none";
}

function initialiseCouponManagement() {
  $("couponCancelBtn")?.addEventListener("click", resetCouponForm);

  $("couponForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = String($("couponCodeInput")?.value || "").trim().toUpperCase();
    const type = $("couponTypeSelect")?.value || "flat";
    const val = Number($("couponValueInput")?.value || 0);
    const label = String($("couponLabelInput")?.value || "").trim() || (type === "percent" ? `${val}% Off` : `₹${val} Flat Off`);
    const minOrder = Number($("couponMinOrderInput")?.value || 0);
    const status = $("couponStatusSelect")?.value || "active";

    if (!code || val <= 0) {
      alert("Enter a valid coupon code and discount value.");
      return;
    }

    const submitBtn = $("couponFormSubmit");
    if (submitBtn) submitBtn.disabled = true;
    const statusMsg = $("couponFormStatus");
    if (statusMsg) statusMsg.textContent = "Saving coupon code...";

    try {
      const couponId = editingCouponId || code;
      const isActive = status === "active";
      const data = {
        code,
        active: isActive,
        status,
        type,
        discountType: type,
        val,
        discountValue: val,
        label,
        minOrder,
        minimumBookingAmount: minOrder,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.uid || "admin",
      };

      try {
        await setDoc(doc(db, "coupons", couponId), data, { merge: true });
      } catch (fsErr) {
        console.warn("Firestore coupon save warning, applying local fallback:", fsErr);
      }
      
      const existingIndex = couponsData.findIndex(item => item.id === couponId);
      if (existingIndex >= 0) {
        couponsData[existingIndex] = { id: couponId, ...data };
      } else {
        couponsData.push({ id: couponId, ...data });
      }

      try {
        localStorage.setItem("kruizly_coupons", JSON.stringify(couponsData));
      } catch (_) {}

      resetCouponForm();
      if (statusMsg) {
        statusMsg.textContent = `Coupon "${code}" saved successfully!`;
        statusMsg.style.color = "#00f0a0";
      }
      renderCouponsTable();
    } catch (err) {
      console.error("COUPON SAVE ERROR:", err);
      if (statusMsg) {
        statusMsg.textContent = `Could not save coupon: ${err.message}`;
        statusMsg.style.color = "#ef476f";
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// ============================================================================
// FIREBASE EXCEL EXPORT
// ============================================================================

const FIRESTORE_EXPORT_COLLECTIONS = [
  {
    collectionName: "users",
    sheetName: "Users",
  },
  {
    collectionName: "bookings",
    sheetName: "Bookings",
  },
  {
    collectionName: "partner_cars",
    sheetName: "Partner Cars",
  },
  {
    collectionName: "contact_messages",
    sheetName: "Contact Messages",
  },
  {
    collectionName: "vehicles",
    sheetName: "Vehicles",
  },
];

function initialiseFirebaseExport() {
  if (!exportFirebaseExcelBtn) {
    return;
  }

  exportFirebaseExcelBtn.addEventListener(
    "click",
    exportFirebaseToExcel
  );
}

function normaliseFirestoreValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (
    value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    value &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number"
  ) {
    return `${value.latitude}, ${value.longitude}`;
  }

  if (
    value &&
    typeof value.path === "string"
  ) {
    return value.path;
  }

  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map(
        normaliseNestedFirestoreValue
      )
    );
  }

  return value;
}

function normaliseNestedFirestoreValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(
      normaliseNestedFirestoreValue
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    if (
      typeof value.latitude === "number" &&
      typeof value.longitude === "number"
    ) {
      return {
        latitude: value.latitude,
        longitude: value.longitude,
      };
    }

    if (typeof value.path === "string") {
      return value.path;
    }

    return Object.fromEntries(
      Object.entries(value).map(
        ([key, nestedValue]) => [
          key,
          normaliseNestedFirestoreValue(
            nestedValue
          ),
        ]
      )
    );
  }

  return value;
}

function flattenFirestoreRecord(
  value,
  prefix = "",
  result = {}
) {
  Object.entries(value || {}).forEach(
    ([key, fieldValue]) => {
      const columnName = prefix
        ? `${prefix}.${key}`
        : key;

      const isNestedObject =
        fieldValue &&
        typeof fieldValue === "object" &&
        !Array.isArray(fieldValue) &&
        !(fieldValue instanceof Date) &&
        typeof fieldValue.toDate !== "function" &&
        typeof fieldValue.latitude !== "number" &&
        typeof fieldValue.path !== "string";

      if (isNestedObject) {
        flattenFirestoreRecord(
          fieldValue,
          columnName,
          result
        );

        return;
      }

      result[columnName] =
        normaliseFirestoreValue(
          fieldValue
        );
    }
  );

  return result;
}

async function getFirestoreExportRows(
  collectionName
) {
  const snapshot = await getDocs(
    collection(db, collectionName)
  );

  return snapshot.docs.map(
    (item) =>
      flattenFirestoreRecord({
        documentId: item.id,
        ...item.data(),
      })
  );
}

function getCachedExportRows(
  collectionName
) {
  let records = null;

  if (collectionName === "users") {
    records = usersData;
  } else if (collectionName === "bookings") {
    records = bookingsData;
  } else if (
    collectionName === "partner_cars"
  ) {
    records = hostCarsData;
  }

  if (!records) {
    return null;
  }

  return records.map(
    (item) =>
      flattenFirestoreRecord({
        documentId: item.id,
        ...item,
      })
  );
}

function createExportWorksheet(rows) {
  const XLSX = window.XLSX;
  const worksheetRows = rows.length
    ? rows
    : [{ Message: "No records" }];

  const headers = Array.from(
    new Set(
      worksheetRows.flatMap(
        (row) => Object.keys(row)
      )
    )
  );

  const worksheet =
    XLSX.utils.json_to_sheet(
      worksheetRows,
      { header: headers }
    );

  worksheet["!autofilter"] = {
    ref: worksheet["!ref"],
  };

  worksheet["!cols"] = headers.map(
    (header) => {
      const longest = Math.max(
        header.length,
        ...worksheetRows.map(
          (row) =>
            String(row[header] ?? "").length
        )
      );

      return {
        wch: Math.min(
          Math.max(longest + 2, 12),
          45
        ),
      };
    }
  );

  return worksheet;
}
async function exportFirebaseToExcel() {
  if (!exportFirebaseExcelBtn) {
    return;
  }

  if (!currentUser) {
    alert("You must be signed in as an administrator.");
    return;
  }

  const originalText =
    exportFirebaseExcelBtn.textContent;

  try {
    exportFirebaseExcelBtn.disabled = true;
    exportFirebaseExcelBtn.textContent =
      "Preparing Excel...";

    if (firebaseExportStatus) {
      firebaseExportStatus.textContent =
        "Generating Excel from Firebase...";
    }

    const token =
      await currentUser.getIdToken();

    const response = await fetch(
      `${MEDIA_SERVER_URL}/api/admin/export/excel`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      let message =
        `Export failed (${response.status}).`;

      try {
        const data =
          await response.json();

        if (data.error) {
          message = data.error;
        }
      } catch (_) {
        // Response wasn't JSON.
      }

      throw new Error(message);
    }

    const blob =
      await response.blob();

    const downloadUrl =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = downloadUrl;

    const date =
      new Date()
        .toISOString()
        .slice(0, 10);

    link.download =
      `CARRENTPE_Firebase_${date}.xlsx`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(
      downloadUrl
    );

    if (firebaseExportStatus) {
      firebaseExportStatus.textContent =
        "Excel export completed successfully.";
    }

  } catch (error) {
    console.error(
      "FIREBASE EXCEL EXPORT ERROR:",
      error
    );

    if (firebaseExportStatus) {
      firebaseExportStatus.textContent =
        "Excel export failed.";
    }

    alert(
      "Could not create export.\n\n" +
      error.message
    );

  } finally {
    exportFirebaseExcelBtn.disabled = false;

    exportFirebaseExcelBtn.textContent =
      originalText;
  }
}
// ============================================================================
// USERS
// ============================================================================

async function loadUsers() {
  if (usersTableWrap) {
    usersTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading users...
      </p>`;
  }

  try {
    const snapshot =
      await getDocs(
        collection(db, "users")
      );

    usersData =
      snapshot.docs.map(
        (item) => ({
          id: item.id,
          ...item.data(),
        })
      );

    usersData.sort(
      (a, b) =>
        toMillis(b.createdAt || b.documentsVerifiedAt) -
        toMillis(a.createdAt || a.documentsVerifiedAt)
    );

    updateUserStats();

    renderUsersTable(
      usersData
    );

  } catch (error) {
    console.error("LOAD USERS ERROR:", error);

    const isPermErr = error.code === "permission-denied" || (error.message && error.message.includes("permission"));
    const errMsg = isPermErr
      ? "Admin Authentication Required — Sign in on the Profile page as an Admin to inspect user identity records."
      : error.message;

    if (usersTableWrap) {
      usersTableWrap.innerHTML =
        `<div style="padding:24px;text-align:center;background:rgba(255,92,119,0.06);border:1px solid rgba(255,92,119,0.2);border-radius:14px;margin:10px 0;">
          <p style="color:#ff5c77;font-weight:700;margin:0 0 6px;">Unable to fetch user records</p>
          <p style="color:var(--kr-text-secondary);font-size:13px;margin:0 0 14px;">${escapeHtml(errMsg)}</p>
          ${isPermErr ? `<a href="profile.html" class="btn btn-dark btn-sm" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;">Go to Profile &amp; Sign In</a>` : ""}
        </div>`;
    }
  }
}

function updateUserStats() {
  const totalUsers =
    $("statTotalUsers");

  if (totalUsers) {
    totalUsers.textContent =
      usersData.length;
  }

  const pending =
    usersData.filter(
      (user) =>
        user.licenseStatus ===
          "pending" ||
        user.aadharStatus ===
          "pending" ||
        user.panStatus ===
          "pending"
    ).length;

  const pendingEl =
    $("statPendingDocs");

  if (pendingEl) {
    pendingEl.textContent =
      pending;
  }
}

function updateBookingStats() {
  const totalBookings = $("statTotalBookings");
  if (totalBookings) {
    totalBookings.textContent = bookingsData.length;
  }
}

function documentStatusLabel(
  status
) {
  switch (status) {
    case "verified":
      return "Verified";

    case "pending":
      return "Pending Review";

    case "rejected":
      return "Rejected";

    default:
      return "Not Submitted";
  }
}

function documentStatusClass(
  status
) {
  if (status === "verified") {
    return "verified";
  }

  if (status === "rejected") {
    return "rejected";
  }

  if (status === "pending") {
    return "pending";
  }

  return "";
}

// ============================================================================
// USERS TABLE
// ============================================================================

function renderUsersTable(
  users
) {
  if (!usersTableWrap) {
    return;
  }

  if (!users.length) {
    usersTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        No user records found.
      </p>`;

    return;
  }

  let html = `
    <div style="width:100%;overflow-x:auto;">
      <table
        class="admin-table"
        style="
          width:100%;
          min-width:940px;
          border-collapse:collapse;
          text-align:left;
        "
      >
        <thead>
          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >
            <th style="padding:12px;">
              User
            </th>

            <th style="padding:12px;">
              Contact
            </th>

            <th style="padding:12px;">
              Role
            </th>

            <th style="padding:12px;">
              License
            </th>

            <th style="padding:12px;">
              Aadhaar
            </th>

            <th style="padding:12px;">
              PAN
            </th>

            <th style="padding:12px;text-align:right;">
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
  `;

  users.forEach(
    (user) => {
      const hasLicense = Boolean(user.licenseFrontURL || user.licenseURL);
      const hasAadhaar = Boolean(user.aadharFrontURL || user.aadharURL);
      const hasPan = Boolean(user.panFrontURL || user.panURL);

      const license = hasLicense ? (user.licenseStatus || "pending") : "not_submitted";
      const aadhaar = hasAadhaar ? (user.aadharStatus || "pending") : "not_submitted";
      const pan = hasPan ? (user.panStatus || "pending") : "not_submitted";

      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,0.06);
          "
        >

          <td style="padding:12px;">
            <strong>
              ${escapeHtml(
                user.name ||
                  "Unnamed"
              )}
            </strong>

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.8rem;
              "
            >
              ${escapeHtml(
                user.email ||
                  "No email"
              )}
            </span>
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              user.phone ||
                "—"
            )}
          </td>

          <td style="padding:12px;">
            <select
              class="kr-clean-input role-select"
              data-uid="${escapeHtml(user.id)}"
              style="width:auto;min-width:130px;height:34px;font-size:12.5px;"
            >

              <option
                value="customer"
                ${
                  user.role ===
                  "customer"
                    ? "selected"
                    : ""
                }
              >
                Customer
              </option>

              <option
                value="manager"
                ${
                  user.role ===
                  "manager"
                    ? "selected"
                    : ""
                }
              >
                Manager
              </option>

              <option
                value="executive"
                ${
                  user.role ===
                  "executive"
                    ? "selected"
                    : ""
                }
              >
                Executive
              </option>

              <option
                value="admin"
                ${
                  user.role ===
                  "admin"
                    ? "selected"
                    : ""
                }
              >
                Admin
              </option>

            </select>
          </td>

          <td style="padding:12px;">
            <span
              class="fleet-status ${documentStatusClass(
                license
              )}"
            >
              ${documentStatusLabel(
                license
              )}
            </span>

            <br>

            <button
              type="button"
              class="btn btn-outline inspect-document-btn"
              data-uid="${escapeHtml(
                user.id
              )}"
              data-type="license"
              style="
                margin-top:6px;
                padding:4px 8px;
                font-size:.75rem;
              "
            >
              Inspect
            </button>
          </td>

          <td style="padding:12px;">
            <span
              class="fleet-status ${documentStatusClass(
                aadhaar
              )}"
            >
              ${documentStatusLabel(
                aadhaar
              )}
            </span>

            <br>

            <button
              type="button"
              class="btn btn-outline inspect-document-btn"
              data-uid="${escapeHtml(
                user.id
              )}"
              data-type="aadhar"
              style="
                margin-top:6px;
                padding:4px 8px;
                font-size:.75rem;
              "
            >
              Inspect
            </button>
          </td>

          <td style="padding:12px;">
            <span class="fleet-status ${documentStatusClass(pan)}">
              ${documentStatusLabel(pan)}
            </span>
            <br>
            <button
              type="button"
              class="btn btn-outline inspect-document-btn"
              data-uid="${escapeHtml(user.id)}"
              data-type="pan"
              style="margin-top:6px;padding:4px 8px;font-size:.75rem;"
            >
              Inspect
            </button>
          </td>

          <td
            style="
              padding:12px;
              text-align:right;
            "
          >

            <span style="color:${license === "verified" && aadhaar === "verified" && pan === "verified" ? "#06d6a0" : "var(--sub)"};font-size:.8rem;">
              ${license === "verified" && aadhaar === "verified" && pan === "verified"
                ? "Identity verified"
                : "Review each ID"}
            </span>

          </td>

        </tr>
      `;
    }
  );

  html += `
        </tbody>
      </table>
    </div>
  `;

  usersTableWrap.innerHTML =
    html;

  // INSPECT DOCUMENT
  usersTableWrap
    .querySelectorAll(
      ".inspect-document-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const uid =
            button.dataset.uid;

          const type =
            button.dataset.type;

          const user =
            usersData.find(
              (item) =>
                item.id === uid
            );

          if (!user) {
            alert(
              "User record not found."
            );

            return;
          }

          openDocumentModal(
            user,
            type
          );
        }
      );
    });

  // ROLE
  usersTableWrap
    .querySelectorAll(
      ".role-select"
    )
    .forEach((select) => {
      select.addEventListener(
        "change",
        async () => {
          const uid =
            select.dataset.uid;

          const newRole =
            select.value;

          const user =
            usersData.find(
              (item) =>
                item.id === uid
            );

          if (!user) return;

          const oldRole =
            user.role;

          user.role =
            newRole;

          try {
            await setDoc(
              doc(
                db,
                "users",
                uid
              ),
              {
                role: newRole,
              },
              {
                merge: true,
              }
            );

          } catch (error) {
            console.error(
              "ROLE UPDATE ERROR:",
              error
            );

            user.role =
              oldRole;

            select.value =
              oldRole ||
              "customer";

            alert(
              "Could not update role.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // APPROVE ACCOUNT
  usersTableWrap
    .querySelectorAll(
      ".approve-all-docs-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const uid =
            button.dataset.uid;

          const oldText =
            button.textContent;

          button.disabled = true;
          button.textContent =
            "Verifying...";

          try {
            await setDoc(
              doc(
                db,
                "users",
                uid
              ),
              {
                licenseStatus:
                  "verified",

                aadharStatus:
                  "verified",

                panStatus:
                  "verified",

                documentsVerifiedAt:
                  serverTimestamp(),

                documentsVerifiedBy:
                  currentUser
                    ? currentUser.uid
                    : null,
              },
              {
                merge: true,
              }
            );

            const user =
              usersData.find(
                (item) =>
                  item.id === uid
              );

            if (user) {
              user.licenseStatus =
                "verified";

              user.aadharStatus =
                "verified";

              user.panStatus =
                "verified";
            }

            updateUserStats();

            renderUsersTable(
              usersData
            );

          } catch (error) {
            console.error(
              "DOCUMENT APPROVAL ERROR:",
              error
            );

            button.disabled =
              false;

            button.textContent =
              oldText;

            alert(
              "Could not approve documents.\n\n" +
              error.message
            );
          }
        }
      );
    });
}

// ============================================================================
// DOCUMENT MODAL
// ============================================================================

function initialiseDocumentModal() {
  const close =
    $("closeDocModal");

  if (close) {
    close.addEventListener(
      "click",
      () => {
        hideModal(
          "docModal"
        );
      }
    );
  }

  const approve =
    $("approveDocBtn");

  if (approve) {
    approve.addEventListener(
      "click",
      async () => {
        if (
          !activeDocUser ||
          !activeDocType
        ) {
          return;
        }

        await updateDocumentStatus(
          activeDocUser.id,
          activeDocType,
          "verified"
        );

        hideModal(
          "docModal"
        );
      }
    );
  }

  const reject =
    $("rejectDocBtn");

  if (reject) {
    reject.addEventListener(
      "click",
      async () => {
        if (
          !activeDocUser ||
          !activeDocType
        ) {
          return;
        }

        await updateDocumentStatus(
          activeDocUser.id,
          activeDocType,
          "rejected"
        );

        hideModal(
          "docModal"
        );
      }
    );
  }

  const uploadButton =
    $("docUploadBtn");

  const uploadInput =
    $("docUploadInput");

  if (
    uploadButton &&
    uploadInput
  ) {
    uploadButton.addEventListener(
      "click",
      () => {
        uploadInput.click();
      }
    );

    uploadInput.addEventListener(
      "change",
      async () => {
        const file =
          uploadInput.files?.[0];

        if (
          !file ||
          !activeDocUser ||
          !activeDocType
        ) {
          return;
        }

        await uploadDocument(
          activeDocUser.id,
          activeDocType,
          file
        );

        uploadInput.value =
          "";
      }
    );
  }
}

async function fetchAdminDocumentPreview(mediaUrl) {
  if (!mediaUrl) return null;
  const str = String(mediaUrl).trim();

  // If it's already a data URI or blob URL
  if (str.startsWith("data:") || str.startsWith("blob:")) {
    return str;
  }

  const isFullHttp = str.startsWith("http://") || str.startsWith("https://");
  const url = isFullHttp ? str : `${MEDIA_SERVER_URL}${str.startsWith("/") ? "" : "/"}${str}`;

  try {
    const token = currentUser ? await currentUser.getIdToken().catch(() => null) : null;
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      if (isFullHttp) return str;
      throw new Error(`Media server status ${response.status}`);
    }
    return URL.createObjectURL(await response.blob());
  } catch (err) {
    if (isFullHttp) return str;
    throw err;
  }
}

async function openDocumentModal(
  user,
  type
) {
  activeDocObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeDocObjectUrls = [];

  activeDocUser =
    user;

  activeDocType =
    type;

  const configs = {
    license: {
      title: "Driving Licence",
      front: user.licenseFrontURL || user.licenseURL,
      back: user.licenseBackURL,
      requiresBack: true
    },
    aadhar: {
      title: "Aadhaar Card",
      front: user.aadharFrontURL || user.aadharURL,
      back: user.aadharBackURL,
      requiresBack: true
    },
    pan: {
      title: "PAN Card",
      front: user.panFrontURL,
      back: user.panBackURL,
      requiresBack: true
    }
  };

  const config = configs[type] || configs.license;
  const urls = [config.front, config.back];

  const titleEl =
    $("modalTitle");

  if (titleEl) {
    titleEl.textContent =
      `${user.name || "User"} — ${config.title}`;
  }

  const img =
    $("modalImg");
  const backImg = $("modalBackImg");
  const frontFigure = $("modalFrontFigure");
  const backFigure = $("modalBackFigure");
  const previewGrid = $("documentPreviewGrid");

  const approve =
    $("approveDocBtn");

  const reject =
    $("rejectDocBtn");

  if (frontFigure) frontFigure.style.display = "block";
  if (backFigure) backFigure.style.display = config.requiresBack ? "block" : "none";
  if (previewGrid) {
    previewGrid.style.gridTemplateColumns = config.requiresBack
      ? "repeat(2,minmax(0,1fr))"
      : "1fr";
  }

  showModal(
    "docModal"
  );

  const targets = [img, backImg];
  let loadedCount = 0;

  const noFrontUploaded = !config.front;
  const noBackUploaded = config.requiresBack && !config.back;

  if (img) {
    if (noFrontUploaded) {
      img.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'%3E%3Crect width='100%25' height='100%25' fill='%23121926' rx='12'/%3E%3Ctext x='50%25' y='50%25' fill='%23ef476f' font-family='sans-serif' font-size='14' font-weight='bold' text-anchor='middle'%3ENo Front Side Uploaded%3C/text%3E%3C/svg%3E`;
      img.style.display = "block";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
    }
  }

  if (backImg) {
    if (noBackUploaded) {
      backImg.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'%3E%3Crect width='100%25' height='100%25' fill='%23121926' rx='12'/%3E%3Ctext x='50%25' y='50%25' fill='%23ef476f' font-family='sans-serif' font-size='14' font-weight='bold' text-anchor='middle'%3ENo Back Side Uploaded%3C/text%3E%3C/svg%3E`;
      backImg.style.display = "block";
    } else {
      backImg.removeAttribute("src");
      backImg.style.display = "none";
    }
  }

  await Promise.all(urls.map(async (url, index) => {
    if (!url || !targets[index]) return;
    try {
      const objectUrl = await fetchAdminDocumentPreview(url);
      if (!objectUrl) return;
      if (activeDocUser !== user || activeDocType !== type || !targets[index].isConnected) {
        if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
        return;
      }
      if (objectUrl.startsWith("blob:")) activeDocObjectUrls.push(objectUrl);
      targets[index].src = objectUrl;
      targets[index].style.display = "block";
      loadedCount += 1;
    } catch (error) {
      // Fallback placeholder image when document ID is missing from local storage
      const fallbackSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'%3E%3Crect width='100%25' height='100%25' fill='%23121926' rx='12'/%3E%3Ctext x='50%25' y='46%25' fill='%2348d7ff' font-family='sans-serif' font-size='14' font-weight='bold' text-anchor='middle'%3EProtected Document on Cloud%3C/text%3E%3Ctext x='50%25' y='58%25' fill='%237b8798' font-family='sans-serif' font-size='12' text-anchor='middle'%3ERef: ${encodeURIComponent(String(url).slice(-20))}%3C/text%3E%3C/svg%3E`;
      targets[index].src = fallbackSvg;
      targets[index].style.display = "block";
      loadedCount += 1;
    }
  }));

  const requiredCount = config.requiresBack ? 2 : 1;
  const hasAllRequiredFiles = !noFrontUploaded && (!config.requiresBack || !noBackUploaded) && loadedCount >= requiredCount;

  if (approve) {
    approve.disabled = !hasAllRequiredFiles;
    approve.title = hasAllRequiredFiles ? "Approve document verification" : "Cannot approve verification without required document images.";
  }
  if (reject) {
    reject.disabled = false;
  }
}

async function updateDocumentStatus(
  uid,
  type,
  status
) {
  const user =
    usersData.find(
      (item) =>
        item.id === uid
    );

  if (!user) return;

  const updates = {};

  if (
    type === "license" ||
    type === "both"
  ) {
    updates.licenseStatus =
      status;
  }

  if (
    type === "aadhar" ||
    type === "both"
  ) {
    updates.aadharStatus =
      status;
  }

  if (
    type === "pan" ||
    type === "both"
  ) {
    updates.panStatus = status;
  }

  try {
    await setDoc(
      doc(
        db,
        "users",
        uid
      ),
      updates,
      {
        merge: true,
      }
    );

    Object.assign(
      user,
      updates
    );

    updateUserStats();

    renderUsersTable(
      usersData
    );

  } catch (error) {
    console.error(
      "DOCUMENT STATUS ERROR:",
      error
    );

    alert(
      "Could not update document status.\n\n" +
      error.message
    );
  }
}

async function uploadDocument(
  uid,
  type,
  file
) {
  const status =
    $("docUploadStatus");

  const button =
    $("docUploadBtn");

  if (button) {
    button.disabled =
      true;

    button.textContent =
      "Uploading...";
  }

  if (status) {
    status.textContent =
      "Uploading...";
  }

  try {
    const safeName =
      file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

    const path =
      `user_documents/${uid}/${type}/${Date.now()}-${safeName}`;

    const storageRef =
      ref(
        storage,
        path
      );

    await uploadBytes(
      storageRef,
      file
    );

    const url =
      await getDownloadURL(
        storageRef
      );

    const updates = {
      [`${type}URL`]:
        url,

      [`${type}Status`]:
        "pending",

      [`${type}UploadedBy`]:
        currentUser
          ? currentUser.uid
          : null,

      [`${type}UploadedAt`]:
        serverTimestamp(),
    };

    await setDoc(
      doc(
        db,
        "users",
        uid
      ),
      updates,
      {
        merge: true,
      }
    );

    const user =
      usersData.find(
        (item) =>
          item.id === uid
      );

    if (user) {
      Object.assign(
        user,
        updates
      );
    }

    renderUsersTable(
      usersData
    );

    if (user) {
      activeDocUser =
        user;

      openDocumentModal(
        user,
        type
      );
    }

    if (status) {
      status.textContent =
        "Uploaded successfully. Document is now pending review.";
    }

  } catch (error) {
    console.error(
      "DOCUMENT UPLOAD ERROR:",
      error
    );

    alert(
      "Could not upload document.\n\n" +
      error.message
    );

    if (status) {
      status.textContent =
        error.message;
    }

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        "Upload Replacement / Missing Document";
    }
  }
}

// ============================================================================
// BOOKINGS
// ============================================================================

async function loadBookings() {
  if (bookingsTableWrap) {
    bookingsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading bookings...
      </p>`;
  }

  if (paymentsTableWrap) {
    paymentsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading payments...
      </p>`;
  }

  try {
    /*
     * IMPORTANT:
     *
     * Do NOT use Firestore orderBy(createdAt).
     *
     * Older bookings may not contain createdAt.
     * Fetch all bookings and sort locally.
     */

    const fetchPromise = getDocs(collection(db, "bookings"));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Firebase query timed out — please check network connection or sign in on Profile page.")), 7000)
    );

    const snapshot = await Promise.race([fetchPromise, timeoutPromise]);

    bookingsData = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    sortBookings();

    const totalBookings =
      $("statTotalBookings");

    if (totalBookings) {
      totalBookings.textContent =
        bookingsData.length;
    }

    renderBookingsTable(
      getFilteredBookings()
    );

    renderPaymentsTable();

    updateRevenueStats();

  } catch (error) {
    console.error("LOAD BOOKINGS ERROR:", error);

    const isPermErr = error.code === "permission-denied" || (error.message && error.message.includes("permission"));
    const errMsg = isPermErr
      ? "Admin Authentication Required — Please sign in with an Admin account on the Profile page to load live Firestore bookings."
      : error.message;

    if (bookingsTableWrap) {
      bookingsTableWrap.innerHTML =
        `<div style="padding:24px;text-align:center;background:rgba(255,92,119,0.06);border:1px solid rgba(255,92,119,0.2);border-radius:14px;margin:10px 0;">
          <p style="color:#ff5c77;font-weight:700;margin:0 0 6px;">Unable to fetch live bookings</p>
          <p style="color:var(--kr-text-secondary);font-size:13px;margin:0 0 14px;">${escapeHtml(errMsg)}</p>
          ${isPermErr ? `<a href="profile.html" class="btn btn-dark btn-sm" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;">Go to Profile &amp; Sign In</a>` : ""}
        </div>`;
    }

    if (paymentsTableWrap) {
      paymentsTableWrap.innerHTML =
        `<div style="padding:24px;text-align:center;color:var(--kr-text-muted);font-size:13px;">
          Awaiting Admin Authentication to load payment verification queue.
        </div>`;
    }
  }
}

// ============================================================================
// BOOKINGS TABLE
//
// Date, odometer, and FASTag are deliberately handled as follows:
//
// MAIN TABLE:
// Date | Ref | Customer | Vehicle | Amount | Status | Details
//
// DETAILS:
// Pickup/Return dates
// Start odometer
// End odometer
// Distance
// FASTag at start
// FASTag at return
// Payment
// Status
// Return Report / Process Return
// ============================================================================

function renderBookingsTable(
  bookings
) {
  if (!bookingsTableWrap) {
    return;
  }

  const totalPages = Math.max(
    1,
    Math.ceil(bookings.length / ADMIN_BOOKINGS_PER_PAGE)
  );
  adminBookingPage = Math.min(adminBookingPage, totalPages);
  const pageStart =
    (adminBookingPage - 1) * ADMIN_BOOKINGS_PER_PAGE;
  const pageBookings = bookings.slice(
    pageStart,
    pageStart + ADMIN_BOOKINGS_PER_PAGE
  );

  if (!bookings.length) {
    bookingsTableWrap.innerHTML =
      `<div
        style="
          padding:40px;
          text-align:center;
          color:var(--sub);
        "
      >
        <div
          style="
            font-size:2rem;
            margin-bottom:10px;
          "
        >
          No results
        </div>

        <strong>
          No bookings found
        </strong>

        <p style="margin-top:8px;">
          Try changing the status or date filters.
        </p>
      </div>`;

    return;
  }

  let html = `
    <div
      style="
        width:100%;
        overflow-x:auto;
      "
    >

      <table
        class="admin-table"
        style="
          width:100%;
          min-width:1100px;
          border-collapse:collapse;
          text-align:left;
          font-size:.9rem;
        "
      >

        <thead>

          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >

            <th style="padding:14px;">
              DATE
            </th>

            <th style="padding:14px;">
              BOOKING REF
            </th>

            <th style="padding:14px;">
              CUSTOMER
            </th>

            <th style="padding:14px;">
              VEHICLE
            </th>

            <th style="padding:14px;">
              AMOUNT
            </th>

            <th style="padding:14px;">
              STATUS
            </th>

            <th
              style="
                padding:14px;
                text-align:right;
              "
            >
              DETAILS
            </th>

          </tr>

        </thead>

        <tbody>
  `;

  pageBookings.forEach(
    (booking) => {
      const id =
        booking.id;

      const rowId =
        `booking-details-${id}`;

      const status =
        String(
          booking.status ||
            "unknown"
        ).toLowerCase();

      const customer =
        booking.userName ||
        booking.customerName ||
        booking.name ||
        "Customer";

      const vehicle =
        booking.vehicleName ||
        booking.carName ||
        booking.vehicle ||
        "Vehicle";

      const amount =
        booking.totalAmount ??
        booking.amount ??
        booking.total ??
        0;

      const startOdo =
        getStartOdometer(
          booking
        );

      const endOdo =
        getEndOdometer(
          booking
        );

      const distance =
        calculateDistance(
          startOdo,
          endOdo
        );

      const startFastag =
        getStartFastag(
          booking
        );

      const returnFastag =
        getReturnFastag(
          booking
        );

      let returnButton = "";

      if (
        status ===
        "confirmed"
      ) {
        returnButton = `
          <button
            type="button"
            class="btn btn-dark process-return-btn"
            data-bid="${escapeHtml(
              id
            )}"
            style="
              padding:6px 12px;
              font-size:.8rem;
            "
          >
            Process Return
          </button>
        `;
      }

      if (
        status ===
          "completed" &&
        booking.returnInspection
      ) {
        returnButton = `
          <button
            type="button"
            class="btn btn-outline view-return-report-btn"
            data-bid="${escapeHtml(
              id
            )}"
            style="
              padding:6px 12px;
              font-size:.8rem;
            "
          >
            View Return Report
          </button>
        `;
      }

      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
          "
        >

          <td
            style="
              padding:14px;
              white-space:nowrap;
            "
          >
            ${getBookingDisplayDate(
              booking
            )}
          </td>

          <td
            style="
              padding:14px;
              font-family:monospace;
            "
          >
            #${escapeHtml(
              id.slice(0, 8)
            )}
          </td>

          <td style="padding:14px;">
            <strong>
              ${escapeHtml(
                customer
              )}
            </strong>

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.78rem;
              "
            >
              ${escapeHtml(
                booking.userPhone ||
                  booking.phone ||
                  booking.userEmail ||
                  "—"
              )}
            </span>
          </td>

          <td style="padding:14px;">
            ${escapeHtml(
              vehicle
            )}

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.78rem;
              "
            >
              ${escapeHtml(
                booking.vehicleReg ||
                  booking.registration ||
                  booking.regNumber ||
                  "—"
              )}
            </span>
          </td>

          <td
            style="
              padding:14px;
              color:var(--accent);
              font-weight:700;
            "
          >
            ${formatINR(
              amount
            )}
          </td>

          <td style="padding:14px;">
            <span
              class="fleet-status ${getStatusClass(
                status
              )}"
            >
              ${escapeHtml(
                status
              )}
            </span>
          </td>

          <td
            style="
              padding:14px;
              text-align:right;
            "
          >

            <button
              type="button"
              class="btn btn-outline booking-details-btn"
              data-target="${escapeHtml(
                rowId
              )}"
              data-bid="${escapeHtml(
                id
              )}"
              style="
                padding:6px 12px;
                font-size:.8rem;
              "
            >
              ${
                expandedBookingId === id
                  ? "Details ▲"
                  : "Details ▼"
              }
            </button>

          </td>

        </tr>

        <tr
          id="${escapeHtml(
            rowId
          )}"
          class="booking-detail-row"
          ${
            expandedBookingId === id
              ? ""
              : "hidden"
          }
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
            background:
              rgba(255,255,255,.02);
          "
        >

          <td
            colspan="7"
            style="
              padding:20px;
            "
          >

            <div
              style="
                display:grid;
                grid-template-columns:
                  repeat(
                    auto-fit,
                    minmax(210px,1fr)
                  );
                gap:16px;
              "
            >

              <!-- CUSTOMER -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Customer Email
                </span>

                ${escapeHtml(
                  booking.userEmail ||
                    booking.email ||
                    "—"
                )}
              </div>

              <!-- VEHICLE -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Vehicle Registration
                </span>

                ${escapeHtml(
                  booking.vehicleReg ||
                    booking.registration ||
                    booking.regNumber ||
                    "—"
                )}
              </div>

              <!-- PICKUP -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Pickup Date
                </span>

                ${formatDate(
                  booking.pickupDate ||
                    booking.bookingDate
                )}
              </div>

              <!-- RETURN -->

              <div>
                <span style="display:block;color:var(--sub);font-size:.75rem;margin-bottom:4px;">
                  Pickup Handover
                </span>
                ${escapeHtml(
                  String(booking.pickupStatus || "awaiting pickup")
                    .replaceAll("_", " ")
                    .replace(/\b\w/g, (letter) => letter.toUpperCase())
                )}
              </div>

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Return Date
                </span>

                ${formatDate(
                  booking.dropDate ||
                    booking.returnDate
                )}
              </div>

              <!-- PAYMENT -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Payment
                </span>

                ${paymentStatusText(
                  booking
                )}
              </div>

              <!-- START ODO -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  Start Odometer (KM)
                </label>

                <input
                  type="number"
                  min="0"
                  class="booking-start-odo"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    startOdo
                  )}"
                  placeholder="Start KM"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- END ODO -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  End Odometer (KM)
                </label>

                <input
                  type="number"
                  min="0"
                  class="booking-end-odo"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    endOdo
                  )}"
                  placeholder="End KM"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- FASTAG AT START -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  FASTag at Start (₹)
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  class="booking-start-fastag"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    startFastag
                  )}"
                  placeholder="Start balance"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- FASTAG AT RETURN -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  FASTag at Return (₹)
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  class="booking-return-fastag"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    returnFastag
                  )}"
                  placeholder="Return balance"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- DISTANCE -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Distance Driven
                </span>

                <strong
                  class="booking-distance"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  style="
                    color:var(--accent);
                    font-size:1.1rem;
                  "
                >
                  ${
                    distance !== null
                      ? `${distance} KM`
                      : "Not calculated"
                  }
                </strong>
              </div>

            </div>

            <!-- DETAIL ACTIONS -->

            <div
              style="
                display:flex;
                gap:10px;
                flex-wrap:wrap;
                align-items:center;
                margin-top:20px;
                padding-top:16px;
                border-top:
                  1px dashed var(--line);
              "
            >

              <button
                type="button"
                class="btn btn-dark save-booking-odo-btn"
                data-bid="${escapeHtml(
                  id
                )}"
                style="
                  padding:7px 14px;
                  font-size:.8rem;
                "
              >
                Save Odometer
              </button>

              <button
                type="button"
                class="btn btn-dark save-booking-fastag-btn"
                data-bid="${escapeHtml(
                  id
                )}"
                style="
                  padding:7px 14px;
                  font-size:.8rem;
                "
              >
                Save FASTag
              </button>

              ${
                status ===
                "pending_payment"
                  ? `
                    <select
                      class="kr-clean-input booking-status-select"
                      data-bid="${escapeHtml(id)}"
                      style="width: auto; min-width: 170px; height: 38px;"
                    >
                      <option value="pending_payment" selected>Pending Payment</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  `
                  : ""
              }

              ${
                status ===
                "confirmed"
                  ? `
                    <select
                      class="kr-clean-input booking-status-select"
                      data-bid="${escapeHtml(id)}"
                      style="width: auto; min-width: 170px; height: 38px;"
                    >
                      <option value="confirmed" selected>Confirmed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  `
                  : ""
              }

              ${returnButton}

              ${Array.isArray(booking.pickupPhotoMediaIds) && booking.pickupPhotoMediaIds.length
                ? `
                  <button
                    type="button"
                    class="btn btn-outline admin-view-pickup-photos-btn"
                    data-bid="${escapeHtml(id)}"
                    style="padding:7px 14px;font-size:.8rem;"
                  >
                    Pickup Photos (${booking.pickupPhotoMediaIds.length})
                  </button>
                `
                : ""}

            </div>

          </td>

        </tr>
      `;
    }
  );

  html += `
        </tbody>
      </table>

    </div>
    ${renderAdminPagination({
      page: adminBookingPage,
      totalPages,
      totalItems: bookings.length,
      type: "bookings"
    })}
  `;

  bookingsTableWrap.innerHTML =
    html;

  attachBookingEvents();

  bookingsTableWrap
    .querySelectorAll("[data-admin-page-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        adminBookingPage +=
          button.dataset.adminPageAction === "next" ? 1 : -1;
        renderBookingsTable(getFilteredBookings());
        bookingsTableWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
}

function renderAdminPagination({ page, totalPages, totalItems, type }) {
  if (totalPages <= 1) return "";

  const attribute =
    type === "payments"
      ? "data-admin-payment-page-action"
      : "data-admin-page-action";

  return `
    <nav class="data-pagination" aria-label="${escapeHtml(type)} pages">
      <span class="data-pagination__summary">
        Page ${page} of ${totalPages} · ${totalItems} ${escapeHtml(type)}
      </span>
      <div class="data-pagination__actions">
        <button type="button" ${attribute}="previous" ${page === 1 ? "disabled" : ""}>Previous</button>
        <button type="button" ${attribute}="next" ${page === totalPages ? "disabled" : ""}>Next</button>
      </div>
    </nav>`;
}

// ============================================================================
// BOOKING EVENTS
// ============================================================================

async function openAdminPickupPhotos(booking) {
  document.getElementById("adminPickupPhotosModal")?.remove();

  const mediaIds = Array.isArray(booking.pickupPhotoMediaIds)
    ? booking.pickupPhotoMediaIds
    : [];
  const modal = document.createElement("div");
  modal.id = "adminPickupPhotosModal";
  modal.style.cssText = `
    position:fixed;inset:0;z-index:99999;display:flex;align-items:center;
    justify-content:center;padding:20px;background:rgba(0,0,0,.88);
    backdrop-filter:blur(10px);
  `;
  modal.innerHTML = `
    <div class="card" style="width:min(820px,100%);max-height:90vh;overflow:auto;padding:26px;position:relative;">
      <button id="closeAdminPickupPhotos" type="button" style="position:absolute;top:14px;right:16px;border:0;background:transparent;color:var(--text);font-size:1.7rem;cursor:pointer;">&times;</button>
      <h3 style="margin:0 40px 6px 0;">Pickup Condition Photos</h3>
      <p style="margin:0 0 18px;color:var(--sub);">
        ${escapeHtml(booking.vehicleName || "Vehicle")} · Booking #${escapeHtml(formatBookingNumber(booking))}
      </p>
      <div id="adminPickupPhotosGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;">
        Loading protected pickup photos...
      </div>
      ${booking.pickupNotes ? `<div style="margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:10px;"><strong>Pickup notes</strong><p style="margin:6px 0 0;color:var(--sub);">${escapeHtml(booking.pickupNotes)}</p></div>` : ""}
    </div>
  `;

  document.body.appendChild(modal);
  const objectUrls = [];
  let closed = false;
  const close = () => {
    closed = true;
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    modal.remove();
  };
  modal.querySelector("#closeAdminPickupPhotos")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  const photos = await Promise.all(
    mediaIds.map(async (mediaId) => {
      try {
        const url = await fetchMediaBlobUrl(mediaId);
        if (closed) {
          URL.revokeObjectURL(url);
          return "";
        }
        objectUrls.push(url);
        return `<img src="${escapeHtml(url)}" alt="Pickup condition" style="width:100%;height:210px;object-fit:cover;border-radius:10px;border:1px solid var(--line);" />`;
      } catch (error) {
        console.error("PICKUP PHOTO LOAD ERROR:", error);
        return `<div style="padding:18px;color:#ef476f;border:1px solid var(--line);border-radius:10px;">Photo unavailable</div>`;
      }
    })
  );

  const grid = modal.querySelector("#adminPickupPhotosGrid");
  if (grid?.isConnected) {
    grid.innerHTML = photos.filter(Boolean).join("") ||
      `<p style="color:var(--sub);">No pickup photos available.</p>`;
  }
}

function attachBookingEvents() {
  bookingsTableWrap

  bookingsTableWrap
    .querySelectorAll(".admin-view-pickup-photos-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const booking = bookingsData.find(
          (item) => item.id === button.dataset.bid
        );
        if (booking) openAdminPickupPhotos(booking);
      });
    });

  // DETAILS
  bookingsTableWrap
    .querySelectorAll(
      ".booking-details-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const id =
            button.dataset.bid;

          const row =
            document.getElementById(
              button.dataset.target
            );

          if (!row) {
            console.error(
              "Booking detail row missing:",
              button.dataset.target
            );

            return;
          }

          const isHidden =
            row.hidden;

          row.hidden =
            !isHidden;

          expandedBookingId =
            isHidden
              ? id
              : null;

          button.textContent =
            isHidden
              ? "Details ▲"
              : "Details ▼";
        }
      );
    });

  // ODOMETER SAVE
  bookingsTableWrap
    .querySelectorAll(
      ".save-booking-odo-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          await saveBookingOdometer(
            button.dataset.bid,
            button
          );
        }
      );
    });

  // FASTAG SAVE
  bookingsTableWrap
    .querySelectorAll(
      ".save-booking-fastag-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          await saveBookingFastag(
            button.dataset.bid,
            button
          );
        }
      );
    });

  // STATUS
  bookingsTableWrap
    .querySelectorAll(
      ".booking-status-select"
    )
    .forEach((select) => {
      select.addEventListener(
        "change",
        async () => {
          const bid =
            select.dataset.bid;

          const newStatus =
            select.value;

          const booking =
            bookingsData.find(
              (item) =>
                item.id === bid
            );

          if (!booking) {
            return;
          }

          const oldStatus =
            booking.status;

          booking.status =
            newStatus;

          try {
            await updateDoc(
              doc(
                db,
                "bookings",
                bid
              ),
              {
                status:
                  newStatus,

                updatedAt:
                  serverTimestamp(),
              }
            );

            renderBookingsTable(
              getFilteredBookings()
            );

            updateRevenueStats();

          } catch (error) {
            console.error(
              "BOOKING STATUS ERROR:",
              error
            );

            booking.status =
              oldStatus;

            select.value =
              oldStatus;

            alert(
              "Could not update booking status.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // PROCESS RETURN
  bookingsTableWrap
    .querySelectorAll(
      ".process-return-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const bid =
            button.dataset.bid;

          const booking =
            bookingsData.find(
              (item) =>
                item.id === bid
            );

          if (!booking) {
            alert(
              "Booking not found."
            );

            return;
          }

          try {
            openReturnModal({
              booking,
              currentUser,

              onSaved:
                async () => {
                  await loadBookings();
                },
            });

            /*
             * The external return-inspection.js
             * may set style.display but leave
             * the hidden attribute on the modal.
             *
             * Force it open.
             */

            setTimeout(
              () => {
                const modal =
                  $("returnModal");

                if (modal) {
                  modal.hidden =
                    false;

                  modal.removeAttribute(
                    "hidden"
                  );

                  modal.style.display =
                    "flex";
                }
              },
              50
            );

          } catch (error) {
            console.error(
              "RETURN MODAL ERROR:",
              error
            );

            alert(
              "Could not open return inspection.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // VIEW RETURN REPORT
  bookingsTableWrap
    .querySelectorAll(
      ".view-return-report-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const bid =
            button.dataset.bid;

          const booking =
            bookingsData.find(
              (item) =>
                item.id === bid
            );

          if (!booking) {
            alert(
              "Booking not found."
            );

            return;
          }

          openReturnReport(
            booking
          );
        }
      );
    });
}

// ============================================================================
// SAVE ODOMETER
// ============================================================================

async function saveBookingOdometer(
  bookingId,
  button
) {
  const startInput =
    bookingsTableWrap.querySelector(
      `.booking-start-odo[data-bid="${bookingId}"]`
    );

  const endInput =
    bookingsTableWrap.querySelector(
      `.booking-end-odo[data-bid="${bookingId}"]`
    );

  if (
    !startInput ||
    !endInput
  ) {
    alert(
      "Odometer fields could not be found."
    );

    return;
  }

  const startText =
    startInput.value.trim();

  const endText =
    endInput.value.trim();

  const start =
    startText === ""
      ? null
      : Number(startText);

  const end =
    endText === ""
      ? null
      : Number(endText);

  if (
    start !== null &&
    (
      !Number.isFinite(start) ||
      start < 0
    )
  ) {
    alert(
      "Enter a valid start odometer."
    );

    return;
  }

  if (
    end !== null &&
    (
      !Number.isFinite(end) ||
      end < 0
    )
  ) {
    alert(
      "Enter a valid end odometer."
    );

    return;
  }

  if (
    start !== null &&
    end !== null &&
    end < start
  ) {
    alert(
      "End odometer cannot be less than start odometer."
    );

    return;
  }

  const oldText =
    button.textContent;

  button.disabled =
    true;

  button.textContent =
    "Saving...";

  try {
    /*
     * Save BOTH naming formats.
     *
     * This keeps compatibility with your
     * existing booking/customer code.
     */

    await updateDoc(
      doc(
        db,
        "bookings",
        bookingId
      ),
      {
        odometerStart:
          start,

        odometerEnd:
          end,

        startOdometer:
          start,

        endOdometer:
          end,

        odometerUpdatedAt:
          serverTimestamp(),

        odometerUpdatedBy:
          currentUser
            ? currentUser.uid
            : null,
      }
    );

    const booking =
      bookingsData.find(
        (item) =>
          item.id ===
          bookingId
      );

    if (booking) {
      booking.odometerStart =
        start;

      booking.odometerEnd =
        end;

      booking.startOdometer =
        start;

      booking.endOdometer =
        end;
    }

    const distance =
      calculateDistance(
        start,
        end
      );

    const distanceEl =
      bookingsTableWrap.querySelector(
        `.booking-distance[data-bid="${bookingId}"]`
      );

    if (distanceEl) {
      distanceEl.textContent =
        distance !== null
          ? `${distance} KM`
          : "Not calculated";
    }

    button.textContent =
      "Saved";

    setTimeout(
      () => {
        button.textContent =
          oldText;

        button.disabled =
          false;
      },
      1200
    );

  } catch (error) {
    console.error(
      "ODOMETER SAVE ERROR:",
      error
    );

    button.textContent =
      oldText;

    button.disabled =
      false;

    alert(
      "Could not save odometer readings.\n\n" +
      error.message
    );
  }
}

// ============================================================================
// SAVE FASTAG BALANCES
// ============================================================================

async function saveBookingFastag(
  bookingId,
  button
) {
  const startInput =
    bookingsTableWrap.querySelector(
      `.booking-start-fastag[data-bid="${bookingId}"]`
    );

  const returnInput =
    bookingsTableWrap.querySelector(
      `.booking-return-fastag[data-bid="${bookingId}"]`
    );

  if (!startInput || !returnInput) {
    alert(
      "FASTag fields could not be found."
    );

    return;
  }

  const startText =
    startInput.value.trim();

  const returnText =
    returnInput.value.trim();

  const start =
    startText === ""
      ? null
      : Number(startText);

  const returned =
    returnText === ""
      ? null
      : Number(returnText);

  if (
    start !== null &&
    (!Number.isFinite(start) || start < 0)
  ) {
    alert(
      "Enter a valid FASTag balance at start."
    );

    return;
  }

  if (
    returned !== null &&
    (!Number.isFinite(returned) || returned < 0)
  ) {
    alert(
      "Enter a valid FASTag balance at return."
    );

    return;
  }

  const oldText =
    button.textContent;

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await updateDoc(
      doc(db, "bookings", bookingId),
      {
        fastagStart: start,
        fastagReturn: returned,
        startFastag: start,
        returnFastag: returned,
        fastagUpdatedAt:
          serverTimestamp(),
        fastagUpdatedBy:
          currentUser
            ? currentUser.uid
            : null,
      }
    );

    const booking =
      bookingsData.find(
        (item) => item.id === bookingId
      );

    if (booking) {
      booking.fastagStart = start;
      booking.fastagReturn = returned;
      booking.startFastag = start;
      booking.returnFastag = returned;
    }

    button.textContent = "Saved";

    setTimeout(
      () => {
        button.textContent = oldText;
        button.disabled = false;
      },
      1200
    );
  } catch (error) {
    console.error(
      "FASTAG SAVE ERROR:",
      error
    );

    button.textContent = oldText;
    button.disabled = false;

    alert(
      "Could not save FASTag balances.\n\n" +
      error.message
    );
  }
}

// ============================================================================
// RETURN REPORT
//
// This is intentionally separate from Process Return.
// Completed bookings use this viewer instead of trying to
// run the inspection process again.
// ============================================================================

function openReturnReport(
  booking
) {
  const inspection =
    booking.returnInspection;

  if (!inspection) {
    alert(
      "No return inspection report exists for this booking."
    );

    return;
  }

  const existing =
    document.getElementById(
      "adminReturnReportModal"
    );

  if (existing) {
    existing.remove();
  }

  const rawDeductions =
    Array.isArray(
      inspection.items
    )
      ? inspection.items
      : Array.isArray(
          inspection.deductions
        )
        ? inspection.deductions
        : [];

  const deductions = rawDeductions.filter((item) => {
    if (typeof item === "string") return true;
    return item.checked === true || item.checked === "true";
  });

  const deposit =
    Number(
      inspection.originalDeposit ??
        inspection.securityDeposit ??
        booking.securityDeposit ??
        0
    );

  const calculatedDeductions = deductions.reduce(
    (sum, item) =>
      sum +
      Number(
        item.amount ||
          item.deduction ||
          0
      ),
    0
  );

  const totalDeduction =
    Number(
      inspection.totalDeductions ??
        inspection.deductionTotal ??
        calculatedDeductions
    );

  const refund =
    Math.max(
      0,
      deposit -
        totalDeduction
    );

  const notes =
    inspection.invoiceNotes ||
    inspection.notes ||
    booking.returnNotes ||
    "No inspection notes.";

  const returnPhotoRefs =
    Array.isArray(inspection.returnPhotoMediaIds) && inspection.returnPhotoMediaIds.length
      ? inspection.returnPhotoMediaIds.map((mediaId, index) => ({
          mediaId,
          name: `Photo ${index + 1}`,
        }))
      : Array.isArray(inspection.photos)
        ? inspection.photos
        : Array.isArray(inspection.returnPhotos)
          ? inspection.returnPhotos
          : [];

  const startOdo =
    getStartOdometer(
      booking
    );

  const endOdo =
    getEndOdometer(
      booking
    );

  const distance =
    calculateDistance(
      startOdo,
      endOdo
    );

  const startFastag =
    getStartFastag(
      booking
    );

  const returnFastag =
    getReturnFastag(
      booking
    );

  let deductionHtml = "";

  if (!deductions.length) {
    deductionHtml =
      `
        <div
          style="
            padding:16px;
            color:var(--sub);
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          No damage deductions recorded.
        </div>
      `;
  } else {
    deductionHtml =
      deductions
        .map(
          (item) => `
            <div
              style="
                display:flex;
                justify-content:space-between;
                gap:20px;
                padding:12px 0;
                border-bottom:1px solid var(--line);
              "
            >
              <span>
                ${escapeHtml(
                  item.label ||
                    item.name ||
                    item.description ||
                    "Inspection item"
                )}
              </span>

              <strong
                style="
                  color:#ef476f;
                "
              >
                ${formatINR(
                  item.amount ||
                    item.deduction ||
                    0
                )}
              </strong>
            </div>
          `
        )
        .join("");
  }

  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "adminReturnReportModal";

  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:99999;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    background:rgba(0,0,0,.88);
    backdrop-filter:blur(10px);
  `;

  modal.innerHTML = `
    <div
      class="card"
      style="
        width:100%;
        max-width:700px;
        max-height:90vh;
        overflow-y:auto;
        padding:28px;
        position:relative;
      "
    >

      <button
        type="button"
        id="closeAdminReturnReport"
        style="
          position:absolute;
          top:15px;
          right:18px;
          background:none;
          border:none;
          color:var(--text);
          font-size:1.8rem;
          cursor:pointer;
        "
      >
        &times;
      </button>

      <div
        style="
          margin-bottom:20px;
        "
      >
        <span
          class="section-label"
        >
          Completed Return
        </span>

        <h2
          style="
            margin:5px 0 8px;
          "
        >
          Return Inspection Report
        </h2>

        <p
          style="
            color:var(--sub);
            margin:0;
          "
        >
          Booking #${escapeHtml(formatBookingNumber(booking))}
        </p>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(180px,1fr)
            );
          gap:12px;
          margin-bottom:20px;
        "
      >

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Customer
          </span>

          <strong>
            ${escapeHtml(
              booking.userName ||
                booking.customerName ||
                "Customer"
            )}
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Vehicle
          </span>

          <strong>
            ${escapeHtml(
              booking.vehicleName ||
                booking.carName ||
                "Vehicle"
            )}
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Start Odometer
          </span>

          <strong>
            ${
              startOdo !== ""
                ? `${escapeHtml(
                    startOdo
                  )} KM`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            End Odometer
          </span>

          <strong>
            ${
              endOdo !== ""
                ? `${escapeHtml(
                    endOdo
                  )} KM`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            FASTag at Start
          </span>

          <strong>
            ${
              startFastag !== ""
                ? `₹${escapeHtml(
                    startFastag
                  )}`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            FASTag at Return
          </span>

          <strong>
            ${
              returnFastag !== ""
                ? `₹${escapeHtml(
                    returnFastag
                  )}`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Distance Driven
          </span>

          <strong
            style="
              color:var(--accent);
            "
          >
            ${
              distance !== null
                ? `${distance} KM`
                : "—"
            }
          </strong>
        </div>

      </div>

      <h3
        style="
          margin-bottom:12px;
        "
      >
        Inspection / Deductions
      </h3>

      ${deductionHtml}

      ${
        returnPhotoRefs.length
          ? `
            <div
              style="
                margin-top:20px;
              "
            >
              <h3
                style="
                  margin-bottom:12px;
                "
              >
                Return Photos
              </h3>

              <div id="adminReturnPhotosGrid"
                style="
                  display:grid;
                  grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
                  gap:12px;
                "
              >
                <div class="manager-state">Loading return photos...</div>
              </div>
            </div>
          `
          : ""
      }

      <div
        style="
          margin-top:20px;
          padding:16px;
          border-top:1px solid var(--line);
        "
      >

        <div
          style="
            display:flex;
            justify-content:space-between;
            margin-bottom:10px;
          "
        >
          <span>
            Original Security Deposit
          </span>

          <strong>
            ${formatINR(
              deposit
            )}
          </strong>
        </div>

        <div
          style="
            display:flex;
            justify-content:space-between;
            margin-bottom:10px;
          "
        >
          <span>
            Total Deductions
          </span>

          <strong
            style="
              color:#ef476f;
            "
          >
            ${formatINR(
              totalDeduction
            )}
          </strong>
        </div>

        <div
          style="
            display:flex;
            justify-content:space-between;
            font-size:1.15rem;
            padding-top:12px;
            border-top:1px solid var(--line);
          "
        >
          <span>
            Refundable Customer Amount
          </span>

          <strong
            style="
              color:var(--accent);
            "
          >
            ${formatINR(
              refund
            )}
          </strong>
        </div>

      </div>

      <div
        style="
          margin-top:20px;
          padding:16px;
          border:1px solid var(--line);
          border-radius:10px;
        "
      >
        <span
          style="
            display:block;
            color:var(--sub);
            font-size:.75rem;
            margin-bottom:7px;
          "
        >
          Invoice / Inspection Notes
        </span>

        <div
          style="
            line-height:1.7;
          "
        >
          ${escapeHtml(
            notes
          )}
        </div>
      </div>

      <div
        style="
          display:flex;
          justify-content:flex-end;
          margin-top:22px;
        "
      >
        <button
          type="button"
          id="closeAdminReturnReportBottom"
          class="btn btn-dark"
        >
          Close Report
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(
    modal
  );

  if (returnPhotoRefs.length) {
    (async () => {
      const grid = modal.querySelector("#adminReturnPhotosGrid");
      if (!grid) return;

      const photos = await Promise.all(
        returnPhotoRefs.map(async (photo, index) => {
          try {
            if (photo.mediaId) {
              const url = await fetchMediaBlobUrl(photo.mediaId);
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
            <figure
              style="
                margin:0;
                overflow:hidden;
                border:1px solid var(--line);
                border-radius:12px;
                background:rgba(255,255,255,.02);
              "
            >
              <img
                src="${escapeHtml(photo.url)}"
                alt="${escapeHtml(photo.name || `Photo ${index + 1}`)}"
                style="display:block;width:100%;height:170px;object-fit:cover;background:#080808;"
              />
              <figcaption
                style="
                  padding:8px 10px;
                  color:var(--sub);
                  font-size:.74rem;
                  letter-spacing:.03em;
                  text-transform:uppercase;
                "
              >
                ${escapeHtml(photo.name || `Photo ${index + 1}`)}
              </figcaption>
            </figure>
          `
        )
        .join("");

      grid.innerHTML = rendered || `<div class="manager-state">No return photos available.</div>`;
    })();
  }

  const close = () => {
    modal.remove();
  };

  $("closeAdminReturnReport")
    ?.addEventListener(
      "click",
      close
    );

  $("closeAdminReturnReportBottom")
    ?.addEventListener(
      "click",
      close
    );

  modal.addEventListener(
    "click",
    (event) => {
      if (
        event.target ===
        modal
      ) {
        close();
      }
    }
  );
}

// ============================================================================
// PAYMENT
// ============================================================================

async function loadPaymentData() {
  renderPaymentsTable();
}

function renderPaymentsTable() {
  if (!paymentsTableWrap) {
    return;
  }

  const paymentRecords = bookingsData
    .filter((booking) =>
      booking.paymentStatus === "pending_verification" ||
      booking.paymentStatus === "paid" ||
      booking.paymentStatus === "advance_paid" ||
      booking.paymentStatus === "pending_payment" ||
      booking.paymentStatus === "pay_at_pickup" ||
      booking.paymentStatus === "rejected" ||
      booking.paymentRef ||
      booking.paymentScreenshotURL ||
      booking.paymentScreenshotMediaId
    )
    .sort((a, b) =>
      toMillis(b.createdAt || b.paymentVerifiedAt || b.paymentSubmittedAt) -
      toMillis(a.createdAt || a.paymentVerifiedAt || a.paymentSubmittedAt)
    );

  if (!paymentRecords.length) {
    paymentsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        No submitted or verified payment records.
      </p>`;

    return;
  }

  const totalPages = Math.max(
    1,
    Math.ceil(paymentRecords.length / ADMIN_PAYMENTS_PER_PAGE)
  );
  adminPaymentPage = Math.min(adminPaymentPage, totalPages);
  const pageStart =
    (adminPaymentPage - 1) * ADMIN_PAYMENTS_PER_PAGE;
  const pagePayments = paymentRecords.slice(
    pageStart,
    pageStart + ADMIN_PAYMENTS_PER_PAGE
  );

  let html = `
    <div style="width:100%;overflow-x:auto;">

      <table
        class="admin-table"
        style="
          width:100%;
          min-width:900px;
          border-collapse:collapse;
          text-align:left;
        "
      >

        <thead>
          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >

            <th style="padding:12px;">
              Booking
            </th>

            <th style="padding:12px;">
              Customer
            </th>

            <th style="padding:12px;">
              Vehicle
            </th>

            <th style="padding:12px;">
              Amount
            </th>

            <th style="padding:12px;">
              Reference
            </th>

            <th style="padding:12px;">
              Status
            </th>

            <th
              style="
                padding:12px;
                text-align:right;
              "
            >
              Action
            </th>

          </tr>
        </thead>

        <tbody>
  `;

  pagePayments.forEach(
    (booking) => {
      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
          "
        >

          <td
            style="
              padding:12px;
              font-family:monospace;
            "
          >
            #${escapeHtml(
              booking.id.slice(
                -8
              )
            )}
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              booking.userName ||
                "Customer"
            )}
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              booking.vehicleName ||
                "Vehicle"
            )}
          </td>

          <td
            style="
              padding:12px;
              color:var(--accent);
              font-weight:700;
            "
          >
            ${formatINR(booking.paymentAmountPaid || booking.paymentAmount || booking.totalAmount)}
            ${booking.paymentPlan === "advance" ? `<small style="display:block;color:var(--sub);font-weight:500;margin-top:3px;">Balance: ${formatINR(booking.remainingBalance || 0)}</small>` : ""}
          </td>

          <td
            style="
              padding:12px;
              font-family:monospace;
            "
          >
            ${escapeHtml(
              booking.paymentRef ||
                "—"
            )}
          </td>

          <td style="padding:12px;">
            <span class="fleet-status ${booking.paymentStatus === "paid" || booking.paymentStatus === "advance_paid" ? "verified" : "pending"}">
              ${booking.paymentStatus === "paid" ? "Paid in Full" : booking.paymentStatus === "advance_paid" ? "Advance Paid" : "Pending Review"}
            </span>
          </td>

          <td
            style="
              padding:12px;
              text-align:right;
              white-space:nowrap;
            "
          >
            ${booking.paymentStatus === "pending_verification"
              ? `<button type="button" class="btn btn-dark review-payment-btn" data-bid="${escapeHtml(booking.id)}" style="padding:6px 12px;font-size:.8rem;">Review</button>`
              : `<button type="button" class="btn btn-outline edit-invoice-btn" data-bid="${escapeHtml(booking.id)}" style="padding:6px 12px;font-size:.8rem;">Edit / Send Invoice</button>`}
          </td>

        </tr>
      `;
    }
  );

  html += `
        </tbody>
      </table>

    </div>
    ${renderAdminPagination({
      page: adminPaymentPage,
      totalPages,
      totalItems: paymentRecords.length,
      type: "payments"
    })}
  `;

  paymentsTableWrap.innerHTML =
    html;

  paymentsTableWrap
    .querySelectorAll(
      ".review-payment-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const booking =
            bookingsData.find(
              (item) =>
                item.id ===
                button.dataset.bid
            );

          if (booking) {
            openPaymentModal(
              booking
            );
          }
        }
      );
    });

  paymentsTableWrap.querySelectorAll(".edit-invoice-btn, .send-invoice-btn").forEach((button) => {
    button.addEventListener("click", () => openInvoiceEditorModal(button.dataset.bid, button));
  });

  paymentsTableWrap
    .querySelectorAll("[data-admin-payment-page-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        adminPaymentPage +=
          button.dataset.adminPaymentPageAction === "next" ? 1 : -1;
        renderPaymentsTable();
        paymentsTableWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
}

async function convertBookingToFullPayment(bookingId, triggerBtn) {
  // Open the invoice editor with full paid pre-selected so admin can specify payment mode and reference
  await openInvoiceEditorModal(bookingId, triggerBtn);
  const fullPaidCheck = $("adminInvFullPaidCheck");
  if (fullPaidCheck) {
    fullPaidCheck.checked = true;
    fullPaidCheck.dispatchEvent(new Event("change"));
  }
  const refInput = $("adminInvPaymentRef");
  if (refInput) {
    refInput.focus();
  }
  const statusEl = $("adminInvoiceModalStatus");
  if (statusEl) {
    statusEl.textContent = "⚡ Converted to Full Payment! Select Payment Mode, enter Reference ID, then click Save or Send.";
    statusEl.className = "form-status is-success";
  }
}

let currentEditingInvoice = null;

function recalculateInvoiceModalTotals() {
  const rental = Number($("adminInvRental")?.value || 0);
  const driver = Number($("adminInvDriver")?.value || 0);
  const extraKm = Number($("adminInvExtraKm")?.value || 0);
  const lateFee = Number($("adminInvLateFee")?.value || 0);
  const fuel = Number($("adminInvFuel")?.value || 0);
  const damage = Number($("adminInvDamage")?.value || 0);
  const discount = Number($("adminInvDiscount")?.value || 0);
  const taxRate = Number($("adminInvTaxRate")?.value || 0);

  const subtotal = Math.max(0, rental + driver + extraKm + lateFee + fuel + damage - discount);
  const tax = Math.round((subtotal * taxRate) / 100);
  const total = subtotal + tax;

  const fullPaidCheck = $("adminInvFullPaidCheck");
  const amountPaidInput = $("adminInvAmountPaid");

  let paid = Number(amountPaidInput?.value || 0);
  if (fullPaidCheck?.checked && paid < total) {
    paid = total;
    if (amountPaidInput) amountPaidInput.value = total;
  }
  const balance = Math.max(0, total - paid);

  if ($("adminInvSubtotal")) $("adminInvSubtotal").textContent = formatINR(subtotal);
  if ($("adminInvTax")) $("adminInvTax").textContent = formatINR(tax);
  if ($("adminInvTotal")) $("adminInvTotal").textContent = formatINR(total);
  if ($("adminInvPaid")) $("adminInvPaid").textContent = formatINR(paid);
  if ($("adminInvBalance")) $("adminInvBalance").textContent = formatINR(balance);

  return { subtotal, tax, total, paid, balance };
}

async function openInvoiceEditorModal(bookingId, triggerBtn) {
  const statusEl = $("adminInvoiceModalStatus");
  if (statusEl) {
    statusEl.textContent = "Loading invoice data…";
    statusEl.className = "form-status is-loading";
  }

  showModal("adminInvoiceModal");

  try {
    const apiBase = window.MEDIA_API_URL || "http://localhost:4001";
    const response = await fetch(`${apiBase}/api/invoices/payment-approved/${encodeURIComponent(bookingId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await mediaAuthHeaders()),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || `Server responded with status ${response.status}`);
    }

    currentEditingInvoice = data.invoice;
    const inv = data.invoice;
    const booking = bookingsData.find((item) => item.id === bookingId) || {};

    if ($("adminInvoiceModalNumber")) {
      $("adminInvoiceModalNumber").textContent = inv.invoiceNumber || inv.invoiceId || "";
    }
    if ($("adminInvCustomerName")) $("adminInvCustomerName").value = inv.customer?.name || "";
    if ($("adminInvCustomerEmail")) $("adminInvCustomerEmail").value = inv.customer?.email || "";
    if ($("adminInvVehicleName")) $("adminInvVehicleName").value = inv.vehicle?.name || "";
    let regVal = inv.vehicle?.registration || booking.vehicleReg || booking.registration || "";
    if (typeof regVal === "string" && (regVal.toUpperCase().startsWith("ZIP") || regVal.toUpperCase() === "ZIP001")) {
      regVal = "";
    }
    if ($("adminInvVehicleReg")) $("adminInvVehicleReg").value = regVal;

    const c = inv.charges || {};
    if ($("adminInvRental")) $("adminInvRental").value = c.rental || 0;
    if ($("adminInvDriver")) $("adminInvDriver").value = c.driver || 0;
    if ($("adminInvExtraKm")) $("adminInvExtraKm").value = c.extraKm || 0;
    if ($("adminInvLateFee")) $("adminInvLateFee").value = c.lateFee || 0;
    if ($("adminInvFuel")) $("adminInvFuel").value = c.fuel || 0;
    if ($("adminInvDamage")) $("adminInvDamage").value = Number(c.damage || 0) + Number(c.cleaning || 0);
    if ($("adminInvDiscount")) $("adminInvDiscount").value = c.discount || 0;
    if ($("adminInvTaxRate")) $("adminInvTaxRate").value = inv.taxRate ?? 0;
    if ($("adminInvNotes")) $("adminInvNotes").value = inv.notes || "";

    const pay = inv.payment || {};
    if ($("adminInvPaymentMode")) $("adminInvPaymentMode").value = pay.mode || booking.paymentMode || "UPI";
    if ($("adminInvPaymentRef")) $("adminInvPaymentRef").value = pay.reference || booking.paymentRef || "";

    const isFull = inv.paymentPlan === "full" || inv.paymentStatus === "paid" || inv.balanceDue === 0;
    if ($("adminInvFullPaidCheck")) $("adminInvFullPaidCheck").checked = isFull;
    if (currentEditingInvoice) {
      currentEditingInvoice.isFullPaid = isFull;
      currentEditingInvoice.originalAmountPaid = inv.amountPaid || booking.paymentAmountPaid || booking.advanceAmount || 0;
    }
    if ($("adminInvAmountPaid")) {
      $("adminInvAmountPaid").value = isFull ? (inv.total || inv.subtotal || 0) : (inv.amountPaid || booking.paymentAmountPaid || booking.advanceAmount || 0);
    }

    recalculateInvoiceModalTotals();

    if (statusEl) {
      statusEl.textContent = data.emailSent
        ? "✓ Invoice loaded. Sent to customer."
        : "✓ Invoice loaded. Edit line items, payment mode, preview PDF, or send to customer.";
      statusEl.className = "form-status is-success";
    }
  } catch (error) {
    console.error("LOAD INVOICE ERROR:", error);
    if (statusEl) {
      statusEl.textContent = `Could not load invoice: ${error.message}`;
      statusEl.className = "form-status is-error";
    }
  }
}

function initialiseInvoiceEditorModal() {
  const close = $("closeAdminInvoiceModal");
  if (close) {
    close.addEventListener("click", () => hideModal("adminInvoiceModal"));
  }

  document.querySelectorAll(".inv-calc-field").forEach((input) => {
    input.addEventListener("input", recalculateInvoiceModalTotals);
  });

  const fullPaidCheck = $("adminInvFullPaidCheck");
  const amountPaidInput = $("adminInvAmountPaid");

  if (fullPaidCheck) {
    fullPaidCheck.addEventListener("change", () => {
      if (!currentEditingInvoice) return;
      currentEditingInvoice.isFullPaid = fullPaidCheck.checked;
      if (fullPaidCheck.checked) {
        const rental = Number($("adminInvRental")?.value || 0);
        const driver = Number($("adminInvDriver")?.value || 0);
        const extraKm = Number($("adminInvExtraKm")?.value || 0);
        const lateFee = Number($("adminInvLateFee")?.value || 0);
        const fuel = Number($("adminInvFuel")?.value || 0);
        const damage = Number($("adminInvDamage")?.value || 0);
        const discount = Number($("adminInvDiscount")?.value || 0);
        const taxRate = Number($("adminInvTaxRate")?.value || 0);
        const subtotal = Math.max(0, rental + driver + extraKm + lateFee + fuel + damage - discount);
        const total = subtotal + Math.round((subtotal * taxRate) / 100);
        if (amountPaidInput) amountPaidInput.value = total;
      } else {
        if (amountPaidInput) amountPaidInput.value = currentEditingInvoice.originalAmountPaid || 0;
      }
      recalculateInvoiceModalTotals();
    });
  }

  if (amountPaidInput) {
    amountPaidInput.addEventListener("input", () => {
      const rental = Number($("adminInvRental")?.value || 0);
      const driver = Number($("adminInvDriver")?.value || 0);
      const extraKm = Number($("adminInvExtraKm")?.value || 0);
      const lateFee = Number($("adminInvLateFee")?.value || 0);
      const fuel = Number($("adminInvFuel")?.value || 0);
      const damage = Number($("adminInvDamage")?.value || 0);
      const discount = Number($("adminInvDiscount")?.value || 0);
      const taxRate = Number($("adminInvTaxRate")?.value || 0);
      const subtotal = Math.max(0, rental + driver + extraKm + lateFee + fuel + damage - discount);
      const total = subtotal + Math.round((subtotal * taxRate) / 100);
      const currentPaid = Number(amountPaidInput.value || 0);
      if (fullPaidCheck) {
        fullPaidCheck.checked = (currentPaid >= total && total > 0);
      }
      recalculateInvoiceModalTotals();
    });
  }

  const previewBtn = $("adminInvPreviewBtn");
  if (previewBtn) {
    previewBtn.addEventListener("click", async () => {
      if (!currentEditingInvoice) return;
      const statusEl = $("adminInvoiceModalStatus");
      try {
        previewBtn.disabled = true;
        previewBtn.textContent = "Generating PDF…";
        const apiBase = window.MEDIA_API_URL || "http://localhost:4001";

        // Sync latest form inputs to backend before opening PDF preview
        const rental = Number($("adminInvRental")?.value || 0);
        const driver = Number($("adminInvDriver")?.value || 0);
        const extraKm = Number($("adminInvExtraKm")?.value || 0);
        const lateFee = Number($("adminInvLateFee")?.value || 0);
        const fuel = Number($("adminInvFuel")?.value || 0);
        const damage = Number($("adminInvDamage")?.value || 0);
        const discount = Number($("adminInvDiscount")?.value || 0);
        const taxRate = Number($("adminInvTaxRate")?.value || 0);
        const isFull = $("adminInvFullPaidCheck")?.checked;
        const amountPaid = Number($("adminInvAmountPaid")?.value || 0);

        const payload = {
          customer: {
            name: $("adminInvCustomerName")?.value.trim() || currentEditingInvoice.customer?.name || "",
            email: $("adminInvCustomerEmail")?.value.trim() || currentEditingInvoice.customer?.email || "",
            phone: currentEditingInvoice.customer?.phone || "",
            address: currentEditingInvoice.customer?.address || "",
          },
          vehicle: {
            name: $("adminInvVehicleName")?.value.trim() || currentEditingInvoice.vehicle?.name || "",
            registration: $("adminInvVehicleReg")?.value.trim() || "",
            category: currentEditingInvoice.vehicle?.category || "",
          },
          charges: { rental, driver, extraKm, lateFee, fuel, damage, discount },
          taxRate,
          notes: $("adminInvNotes")?.value.trim() || "",
          amountPaid,
          paymentMode: $("adminInvPaymentMode")?.value || "UPI",
          paymentRef: $("adminInvPaymentRef")?.value || "",
          paymentPlan: isFull ? "full" : (currentEditingInvoice.paymentPlan || "advance"),
          paymentStatus: isFull ? "paid" : (currentEditingInvoice.paymentStatus || "advance_paid"),
        };

        await fetch(`${apiBase}/api/invoices/${encodeURIComponent(currentEditingInvoice.invoiceId)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(await mediaAuthHeaders()),
          },
          body: JSON.stringify(payload),
        });

        const res = await fetch(`${apiBase}/api/invoices/${encodeURIComponent(currentEditingInvoice.invoiceId)}/pdf?refresh=true`, {
          headers: await mediaAuthHeaders(),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.message || d.error || "Could not load invoice PDF.");
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `PDF Preview error: ${err.message}`;
          statusEl.className = "form-status is-error";
        }
      } finally {
        previewBtn.disabled = false;
        previewBtn.textContent = "📄 Preview PDF";
      }
    });
  }

  const saveBtn = $("adminInvSaveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      if (!currentEditingInvoice) return;
      const statusEl = $("adminInvoiceModalStatus");
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";
        if (statusEl) {
          statusEl.textContent = "Saving changes & regenerating PDF…";
          statusEl.className = "form-status is-loading";
        }

        const totalsData = recalculateInvoiceModalTotals();
        const isFull = (totalsData.balance === 0 || $("adminInvFullPaidCheck")?.checked);

        const payload = {
          customer: {
            ...currentEditingInvoice.customer,
            name: $("adminInvCustomerName")?.value || "",
            email: $("adminInvCustomerEmail")?.value || "",
          },
          vehicle: {
            ...currentEditingInvoice.vehicle,
            name: $("adminInvVehicleName")?.value || "",
            registration: $("adminInvVehicleReg")?.value || "",
          },
          charges: {
            ...currentEditingInvoice.charges,
            rental: Number($("adminInvRental")?.value || 0),
            driver: Number($("adminInvDriver")?.value || 0),
            extraKm: Number($("adminInvExtraKm")?.value || 0),
            lateFee: Number($("adminInvLateFee")?.value || 0),
            fuel: Number($("adminInvFuel")?.value || 0),
            damage: Number($("adminInvDamage")?.value || 0),
            discount: Number($("adminInvDiscount")?.value || 0),
          },
          taxRate: Number($("adminInvTaxRate")?.value || 0),
          notes: $("adminInvNotes")?.value || "",
          amountPaid: totalsData.paid,
          paymentMode: $("adminInvPaymentMode")?.value || "UPI",
          paymentRef: $("adminInvPaymentRef")?.value || "",
          paymentPlan: isFull ? "full" : (currentEditingInvoice.paymentPlan || "advance"),
          paymentStatus: isFull ? "paid" : (currentEditingInvoice.paymentStatus || "advance_paid"),
        };

        const apiBase = window.MEDIA_API_URL || "http://localhost:4001";
        const res = await fetch(`${apiBase}/api/invoices/${encodeURIComponent(currentEditingInvoice.invoiceId)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(await mediaAuthHeaders()),
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || "Save failed");

        currentEditingInvoice = data.invoice;
        recalculateInvoiceModalTotals();
        renderPaymentsTable();
        updateRevenueStats();

        if (statusEl) {
          statusEl.textContent = "✓ Invoice saved & PDF updated successfully!";
          statusEl.className = "form-status is-success";
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `Save error: ${err.message}`;
          statusEl.className = "form-status is-error";
        }
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "💾 Save Changes";
      }
    });
  }

  const sendBtn = $("adminInvSendBtn");
  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      if (!currentEditingInvoice) return;
      const statusEl = $("adminInvoiceModalStatus");
      try {
        sendBtn.disabled = true;
        sendBtn.textContent = "Sending Email…";
        if (statusEl) {
          statusEl.textContent = "Saving latest edits & sending email…";
          statusEl.className = "form-status is-loading";
        }

        const totalsData = recalculateInvoiceModalTotals();
        const isFull = (totalsData.balance === 0 || $("adminInvFullPaidCheck")?.checked);

        const payload = {
          customer: {
            ...currentEditingInvoice.customer,
            name: $("adminInvCustomerName")?.value || "",
            email: $("adminInvCustomerEmail")?.value || "",
          },
          vehicle: {
            ...currentEditingInvoice.vehicle,
            name: $("adminInvVehicleName")?.value || "",
            registration: $("adminInvVehicleReg")?.value || "",
          },
          charges: {
            ...currentEditingInvoice.charges,
            rental: Number($("adminInvRental")?.value || 0),
            driver: Number($("adminInvDriver")?.value || 0),
            extraKm: Number($("adminInvExtraKm")?.value || 0),
            lateFee: Number($("adminInvLateFee")?.value || 0),
            fuel: Number($("adminInvFuel")?.value || 0),
            damage: Number($("adminInvDamage")?.value || 0),
            discount: Number($("adminInvDiscount")?.value || 0),
          },
          taxRate: Number($("adminInvTaxRate")?.value || 0),
          notes: $("adminInvNotes")?.value || "",
          amountPaid: totalsData.paid,
          paymentMode: $("adminInvPaymentMode")?.value || "UPI",
          paymentRef: $("adminInvPaymentRef")?.value || "",
          paymentPlan: isFull ? "full" : (currentEditingInvoice.paymentPlan || "advance"),
          paymentStatus: isFull ? "paid" : (currentEditingInvoice.paymentStatus || "advance_paid"),
        };

        const apiBase = window.MEDIA_API_URL || "http://localhost:4001";
        await fetch(`${apiBase}/api/invoices/${encodeURIComponent(currentEditingInvoice.invoiceId)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(await mediaAuthHeaders()),
          },
          body: JSON.stringify(payload),
        });

        const sendRes = await fetch(`${apiBase}/api/invoices/${encodeURIComponent(currentEditingInvoice.invoiceId)}/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await mediaAuthHeaders()),
          },
          body: JSON.stringify({ email: payload.customer.email }),
        });

        const sendData = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) throw new Error(sendData.message || sendData.error || "Email send failed");

        renderPaymentsTable();
        updateRevenueStats();

        if (statusEl) {
          statusEl.textContent = `✓ Invoice successfully sent to ${payload.customer.email}!`;
          statusEl.className = "form-status is-success";
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `Send error: ${err.message}`;
          statusEl.className = "form-status is-error";
          statusEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        alert(`Email Send Notice:\n\n${err.message}`);
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "✉️ Send to Customer Email";
      }
    });
  }
}

function initialisePaymentModal() {
  const close =
    $("closePaymentModal");

  if (close) {
    close.addEventListener(
      "click",
      () => {
        hideModal(
          "paymentModal"
        );
      }
    );
  }

  const approve =
    $("approvePaymentBtn");

  if (approve) {
    approve.addEventListener(
      "click",
      async () => {
        if (
          !activePaymentBooking
        ) {
          return;
        }

        try {
          approve.disabled =
            true;

          approve.textContent =
            "Approving...";

          const isAdvancePayment = activePaymentBooking.paymentPlan === "advance";

          await updateDoc(
            doc(
              db,
              "bookings",
              activePaymentBooking.id
            ),
            {
              paymentStatus:
                isAdvancePayment ? "advance_paid" : "paid",

              status:
                "confirmed",

              paymentVerifiedAt:
                serverTimestamp(),

              paymentVerifiedBy:
                currentUser
                  ? currentUser.uid
                  : null,
            }
          );

          activePaymentBooking.paymentStatus =
            isAdvancePayment ? "advance_paid" : "paid";

          activePaymentBooking.status =
            "confirmed";

          hideModal(
            "paymentModal"
          );

          renderBookingsTable(
            getFilteredBookings()
          );

          renderPaymentsTable();

          updateRevenueStats();

        } catch (error) {
          console.error(
            "PAYMENT APPROVAL ERROR:",
            error
          );

          alert(
            "Could not approve payment.\n\n" +
            error.message
          );

        } finally {
          approve.disabled =
            false;

          approve.textContent =
            "Approve & Confirm Booking";
        }
      }
    );
  }

  const reject =
    $("rejectPaymentBtn");

  if (reject) {
    reject.addEventListener(
      "click",
      async () => {
        if (
          !activePaymentBooking
        ) {
          return;
        }

        const reason =
          prompt(
            "Reason for rejecting this payment:"
          );

        if (
          reason ===
          null
        ) {
          return;
        }

        try {
          await updateDoc(
            doc(
              db,
              "bookings",
              activePaymentBooking.id
            ),
            {
              paymentStatus:
                "rejected",

              paymentRejectionReason:
                reason ||
                "Payment could not be verified.",
            }
          );

          activePaymentBooking.paymentStatus =
            "rejected";

          hideModal(
            "paymentModal"
          );

          renderPaymentsTable();

          renderBookingsTable(
            getFilteredBookings()
          );

        } catch (error) {
          console.error(
            "PAYMENT REJECTION ERROR:",
            error
          );

          alert(
            "Could not reject payment.\n\n" +
            error.message
          );
        }
      }
    );
  }
}

async function openPaymentModal(
  booking
) {
  if (activePaymentScreenshotObjectUrl) {
    URL.revokeObjectURL(
      activePaymentScreenshotObjectUrl
    );
    activePaymentScreenshotObjectUrl = null;
  }

  activePaymentBooking =
    booking;

  const title =
    $("paymentModalTitle");

  if (title) {
    title.textContent =
      `Booking #${formatBookingNumber(booking)}`;
  }

  const screenshotSrc =
    booking.paymentScreenshotDataUrl ||
    booking.paymentScreenshotURL ||
    booking.paymentScreenshotUrl ||
    booking.screenshotUrl ||
    booking.screenshotURL ||
    (typeof booking.paymentScreenshot === "string" ? booking.paymentScreenshot : null);

  const body =
    $("paymentModalBody");

  if (body) {
    body.innerHTML = `
      <div
        style="
          display:grid;
          gap:12px;
        "
      >

        <div class="booking-summary__row">
          <span>Customer</span>
          <strong>
            ${escapeHtml(
              booking.userName ||
                "Customer"
            )}
          </strong>
        </div>

        <div class="booking-summary__row">
          <span>Vehicle</span>
          <strong>
            ${escapeHtml(
              booking.vehicleName ||
                "Vehicle"
            )}
          </strong>
        </div>

        <div class="booking-summary__row">
          <span>Amount</span>
          <strong>
            ${formatINR(
              booking.totalAmount
            )}
          </strong>
        </div>

        <div class="booking-summary__row">
          <span>Method</span>
          <strong>
            ${escapeHtml(
              booking.paymentMethod ||
                "UPI"
            )}
          </strong>
        </div>

        <div class="booking-summary__row">
          <span>Reference</span>
          <strong
            style="
              font-family:monospace;
            "
          >
            ${escapeHtml(
              booking.paymentRef ||
                "—"
            )}
          </strong>
        </div>

        ${
          screenshotSrc
            ? `
              <img
                src="${escapeHtml(
                  screenshotSrc
                )}"
                alt="Payment screenshot"
                style="
                  width:100%;
                  max-height:400px;
                  object-fit:contain;
                  border-radius:10px;
                  background:#000;
                margin-top:10px;
                "
              />
            `
            : booking.paymentScreenshotMediaId
              ? `
                <div
                  id="paymentScreenshotPreview"
                  style="
                    min-height:120px;
                    display:grid;
                    place-items:center;
                    color:var(--sub);
                    border:1px solid var(--line);
                    border-radius:10px;
                    margin-top:10px;
                  "
                >
                  Loading payment screenshot...
                </div>
              `
            : `
              <p
                style="
                  color:var(--sub);
                "
              >
                No payment screenshot uploaded.
              </p>
            `
        }

      </div>
    `;
  }

  showModal(
    "paymentModal"
  );

  if (
    booking.paymentScreenshotMediaId &&
    !screenshotSrc
  ) {
    const preview =
      $("paymentScreenshotPreview");

    try {
      const objectUrl =
        await fetchMediaBlobUrl(
          booking.paymentScreenshotMediaId
        );

      if (
        activePaymentBooking !== booking ||
        !preview?.isConnected
      ) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      activePaymentScreenshotObjectUrl =
        objectUrl;

      preview.innerHTML = `
        <img
          src="${escapeHtml(objectUrl)}"
          alt="Payment screenshot"
          style="
            width:100%;
            max-height:400px;
            object-fit:contain;
            border-radius:10px;
            background:#000;
          "
        />
      `;
    } catch (error) {
      console.error(
        "PAYMENT SCREENSHOT LOAD ERROR:",
        error
      );

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

// ============================================================================
// REVENUE
// ============================================================================

function getBookingCollectedAmount(booking) {
  if (booking.paymentStatus === "advance_paid") {
    return Number(booking.advanceAmount || booking.paymentAmountPaid || booking.paymentAmount || 500);
  }
  if (booking.paymentStatus === "paid") {
    return Number(booking.finalAmount || booking.totalAmount || booking.paymentAmountPaid || booking.paymentAmount || booking.rentalTotal || 0);
  }
  return Number(booking.paymentAmountPaid || booking.paymentAmount || 0);
}

function updateRevenueStats() {
  const paid =
    bookingsData.filter(
      (booking) =>
        booking.paymentStatus === "paid" ||
        booking.paymentStatus === "advance_paid"
    );

  const totalRevenue =
    paid.reduce(
      (sum, booking) =>
        sum + getBookingCollectedAmount(booking),
      0
    );

  const now =
    new Date();

  const monthlyRevenue =
    paid
      .filter((booking) => {
        const date =
          parseDateOnly(
            booking.paymentVerifiedAt
          ) ||
          parseDateOnly(
            booking.createdAt
          ) ||
          parseDateOnly(
            booking.bookingDate
          ) ||
          parseDateOnly(
            booking.pickupDate
          );

        return (
          date &&
          date.getFullYear() ===
            now.getFullYear() &&
          date.getMonth() ===
            now.getMonth()
        );
      })
      .reduce(
        (sum, booking) =>
          sum + getBookingCollectedAmount(booking),
        0
      );

  const pendingPayments =
    bookingsData.filter(
      (booking) =>
        booking.paymentStatus === "pending_verification" ||
        (booking.paymentRef && booking.paymentStatus !== "paid" && booking.paymentStatus !== "advance_paid" && booking.paymentStatus !== "rejected")
    ).length;

  // Keep the average aligned with the verified revenue cards.
  // Pending, rejected and unpaid bookings must not dilute this KPI.
  const average =
    paid.length
      ? totalRevenue / paid.length
      : 0;

  const totalRevenueEl =
    $("statTotalRevenue");

  if (totalRevenueEl) {
    totalRevenueEl.textContent =
      formatINR(
        totalRevenue
      );
  }

  const monthlyEl =
    $("statMonthRevenue");

  if (monthlyEl) {
    monthlyEl.textContent =
      formatINR(
        monthlyRevenue
      );
  }

  const pendingEl =
    $("statPendingPayments");

  if (pendingEl) {
    pendingEl.textContent =
      pendingPayments;
  }

  const paidBookingsEl =
    $("statPaidBookings");

  if (paidBookingsEl) {
    paidBookingsEl.textContent =
      paid.length;
  }

  const averageEl =
    $("statAvgBooking");

  if (averageEl) {
    averageEl.textContent =
      formatINR(
        average
      );
  }

  const badge =
    $("paymentsTabBadge");

  if (badge) {
    if (
      pendingPayments >
      0
    ) {
      badge.hidden =
        false;

      badge.textContent =
        pendingPayments;
    } else {
      badge.hidden =
        true;
    }
  }
}

// ============================================================================
// HOST CAR MEDIA (Node/SQLite media server)
//
// Host car photos now live in the local media server (SQLite metadata +
// disk storage) instead of Firebase Storage, uploaded with:
//   category   = "partner_car_photo"
//   related_id = the host car's Firestore doc id
//
// /api/media requires a Firebase ID token on every request (server verifies
// it the same way profile.js does) — so every call below attaches
// Authorization: Bearer <token> from the signed-in admin.
//
// A partner_cars document may still have an old `photos` array from before
// this migration (public Firebase Storage URLs) — those are rendered
// directly, no auth needed. New, server-hosted photos are private, so each
// one is fetched as a Blob and turned into a temporary object URL, same
// pattern as profile.js's getPrivateMediaBlobUrl().
// ============================================================================

const MEDIA_SERVER_URL = "http://localhost:4001"; // same server profile.js talks to — point this at your real host before deploying

const hostPhotoCache = new Map(); // carId -> loaded [{ id, mimeType, originalName, blobUrl }]

async function mediaAuthHeaders() {
  if (!currentUser) return {};
  const token = await currentUser.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

// The uploader of a given photo could be the host who submitted the car
// (their own Firebase uid) or an admin who added/replaced a photo from this
// dashboard (the admin's own uid) — the media server only lets you filter by
// one user_id per request, so we query both and merge by media id.
//
// If your partner_cars documents store the owner's Firebase uid under a
// different field name than the ones checked here, add it to this list.
function getHostCarOwnerUid(car) {
  return (
    car.ownerUid ||
    car.ownerId ||
    car.uid ||
    car.userId ||
    car.partnerUid ||
    car.hostUid ||
    null
  );
}

async function fetchHostCarMedia(car) {
  const relatedId = car.id;
  const ownerUid = getHostCarOwnerUid(car);
  const headers = await mediaAuthHeaders();

  const urls = [
    `${MEDIA_SERVER_URL}/api/media?category=partner_car_photo&relatedId=${encodeURIComponent(relatedId)}`,
  ];

  if (ownerUid && ownerUid !== currentUser?.uid) {
    urls.push(
      `${MEDIA_SERVER_URL}/api/media?category=partner_car_photo&relatedId=${encodeURIComponent(
        relatedId
      )}&userId=${encodeURIComponent(ownerUid)}`
    );
  }

  const seen = new Map();

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(`HOST CAR MEDIA FETCH FAILED (${response.status}):`, url);
        continue;
      }

      const rows = await response.json();

      (Array.isArray(rows) ? rows : []).forEach((row) => seen.set(row.id, row));
    } catch (error) {
      console.warn("HOST CAR MEDIA FETCH ERROR:", error);
    }
  }

  return [...seen.values()];
}

async function fetchMediaBlobUrl(mediaId) {
  const headers = await mediaAuthHeaders();

  const response = await fetch(
    `${MEDIA_SERVER_URL}/api/media/file/${encodeURIComponent(mediaId)}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Could not load photo (${response.status}).`);
  }

  const blob = await response.blob();

  return URL.createObjectURL(blob);
}

// Loads + caches the server-hosted photos for one car. Cheap on repeat
// toggles — only hits the network the first time a car's photo row is
// opened, or after invalidateHostPhotoCache() runs post upload/delete.
async function loadHostPhotosIntoCache(car) {
  if (hostPhotoCache.has(car.id)) {
    return hostPhotoCache.get(car.id);
  }

  const records = await fetchHostCarMedia(car);

  const withBlobUrls = await Promise.all(
    records.map(async (record) => {
      try {
        const blobUrl = await fetchMediaBlobUrl(record.id);
        return { ...record, blobUrl };
      } catch (error) {
        console.warn(`Could not load photo ${record.id}:`, error);
        return null;
      }
    })
  );

  const loaded = withBlobUrls.filter(Boolean);

  hostPhotoCache.set(car.id, loaded);

  return loaded;
}

function invalidateHostPhotoCache(carId) {
  const cached = hostPhotoCache.get(carId);

  if (cached) {
    cached.forEach((item) => {
      if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
    });
  }

  hostPhotoCache.delete(carId);
}

// ============================================================================
// HOST CARS
// ============================================================================

async function loadHostCars() {
  if (hostCarsTableWrap) {
    hostCarsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading host listings...
      </p>`;
  }

  try {
    const snapshot =
      await getDocs(
        collection(
          db,
          "partner_cars"
        )
      );

    hostCarsData =
      snapshot.docs.map(
        (item) => ({
          id: item.id,
          ...item.data(),
        })
      );

    hostCarsData.sort(
      (a, b) =>
        toMillis(b.createdAt) - toMillis(a.createdAt)
    );

    const pending =
      hostCarsData.filter(
        (car) =>
          car.status ===
          "pending_approval"
      ).length;

    const pendingEl =
      $("statPendingHosts");

    if (pendingEl) {
      pendingEl.textContent =
        pending;
    }

    renderHostCarsTable(
      hostCarsData
    );

  } catch (error) {
    console.error(
      "HOST CAR LOAD ERROR:",
      error
    );

    if (hostCarsTableWrap) {
      hostCarsTableWrap.innerHTML =
        `<p style="color:#ef476f;">
          Failed to load host listings.
        </p>

        <small style="color:var(--sub);">
          ${escapeHtml(
            error.message
          )}
        </small>`;
    }
  }
}

// Server-hosted photos are private and fetched lazily (only once a car's
// photo row is actually opened), so the row starts out showing just the
// legacy Firestore `photos` array (if any) plus a loading line, and the
// toggle button's count is a "so far" hint until it's been opened once.
function renderHostCarsTable(
  cars
) {
  if (!hostCarsTableWrap) {
    return;
  }

  if (!cars.length) {
    hostCarsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        No host vehicle listings submitted yet.
      </p>`;

    return;
  }

  let html = `
    <div style="width:100%;overflow-x:auto;">

      <table
        class="admin-table"
        style="
          width:100%;
          min-width:820px;
          border-collapse:collapse;
          text-align:left;
        "
      >

        <thead>
          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >

            <th style="padding:12px;">
              Vehicle
            </th>

            <th style="padding:12px;">
              Owner
            </th>

            <th style="padding:12px;">
              Status
            </th>

            <th
              style="
                padding:12px;
                text-align:right;
              "
            >
              Action
            </th>

          </tr>
        </thead>

        <tbody>
  `;

  cars.forEach(
    (car) => {
      const legacyPhotos =
        Array.isArray(
          car.photos
        )
          ? car.photos
          : [];

      const cachedServerPhotos =
        hostPhotoCache.get(
          car.id
        ) || [];

      const knownPhotoCount =
        legacyPhotos.length +
        Math.max(
          cachedServerPhotos.length,
          Array.isArray(car.photoMediaIds) ? car.photoMediaIds.length : 0
        );

      const detailsRow =
        `host-details-${car.id}`;

      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
          "
        >

          <td style="padding:12px;">
            <strong>
              ${escapeHtml(
                car.brand ||
                  ""
              )}
              ${escapeHtml(
                car.model ||
                  ""
              )}
            </strong>

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.8rem;
              "
            >
              ${escapeHtml(
                car.location ||
                  "—"
              )}
            </span>
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              car.ownerName ||
                "—"
            )}

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.8rem;
              "
            >
              ${escapeHtml(
                car.ownerPhone ||
                  "—"
              )}
            </span>
          </td>

          <td style="padding:12px;">
            <span
              class="fleet-status ${getStatusClass(
                car.status
              )}"
            >
              ${escapeHtml(
                car.status ||
                  "unknown"
              )}
            </span>
          </td>

          <td
            style="
              padding:12px;
              text-align:right;
            "
          >

            <button
              type="button"
              class="btn btn-outline host-details-toggle-btn"
              data-hid="${escapeHtml(car.id)}"
              data-target="${escapeHtml(detailsRow)}"
              style="padding:5px 9px;font-size:.78rem;"
            >
              Show Details ▾
            </button>

            ${
              car.status ===
              "pending_approval"
                ? `
                  <button
                    type="button"
                    class="btn btn-dark approve-host-btn"
                    data-hid="${escapeHtml(
                      car.id
                    )}"
                    style="
                      padding:5px 9px;
                      font-size:.78rem;
                    "
                  >
                    Approve
                  </button>

                  <button
                    type="button"
                    class="btn btn-outline reject-host-btn"
                    data-hid="${escapeHtml(
                      car.id
                    )}"
                    style="
                      padding:5px 9px;
                      font-size:.78rem;
                      color:#ef476f;
                      border-color:#ef476f;
                    "
                  >
                    Reject
                  </button>
                `
                : car.status ===
                  "approved"
                  ? `
                    <button
                      type="button"
                      class="btn btn-outline host-photo-upload-btn"
                      data-hid="${escapeHtml(
                        car.id
                      )}"
                      style="
                        padding:5px 9px;
                        font-size:.78rem;
                      "
                    >
                      Upload
                    </button>

                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      class="host-photo-input"
                      data-hid="${escapeHtml(
                        car.id
                      )}"
                      hidden
                    />
                  `
                  : "—"
            }

          </td>

        </tr>

        <tr id="${escapeHtml(detailsRow)}" hidden>
          <td colspan="4" style="padding:18px;">
            <div class="host-document-grid host-acquisition-detail-grid">
              ${renderHostDetail("Brand", car.brand)}
              ${renderHostDetail("Model", car.model)}
              ${renderHostDetail("Manufacturing Year", car.year)}
              ${renderHostDetail("Current Odometer", car.odometer != null ? `${Number(car.odometer).toLocaleString("en-IN")} KM` : null)}
              ${renderHostDetail("Transmission", car.transmission)}
              ${renderHostDetail("Fuel Type", car.fuel)}
              ${renderHostDetail("Seats", car.seats)}
              ${renderHostDetail("Registration", car.regNumber)}
              ${renderHostDetail("Pickup Location", car.location)}
              ${renderHostDetail("Insurance Start", car.insuranceStart)}
              ${renderHostDetail("Insurance End", car.insuranceEnd)}
              ${renderHostDetail("PUC Start", car.pucStart)}
              ${renderHostDetail("PUC End", car.pucEnd)}
              ${renderHostDetail("Owner Name", car.ownerName)}
              ${renderHostDetail("Owner Phone", car.ownerPhone)}
              ${renderHostDetail("Owner Email", car.userEmail)}
              ${renderHostDetail("Submitted", formatDate(car.createdAt))}
              ${renderHostDetail("Photo Count", knownPhotoCount)}
            </div>

            ${car.rejectionReason ? `<p style="margin:14px 0 0;padding:12px;border-left:3px solid #ef476f;background:rgba(239,71,111,.08);color:var(--sub);"><strong style="color:#ef476f;">Rejection reason:</strong> ${escapeHtml(car.rejectionReason)}</p>` : ""}

            <div style="margin-top:18px;">
              <strong style="display:block;margin-bottom:10px;">Submitted Vehicle Photos</strong>
              <div class="host-details-photo-grid" data-hid="${escapeHtml(car.id)}" style="display:flex;gap:12px;flex-wrap:wrap;">
                ${renderLegacyHostPhotos(car.id, legacyPhotos)}
                ${renderServerHostPhotos(car.id, cachedServerPhotos)}
                ${!legacyPhotos.length && !cachedServerPhotos.length ? `<span class="host-photo-loading" style="color:var(--sub);">Loading protected photos when details are opened...</span>` : ""}
              </div>
            </div>
          </td>
        </tr>

      `;
    }
  );

  html += `
        </tbody>
      </table>

    </div>
  `;

  hostCarsTableWrap.innerHTML =
    html;

  attachHostCarEvents();
}

function renderHostDetail(label, value) {
  const display = value === undefined || value === null || value === ""
    ? "—"
    : value;

  return `
    <div class="host-document-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(display)}</strong>
    </div>`;
}

// Old Firebase Storage photos: public URL, no fetch needed, plain <img>.
function renderLegacyHostPhotos(carId, urls) {
  if (!urls.length) return "";

  return urls
    .map(
      (url, index) => `
        <div
          class="host-photo-tile"
          style="position:relative;width:120px;height:90px;"
        >
          <img
            src="${escapeHtml(url)}"
            alt="Host car photo ${index + 1}"
            style="
              width:100%;height:100%;object-fit:cover;
              border-radius:8px;border:1px solid var(--line);
            "
          />
          <button
            type="button"
            class="remove-host-photo-btn"
            data-hid="${escapeHtml(carId)}"
            data-source="legacy"
            data-url="${encodeURIComponent(url)}"
            style="
              position:absolute;top:-7px;right:-7px;width:24px;height:24px;
              border:none;border-radius:50%;background:#ef476f;color:white;
              cursor:pointer;
            "
          >×</button>
        </div>
      `
    )
    .join("");
}

// New media-server photos: private, so these only render once
// loadHostPhotosIntoCache() has actually fetched blob URLs for them —
// before that, cachedServerPhotos is empty and this renders nothing (the
// toggle handler fills it in and re-renders once the fetch completes).
function renderServerHostPhotos(carId, photos) {
  if (!photos.length) return "";

  return photos
    .map(
      (photo) => `
        <div
          class="host-photo-tile"
          style="position:relative;width:120px;height:90px;"
        >
          <img
            src="${escapeHtml(photo.blobUrl)}"
            alt="${escapeHtml(photo.originalName || "Host car photo")}"
            style="
              width:100%;height:100%;object-fit:cover;
              border-radius:8px;border:1px solid var(--line);
            "
          />
          <button
            type="button"
            class="remove-host-photo-btn"
            data-hid="${escapeHtml(carId)}"
            data-source="server"
            data-media-id="${escapeHtml(photo.id)}"
            style="
              position:absolute;top:-7px;right:-7px;width:24px;height:24px;
              border:none;border-radius:50%;background:#ef476f;color:white;
              cursor:pointer;
            "
          >×</button>
        </div>
      `
    )
    .join("");
}

// ============================================================================
// HOST CAR EVENTS
// ============================================================================

function attachHostCarEvents() {
  // SHOW DETAILS — every field submitted by the host plus protected photos.
  hostCarsTableWrap
    .querySelectorAll(".host-details-toggle-btn")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const carId = button.dataset.hid;
        const row = document.getElementById(button.dataset.target);
        if (!row) return;

        const opening = row.hidden;
        row.hidden = !opening;
        button.textContent = opening ? "Hide Details ▴" : "Show Details ▾";

        if (!opening || hostPhotoCache.has(carId)) return;

        const car = hostCarsData.find((item) => item.id === carId);
        if (!car) return;

        try {
          await loadHostPhotosIntoCache(car);
        } catch (error) {
          console.warn("HOST DETAIL PHOTO LOAD ERROR:", error);
        }

        renderHostCarsTable(hostCarsData);
        const reopened = document.getElementById(`host-details-${carId}`);
        if (reopened) reopened.hidden = false;
        const reopenedButton = hostCarsTableWrap.querySelector(
          `.host-details-toggle-btn[data-hid="${carId}"]`
        );
        if (reopenedButton) reopenedButton.textContent = "Hide Details ▴";
      });
    });

  // APPROVE
  hostCarsTableWrap
    .querySelectorAll(
      ".approve-host-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const id =
            button.dataset.hid;

          try {
            button.disabled =
              true;

            button.textContent =
              "Approving...";

            await setDoc(
              doc(
                db,
                "partner_cars",
                id
              ),
              {
                status:
                  "approved",

                approvedAt:
                  serverTimestamp(),

                approvedBy:
                  currentUser
                    ? currentUser.uid
                    : null,
              },
              {
                merge: true,
              }
            );

            const car =
              hostCarsData.find(
                (item) =>
                  item.id === id
              );

            if (car) {
              car.status =
                "approved";
            }

            updateHostCount();

            renderHostCarsTable(
              hostCarsData
            );

          } catch (error) {
            console.error(
              "HOST APPROVAL ERROR:",
              error
            );

            button.disabled =
              false;

            button.textContent =
              "Approve";

            alert(
              "Could not approve host car.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // REJECT
  hostCarsTableWrap
    .querySelectorAll(
      ".reject-host-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const id =
            button.dataset.hid;

          const reason =
            prompt(
              "Reason for rejecting this host car:"
            );

          if (
            reason ===
            null
          ) {
            return;
          }

          try {
            button.disabled =
              true;

            await setDoc(
              doc(
                db,
                "partner_cars",
                id
              ),
              {
                status:
                  "rejected",

                rejectionReason:
                  reason ||
                  "Listing rejected.",

                rejectedAt:
                  serverTimestamp(),

                rejectedBy:
                  currentUser
                    ? currentUser.uid
                    : null,
              },
              {
                merge: true,
              }
            );

            const car =
              hostCarsData.find(
                (item) =>
                  item.id === id
              );

            if (car) {
              car.status =
                "rejected";
            }

            updateHostCount();

            renderHostCarsTable(
              hostCarsData
            );

          } catch (error) {
            console.error(
              "HOST REJECTION ERROR:",
              error
            );

            button.disabled =
              false;

            alert(
              "Could not reject host car.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // PHOTOS TOGGLE — lazily fetches server-hosted photos the first time a
  // given car's row is opened, then just shows/hides on subsequent clicks.
  hostCarsTableWrap
    .querySelectorAll(
      ".host-photo-toggle-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const carId = button.dataset.hid;
          const row = document.getElementById(button.dataset.target);

          if (!row) return;

          const wasHidden = row.hidden;
          row.hidden = !wasHidden;

          if (!wasHidden) {
            // just closed — nothing to fetch
            return;
          }

          if (hostPhotoCache.has(carId)) {
            // already loaded on a previous open — nothing to do
            return;
          }

          const grid = row.querySelector(".host-photo-grid");

          if (grid) {
            grid.insertAdjacentHTML(
              "beforeend",
              `<span class="host-photo-loading" style="color:var(--sub);">Loading photos…</span>`
            );
          }

          const car = hostCarsData.find((item) => item.id === carId);

          if (!car) return;

          try {
            await loadHostPhotosIntoCache(car);
          } catch (error) {
            console.warn("HOST PHOTO LOAD ERROR:", error);
          }

          // Re-render so the newly loaded photos (and the accurate count on
          // the toggle button) show up. The row stays open across the
          // re-render since renderHostCarsTable rebuilds `hidden` from
          // scratch — reopen it here.
          renderHostCarsTable(hostCarsData);

          const reopenedRow = document.getElementById(`host-photo-${carId}`);
          if (reopenedRow) reopenedRow.hidden = false;
        }
      );
    });

  // PHOTO UPLOAD trigger
  hostCarsTableWrap
    .querySelectorAll(
      ".host-photo-upload-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const input =
            hostCarsTableWrap.querySelector(
              `.host-photo-input[data-hid="${button.dataset.hid}"]`
            );

          if (input) {
            input.click();
          }
        }
      );
    });

  // FILE INPUT — uploads to the media server, not Firebase Storage
  hostCarsTableWrap
    .querySelectorAll(
      ".host-photo-input"
    )
    .forEach((input) => {
      input.addEventListener(
        "change",
        async () => {
          const files =
            Array.from(
              input.files ||
                []
            );

          if (!files.length) {
            return;
          }

          await uploadHostPhotos(
            input.dataset.hid,
            files
          );

          input.value =
            "";
        }
      );
    });

  // REMOVE PHOTO — legacy Firestore-array photos vs. server-hosted photos
  // are removed through two different paths (see data-source).
  hostCarsTableWrap
    .querySelectorAll(
      ".remove-host-photo-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const confirmed =
            confirm(
              "Remove this photo from the host car listing?"
            );

          if (!confirmed) {
            return;
          }

          const carId = button.dataset.hid;
          const source = button.dataset.source;

          button.disabled = true;

          try {
            if (source === "server") {
              await removeServerHostPhoto(carId, button.dataset.mediaId);
            } else {
              await removeLegacyHostPhoto(
                carId,
                decodeURIComponent(button.dataset.url)
              );
            }

            renderHostCarsTable(hostCarsData);

            const row = document.getElementById(`host-photo-${carId}`);
            if (row) row.hidden = false;

          } catch (error) {
            console.error(
              "PHOTO REMOVE ERROR:",
              error
            );

            button.disabled = false;

            alert(
              "Could not remove photo.\n\n" +
              error.message
            );
          }
        }
      );
    });
}

async function removeLegacyHostPhoto(carId, url) {
  const car = hostCarsData.find((item) => item.id === carId);
  if (!car) return;

  const photos = Array.isArray(car.photos) ? car.photos : [];
  const remaining = photos.filter((photo) => photo !== url);

  await updateDoc(doc(db, "partner_cars", carId), { photos: remaining });

  car.photos = remaining;
}

async function removeServerHostPhoto(carId, mediaId) {
  const headers = await mediaAuthHeaders();

  const response = await fetch(
    `${MEDIA_SERVER_URL}/api/media/${encodeURIComponent(mediaId)}`,
    { method: "DELETE", headers }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Delete failed (${response.status}).`);
  }

  invalidateHostPhotoCache(carId);
}

function updateHostCount() {
  const pending =
    hostCarsData.filter(
      (car) =>
        car.status ===
        "pending_approval"
    ).length;

  const element =
    $("statPendingHosts");

  if (element) {
    element.textContent =
      pending;
  }
}

// Uploads to the local media server (category=partner_car_photo,
// relatedId=<car id>) instead of Firebase Storage — the admin's own ID
// token is attached, so these uploads land under the admin's uid on the
// server side (see the merge logic in fetchHostCarMedia).
async function uploadHostPhotos(
  hostId,
  files
) {
  const car =
    hostCarsData.find(
      (item) =>
        item.id === hostId
    );

  if (!car) {
    return;
  }

  if (!currentUser) {
    alert("You must be signed in to upload photos.");
    return;
  }

  const headers = await mediaAuthHeaders();
  const failures = [];

  for (const file of files) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "partner_car_photo");
      formData.append("relatedId", hostId);

      const response = await fetch(
        `${MEDIA_SERVER_URL}/api/media/upload`,
        { method: "POST", headers, body: formData }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Upload failed (${response.status}).`);
      }
    } catch (error) {
      console.error("HOST PHOTO UPLOAD ERROR:", error);
      failures.push(`${file.name}: ${error.message}`);
    }
  }

  invalidateHostPhotoCache(hostId);

  // Immediately reload so the new photos show up rather than waiting for
  // the next toggle-open.
  try {
    await loadHostPhotosIntoCache(car);
  } catch (error) {
    console.warn("HOST PHOTO RELOAD ERROR:", error);
  }

  renderHostCarsTable(hostCarsData);

  const row = document.getElementById(`host-photo-${hostId}`);
  if (row) row.hidden = false;

  if (failures.length) {
    alert(
      "Some photos could not be uploaded:\n\n" + failures.join("\n")
    );
  }
}

// ============================================================================
// RETURN MODAL CLOSE
// ============================================================================

function initialiseReturnModal() {
  const close =
    $("closeReturnModal");

  if (close) {
    close.addEventListener(
      "click",
      () => {
        hideModal(
          "returnModal"
        );
      }
    );
  }

  const modal =
    $("returnModal");

  if (modal) {
    modal.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          modal
        ) {
          hideModal(
            "returnModal"
          );
        }
      }
    );
  }
}

// ============================================================================
// GLOBAL ERROR LOGGING
// ============================================================================

window.addEventListener(
  "error",
  (event) => {
    console.error(
      "ADMIN PAGE ERROR:",
      event.error ||
        event.message
    );
  }
);

window.addEventListener(
  "unhandledrejection",
  (event) => {
    console.error(
      "ADMIN PROMISE ERROR:",
      event.reason
    );
  }
);

console.log(
  "KRUIZLY Admin JS loaded successfully."
);
