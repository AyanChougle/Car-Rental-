// ============================================================
// KRUIZLY — BOOKING PAGE
// ============================================================

import { auth, db } from "./firebase-init.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import "./nav-helper.js";
import { generateNumericBookingId } from "./booking-reference.js";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

// IMPORTANT:
// Don't use toISOString() for today's date here.
// It uses UTC and can cause the date to shift around midnight.
function todayISO() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function toLocalDateTime(date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function nextDayISO(value) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setDate(date.getDate() + 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function sessionStorageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// DOM
// ------------------------------------------------------------

const params = new URLSearchParams(window.location.search);

const registration = params.get("reg");

const catalog = Array.isArray(window.fleetVehicles) ? window.fleetVehicles : [];

const vehicle = catalog.find((item) => item.regNo === registration);

const form = document.getElementById("bookingForm");
const totalsEl = document.getElementById("bookingTotals");
const statusEl = document.getElementById("bookingStatus");

const bookingTitle = document.getElementById("bookingTitle");

const vehicleImage = document.getElementById("bookingVehicleImage");

const vehicleIcon = document.getElementById("bookingVehicleIcon");

const vehicleName = document.getElementById("bookingVehicleName");

const vehicleMeta = document.getElementById("bookingVehicleMeta");

const dayRate = document.getElementById("bookingDayRate");

const driverRate = document.getElementById("bookingDriverRate");

const deposit = document.getElementById("bookingDeposit");

const location = document.getElementById("bookingLocation");

const licenseNote = document.getElementById("bookingLicenseNote");

// ------------------------------------------------------------
// Invalid vehicle
// ------------------------------------------------------------

function showUnavailable(message) {
  bookingTitle.textContent = "Car Not Available";

  vehicleName.textContent = message;

  vehicleMeta.textContent = "";

  if (form) {
    form.hidden = true;
  }
}

// ------------------------------------------------------------
// Initialize
// ------------------------------------------------------------

if (!vehicle) {
  showUnavailable(
    "We couldn't find that car. Please return to the fleet and choose another vehicle.",
  );
} else if (!vehicle.available) {
  vehicleName.textContent = `${vehicle.brand} ${vehicle.model}`;

  showUnavailable(
    "This car is currently booked. Please choose another vehicle from the fleet.",
  );
} else {
  initBooking(vehicle);
}

// ============================================================
// BOOKING
// ============================================================

function initBooking(vehicle) {
  // ----------------------------------------------------------
  // Vehicle information
  // ----------------------------------------------------------

  bookingTitle.textContent = `Book the ${vehicle.brand} ${vehicle.model}`;

  vehicleName.textContent = `${vehicle.brand} ${vehicle.model}`;

  vehicleMeta.textContent = `${vehicle.category} • ${vehicle.transmission} • ${vehicle.fuel}`;

  dayRate.textContent = `₹${formatCurrency(vehicle.priceDay)}`;

  driverRate.textContent = `₹${formatCurrency(vehicle.driverPrice || 1500)}`;

  deposit.textContent = `₹${formatCurrency(vehicle.securityDeposit)}`;

  location.textContent =
    vehicle.location || "Gavson Business Park, Ghansoli, Navi Mumbai.";

  // ----------------------------------------------------------
  // Vehicle image
  // ----------------------------------------------------------

  const imagePath = window.fleetImagePath ? window.fleetImagePath(vehicle) : "";

  if (imagePath) {
    const img = document.createElement("img");

    img.src = imagePath;

    img.alt = `${vehicle.brand} ${vehicle.model}`;

    img.loading = "eager";

    img.decoding = "async";

    img.onload = () => {
      vehicleIcon.style.display = "none";

      vehicleImage.classList.add("has-image");
    };

    img.onerror = () => {
      img.remove();

      vehicleImage.classList.remove("has-image");
    };

    vehicleImage.prepend(img);
  }

  // ----------------------------------------------------------
  // Inputs
  // ----------------------------------------------------------

  const pickupInput = document.getElementById("pickupDate");

  const dropInput = document.getElementById("dropDate");

  const driverInput = document.getElementById("withDriver");

  const paymentPlanInputs = Array.from(
    document.querySelectorAll('input[name="paymentPlan"]'),
  );

  const resetBookingTimes = document.getElementById("resetBookingTimes");

  const now = new Date();
  const pickupDefault = new Date(now.getTime() + 60 * 60 * 1000);
  const dropDefault = new Date(pickupDefault);
  dropDefault.setDate(dropDefault.getDate() + 1);

  pickupInput.min = toLocalDateTime(now);
  pickupInput.value = toLocalDateTime(pickupDefault);
  dropInput.min = toLocalDateTime(pickupDefault);
  dropInput.value = toLocalDateTime(dropDefault);

  // ----------------------------------------------------------
  // Restore homepage dates
  // ----------------------------------------------------------

  function toIsoDateTimeString(dateStr) {
    if (!dateStr) return null;
    let parsed = null;
    if (window.parseKruizlyDate) {
      parsed = window.parseKruizlyDate(dateStr);
    }
    if (!parsed || Number.isNaN(parsed.getTime())) {
      parsed = new Date(dateStr);
    }
    if (Number.isNaN(parsed.getTime())) return null;

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    let hours = parsed.getHours();
    let minutes = parsed.getMinutes();
    if (hours === 0 && minutes === 0 && !dateStr.includes(":")) {
      hours = 12; // Default 12:00 PM noon if date only
    }

    return `${year}-${month}-${day}T${padDatePart(hours)}:${padDatePart(minutes)}`;
  }

  const pickupFromUrl = params.get("pickup");
  const dropFromUrl = params.get("drop");
  const storedPickup = sessionStorageGet("crp_pickupDate");
  const storedDrop = sessionStorageGet("crp_dropDate");

  const prefillPickup = pickupFromUrl || storedPickup;
  const prefillDrop = dropFromUrl || storedDrop;

  if (prefillPickup) {
    const pickupIso = toIsoDateTimeString(prefillPickup);
    if (pickupIso) {
      pickupInput.value = pickupIso;
    }
  }

  if (prefillDrop) {
    const dropIso = toIsoDateTimeString(prefillDrop);
    if (dropIso) {
      dropInput.value = dropIso;
    }
  }

  function parseDateSafe(val) {
    if (!val) return null;
    if (window.parseKruizlyDate) {
      const parsed = window.parseKruizlyDate(val);
      if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
    }
    const fallback = new Date(val);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  // A stale URL/session value must never make the return date fall before
  // today or before the selected pickup time.
  function synchroniseRentalDates({ resetDrop = false } = {}) {
    const currentTime = new Date();
    const minimumPickup = new Date(currentTime.getTime() + 60 * 60 * 1000);
    const selectedPickup = parseDateSafe(pickupInput.value);

    if (
      !selectedPickup ||
      selectedPickup < currentTime
    ) {
      pickupInput.value = toLocalDateTime(minimumPickup);
    }

    const pickupTime = parseDateSafe(pickupInput.value) || minimumPickup;
    dropInput.min = toLocalDateTime(pickupTime);

    const selectedDrop = parseDateSafe(dropInput.value);
    if (
      resetDrop ||
      !selectedDrop ||
      selectedDrop < pickupTime
    ) {
      const defaultDrop = new Date(pickupTime);
      defaultDrop.setDate(defaultDrop.getDate() + 1);
      dropInput.value = toLocalDateTime(defaultDrop);
    }
  }

  synchroniseRentalDates();

  // ----------------------------------------------------------
  // Calculate rental
  // ----------------------------------------------------------

  let activeCoupon = null;

  const couponInput = document.getElementById("couponInput");
  const couponApplyBtn = document.getElementById("couponApplyBtn");
  const couponMsg = document.getElementById("couponMsg");

  const DEFAULT_VALID_COUPONS = {
    KRUIZLY10: { code: "KRUIZLY10", type: "percent", val: 10, label: "10% Off Rental", status: "active" },
    KRUIZLY20: { code: "KRUIZLY20", type: "percent", val: 20, label: "20% Off Rental", status: "active" },
    WELCOME500: { code: "WELCOME500", type: "flat", val: 500, label: "₹500 Flat Off", status: "active" },
    FIRST500: { code: "FIRST500", type: "flat", val: 500, label: "₹500 Flat Off", status: "active" },
    DRIVE10: { code: "DRIVE10", type: "percent", val: 10, label: "10% Off Rental", status: "active" },
    SPECIAL15: { code: "SPECIAL15", type: "percent", val: 15, label: "15% Off Rental", status: "active" },
    PROMO10: { code: "PROMO10", type: "percent", val: 10, label: "10% Off Rental", status: "active" },
  };

  async function resolveCoupon(code) {
    const cleanCode = String(code || "").trim().toUpperCase();
    if (!cleanCode) return null;

    // 1. Try Firestore if permissions allow
    try {
      const snap = await getDoc(doc(db, "coupons", cleanCode));
      if (snap && snap.exists()) {
        const data = snap.data();
        if (data && data.status === "active") return { code: cleanCode, ...data };
        return null;
      }
    } catch (_) {
      // Graceful fallback when Firestore security rules haven't been deployed yet
    }

    // 2. Try LocalStorage for admin-created offline coupons
    try {
      const localStored = localStorage.getItem("kruizly_coupons");
      if (localStored) {
        const list = JSON.parse(localStored);
        const found = list.find(item => (item.code || "").toUpperCase() === cleanCode || (item.id || "").toUpperCase() === cleanCode);
        if (found && found.status === "active") return found;
      }
    } catch (_) {}

    // 3. Fallback to builtin valid promotional coupons
    const fallback = DEFAULT_VALID_COUPONS[cleanCode];
    if (fallback && fallback.status === "active") return fallback;
    return null;
  }

  function calculateBooking() {
    const pickup = pickupInput.value;
    const drop = dropInput.value;

    if (!pickup || !drop) {
      totalsEl.innerHTML = "";
      return null;
    }

    const pickupDate = parseDateSafe(pickup);
    const dropDate = parseDateSafe(drop);

    if (!pickupDate || !dropDate) {
      totalsEl.innerHTML = "";
      return null;
    }

    const durationMs = dropDate - pickupDate;

    if (durationMs <= 0) {
      totalsEl.innerHTML = `
        <div class="booking-error">
          Drop date must be after the pickup date.
        </div>
      `;

      return null;
    }

    const hours = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60)));
    const days = Math.max(1, Math.ceil(hours / 24));
    const withDriver = driverInput.checked;
    const hourlyRate = Number(
      vehicle.priceHour || Number(vehicle.priceDay || 0) / 24,
    );
    const driverHourlyRate = Number(
      vehicle.driverPriceHour || Number(vehicle.driverPrice || 0) / 24,
    );
    const rentalTotal = hours * hourlyRate;
    const driverTotal = withDriver ? hours * driverHourlyRate : 0;

    const securityDeposit = Number(vehicle.securityDeposit || 0);

    let discountAmount = 0;
    if (activeCoupon) {
      if (activeCoupon.type === "percent") {
        discountAmount = Math.round((rentalTotal * activeCoupon.val) / 100);
      } else if (activeCoupon.type === "flat") {
        discountAmount = activeCoupon.val;
      }
    }

    const total = Math.max(
      0,
      rentalTotal + driverTotal + securityDeposit - discountAmount,
    );

    const paymentPlan =
      paymentPlanInputs.find((input) => input.checked)?.value || "advance";

    const paymentAmount = paymentPlan === "advance" ? 500 : total;

    const remainingBalance = Math.max(0, total - paymentAmount);

    totalsEl.innerHTML = `
      <div class="booking-totals__header">
        <span>PRICE BREAKDOWN</span>
        <span>Duration: ${hours} hrs (${days} day${days > 1 ? "s" : ""})</span>
      </div>

      <div class="booking-total-row">
        <span>Rental Charges</span>
        <strong>₹${formatCurrency(rentalTotal)}</strong>
      </div>

      ${
        withDriver
          ? `
            <div class="booking-total-row">
              <span>Driver Allowance</span>
              <strong>₹${formatCurrency(driverTotal)}</strong>
            </div>
          `
          : ""
      }

      <div class="booking-total-row">
        <span>
          Security Deposit
          <small style="display:block; font-size:0.75rem; color:var(--text-sub)">(Refundable upon vehicle return)</small>
        </span>
        <strong>₹${formatCurrency(securityDeposit)}</strong>
      </div>

      ${
        discountAmount > 0
          ? `
            <div class="booking-total-row" style="color: var(--kz-success);">
              <span>Coupon Discount (${activeCoupon.code})</span>
              <strong style="color: var(--kz-success);">-\u20b9${formatCurrency(discountAmount)}</strong>
            </div>
          `
          : ""
      }

      <div class="booking-total-row booking-total-row--grand">
        <span>Total Estimated Amount</span>
        <strong>₹${formatCurrency(total)}</strong>
      </div>

      <div class="booking-total-row booking-total-row--payment">
        <span>
          ${paymentPlan === "advance" ? "Advance Payable Now" : "Full Amount Payable Now"}
          <small style="display:block; font-size:0.75rem; color:var(--text-sub)">${paymentPlan === "advance" ? `Balance due at pickup: ₹${formatCurrency(remainingBalance)}` : "100% booking confirmation"}</small>
        </span>
        <strong>₹${formatCurrency(paymentAmount)}</strong>
      </div>
    `;

    return {
      days,
      hours,
      withDriver,
      hourlyRate,
      driverHourlyRate,
      rentalTotal,
      driverTotal,
      securityDeposit,
      discountAmount,
      total,
      paymentPlan,
      paymentAmount,
      remainingBalance,
    };
  }

  // ----------------------------------------------------------
  // Coupon Events
  // ----------------------------------------------------------

  if (couponApplyBtn && couponInput) {
    couponApplyBtn.addEventListener("click", async () => {
      const code = (couponInput.value || "").trim().toUpperCase();
      if (!code) {
        activeCoupon = null;
        if (couponMsg) {
          couponMsg.textContent = "Please enter a coupon code.";
          couponMsg.className = "booking-coupon-msg error";
        }
        calculateBooking();
        return;
      }

      couponApplyBtn.disabled = true;
      if (couponMsg) {
        couponMsg.textContent = "Verifying coupon code...";
        couponMsg.className = "booking-coupon-msg";
      }

      const match = await resolveCoupon(code);
      couponApplyBtn.disabled = false;

      if (match) {
        activeCoupon = match;
        if (couponMsg) {
          couponMsg.textContent = `Coupon '${code}' applied! (${match.label || "Discount Applied"})`;
          couponMsg.className = "booking-coupon-msg success";
        }
        calculateBooking();
      } else {
        activeCoupon = null;
        if (couponMsg) {
          couponMsg.textContent =
            "Invalid or expired coupon code. Try WELCOME500 or KRUIZLY10.";
          couponMsg.className = "booking-coupon-msg error";
        }
        calculateBooking();
      }
    });
  }

  // ----------------------------------------------------------
  // Events
  // ----------------------------------------------------------

  pickupInput.addEventListener("change", () => {
    synchroniseRentalDates();
    calculateBooking();
  });

  dropInput.addEventListener("change", calculateBooking);

  driverInput.addEventListener("change", calculateBooking);

  paymentPlanInputs.forEach((input) => {
    input.addEventListener("change", () => {
      document.querySelectorAll(".booking-payment-option").forEach((option) => {
        option.classList.toggle(
          "booking-payment-option--selected",
          option.contains(input) && input.checked,
        );
      });
      calculateBooking();
    });
  });

  resetBookingTimes?.addEventListener("click", () => {
    const resetNow = new Date();
    const resetPickup = new Date(resetNow.getTime() + 60 * 60 * 1000);
    const resetDrop = new Date(resetPickup);
    resetDrop.setDate(resetDrop.getDate() + 1);
    pickupInput.min = toLocalDateTime(resetNow);
    pickupInput.value = toLocalDateTime(resetPickup);
    dropInput.min = toLocalDateTime(resetPickup);
    dropInput.value = toLocalDateTime(resetDrop);
    calculateBooking();
  });

  calculateBooking();

  // ----------------------------------------------------------
  // Authentication
  // ----------------------------------------------------------

  let currentUser = null;

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (!user) {
      statusEl.textContent = "Please log in to continue with your booking.";

      return;
    }

    statusEl.textContent = "";

    try {
      const vehicleOverride = await getDoc(doc(db, "vehicles", vehicle.regNo));

      if (
        vehicleOverride.exists() &&
        vehicleOverride.data().available === false
      ) {
        throw new Error(
          "This vehicle was just marked unavailable. Please choose another car.",
        );
      }

      const userSnapshot = await getDoc(doc(db, "users", user.uid));

      const userData = userSnapshot.exists() ? userSnapshot.data() : {};

      if (userData.licenseStatus !== "verified") {
        licenseNote.innerHTML = `
            <strong>Please Note</strong>

            <span>
              Your licence is not verified yet.
              You can continue, but please add and
              verify it from your profile before pickup.
            </span>
          `;

        licenseNote.classList.add("booking-license-note--warning");
      }
    } catch (error) {
      console.warn("Could not load user profile.", error);
    }
  });

  // ----------------------------------------------------------
  // Submit
  // ----------------------------------------------------------

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Login required
    if (!currentUser) {
      const nextParams = new URLSearchParams();

      nextParams.set("reg", vehicle.regNo);

      if (pickupInput.value) {
        nextParams.set("pickup", pickupInput.value);
      }

      if (dropInput.value) {
        nextParams.set("drop", dropInput.value);
      }

      const next = `booking.html?${nextParams.toString()}`;

      window.location.href = `index.html?next=${encodeURIComponent(next)}`;

      return;
    }

    const calculation = calculateBooking();

    if (!calculation) {
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');

    submitButton.disabled = true;

    statusEl.textContent = "Creating your booking...";

    statusEl.classList.remove("form-status--error");

    try {
      const userSnapshot = await getDoc(doc(db, "users", currentUser.uid));

      const userData = userSnapshot.exists() ? userSnapshot.data() : {};

      let bookingRef;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const numericBookingId = generateNumericBookingId();
        const candidateRef = doc(collection(db, "bookings"), numericBookingId);
        const candidateSnapshot = await getDoc(candidateRef);

        if (!candidateSnapshot.exists()) {
          bookingRef = candidateRef;
          break;
        }
      }

      if (!bookingRef) {
        throw new Error(
          "Could not generate a unique booking number. Please try again.",
        );
      }

      await setDoc(bookingRef, {
        bookingNumber: bookingRef.id,

        userId: currentUser.uid,

        userName: userData.name || currentUser.displayName || currentUser.email,

        userEmail: currentUser.email,

        userPhone: userData.phone || null,

        vehicleReg: vehicle.regNo,

        vehicleName: `${vehicle.brand} ${vehicle.model}`,

        vehicleCategory: vehicle.category,

        vehicleIcon: "",

        pickupDate: pickupInput.value,

        dropDate: dropInput.value,

        days: calculation.days,

        hours: calculation.hours,

        withDriver: calculation.withDriver,

        dayRate: vehicle.priceDay,

        hourlyRate: calculation.hourlyRate,

        driverRate: vehicle.driverPrice,

        driverHourlyRate: calculation.driverHourlyRate,

        securityDeposit: vehicle.securityDeposit,

        totalAmount: calculation.total,

        paymentPlan: calculation.paymentPlan,

        paymentAmount: calculation.paymentAmount,

        remainingBalance: calculation.remainingBalance,

        location: vehicle.location,

        status: "pending_payment",

        paymentStatus: "unpaid",

        paymentRef: null,

        createdAt: serverTimestamp(),
      });

      // Preserve booking dates when moving to payment.
      const paymentParams = new URLSearchParams();

      paymentParams.set("booking", bookingRef.id);

      window.location.href = `payment.html?${paymentParams.toString()}`;
    } catch (error) {
      console.error("Booking creation failed:", error);

      statusEl.textContent =
        error?.message || "Couldn't create the booking. Please try again.";

      statusEl.classList.add("form-status--error");

      submitButton.disabled = false;
    }
  });
}
