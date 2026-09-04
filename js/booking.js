// ============================================================
// KRUIZLY — BOOKING PAGE
// ============================================================

import { checkAuth, getCurrentUser } from "./auth.js?v=20260904-v2";
import { api } from "./kruizly-api.js?v=20260904-v2";
import "./nav-helper.js";
import { generateNumericBookingId } from "./booking-reference.js";
import {
  calculateBookingPrice,
  calculateDuration,
  formatCurrency,
  formatHumanDateTime,
  parseDateTime,
} from "./booking-calculator.js";
import { validateCoupon } from "./coupon-service.js";

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function toLocalDateTime(date) {
  return (
    date.getFullYear() +
    "-" +
    padDatePart(date.getMonth() + 1) +
    "-" +
    padDatePart(date.getDate()) +
    "T" +
    padDatePart(date.getHours()) +
    ":" +
    padDatePart(date.getMinutes())
  );
}

function sessionStorageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

const params = new URLSearchParams(window.location.search);
let queryId =
  params.get("id") ||
  params.get("car") ||
  params.get("reg") ||
  params.get("vehicle");
if (queryId === "undefined" || queryId === "null" || queryId === "")
  queryId = null;

const catalog = Array.isArray(window.fleetVehicles) ? window.fleetVehicles : [];
const vehicle =
  (typeof window.getFleetVehicle === "function" &&
    window.getFleetVehicle(queryId)) ||
  catalog.find(
    (item) =>
      (queryId &&
        (item.id === queryId ||
          item.slug === queryId ||
          item.regNo === queryId)) ||
      (queryId &&
        `${item.brand} ${item.model}`.toLowerCase() === queryId.toLowerCase()),
  ) ||
  catalog[0];

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

function showUnavailable(message) {
  if (bookingTitle) bookingTitle.textContent = "Car Not Available";
  if (vehicleName) vehicleName.textContent = message;
  if (vehicleMeta) vehicleMeta.textContent = "";
  if (form) form.hidden = true;
}

if (!vehicle) {
  showUnavailable(
    "We couldn't find that car. Please return to the fleet and choose another vehicle.",
  );
} else if (!vehicle.available) {
  if (vehicleName)
    vehicleName.textContent = vehicle.brand + " " + vehicle.model;
  showUnavailable(
    "This car is currently booked. Please choose another vehicle from the fleet.",
  );
} else {
  initBooking(vehicle);
}

async function initBooking(vehicle) {
  let currentUser = null;
  let appliedCoupons = [];

  if (bookingTitle)
    bookingTitle.textContent =
      "Book the " + vehicle.brand + " " + vehicle.model;
  if (vehicleName)
    vehicleName.textContent = vehicle.brand + " " + vehicle.model;
  if (vehicleMeta)
    vehicleMeta.textContent =
      vehicle.category + " • " + vehicle.transmission + " • " + vehicle.fuel;
  if (dayRate) dayRate.textContent = "₹" + formatCurrency(vehicle.priceDay);
  if (driverRate)
    driverRate.textContent = "₹" + formatCurrency(vehicle.driverPrice || 2000);
  if (deposit)
    deposit.textContent = "₹" + formatCurrency(vehicle.securityDeposit);
  if (location)
    location.textContent =
      vehicle.location || "Gavson Business Park, Ghansoli, Navi Mumbai.";

  const imagePath = window.fleetImagePath ? window.fleetImagePath(vehicle) : "";
  if (imagePath && vehicleImage) {
    const img = document.createElement("img");
    img.src = imagePath;
    img.alt = vehicle.brand + " " + vehicle.model;
    img.loading = "eager";
    img.decoding = "async";
    img.onload = () => {
      if (vehicleIcon) vehicleIcon.style.display = "none";
      vehicleImage.classList.add("has-image");
    };
    img.onerror = () => {
      if (vehicleIcon) vehicleIcon.style.display = "block";
    };
    vehicleImage.appendChild(img);
  }

  const pickupInput = document.getElementById("pickupDate");
  const dropInput = document.getElementById("dropDate");
  const driverInput = document.getElementById("withDriver");
  const paymentPlanInputs = Array.from(
    document.querySelectorAll('input[name="paymentPlan"]'),
  );
  const submitBtn = document.getElementById("bookingSubmitBtn");
  const couponInput = document.getElementById("couponInput");
  const couponApplyBtn = document.getElementById("couponApplyBtn");
  const couponMsg = document.getElementById("couponMsg");
  const appliedCouponsWrap = document.getElementById("appliedCouponsWrap");
  const couponSuggestionsGrid = document.getElementById(
    "couponSuggestionsGrid",
  );
  const resetBookingTimes = document.getElementById("resetBookingTimes");

  function renderAppliedCoupons() {
    if (!appliedCouponsWrap) return;
    if (appliedCoupons.length === 0) {
      appliedCouponsWrap.innerHTML = "";
      appliedCouponsWrap.hidden = true;
      return;
    }

    appliedCouponsWrap.hidden = false;
    appliedCouponsWrap.innerHTML = appliedCoupons
      .filter((c) => Boolean(c && (c.code || c.couponCode)))
      .map((c) => {
        const type = c.discountType || c.discount_type || c.type || "flat";
        const val = Number(c.discountValue ?? c.discount_value ?? c.val ?? 0);
        const discountTxt =
          type === "percent" || type === "percentage"
            ? `${val}% OFF`
            : `₹${val} OFF`;
        const code = c.code || c.couponCode;
        return `
        <span class="applied-coupon-tag">
          <strong>${code}</strong> (${discountTxt})
          <button type="button" class="remove-coupon-btn" data-code="${code}" aria-label="Remove coupon ${code}">✕</button>
        </span>
      `;
      })
      .join("");

    appliedCouponsWrap.querySelectorAll(".remove-coupon-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const codeToRemove = btn.dataset.code;
        appliedCoupons = appliedCoupons.filter((c) => c.code !== codeToRemove);
        if (couponMsg) {
          couponMsg.textContent = `Coupon ${codeToRemove} removed.`;
          couponMsg.className = "booking-coupon-msg";
        }
        calculateBooking();
        renderAppliedCoupons();
      });
    });
  }

  async function applyCouponCode(rawCode) {
    const code = String(rawCode || "")
      .trim()
      .toUpperCase();
    if (!code) {
      if (couponMsg) {
        couponMsg.textContent = "Please enter a coupon code.";
        couponMsg.className = "booking-coupon-msg error";
      }
      return;
    }

    if (appliedCoupons.some((c) => c.code === code)) {
      if (couponMsg) {
        couponMsg.textContent = `Coupon ${code} is already applied.`;
        couponMsg.className = "booking-coupon-msg";
      }
      return;
    }

    if (couponApplyBtn) couponApplyBtn.disabled = true;
    if (couponMsg) {
      couponMsg.textContent = "Verifying coupon...";
      couponMsg.className = "booking-coupon-msg";
    }

    const baseCalc = calculateBookingPrice({
      vehicle,
      pickup: pickupInput.value,
      drop: dropInput.value,
      withDriver: Boolean(driverInput && driverInput.checked),
      coupon: null,
    });

    const result = await validateCoupon({
      code,
      bookingAmount: baseCalc.rentalTotal || 0,
      userId: currentUser?.uid,
      appliedCoupons,
    });

    if (couponApplyBtn) couponApplyBtn.disabled = false;

    if (result.valid && result.coupon) {
      appliedCoupons.push(result.coupon);
      if (couponInput) couponInput.value = "";
      if (couponMsg) {
        couponMsg.textContent = `✓ Coupon '${code}' applied! (${result.coupon.label})`;
        couponMsg.className = "booking-coupon-msg success";
      }
      calculateBooking();
      renderAppliedCoupons();
      renderSuggestedCoupons(baseCalc.rentalTotal || 0);
    } else {
      if (couponMsg) {
        couponMsg.textContent = result.error || "Coupon could not be applied.";
        couponMsg.className = "booking-coupon-msg error";
      }
    }
  }

  function roundToNextHour(d) {
    const date = new Date(d.getTime());
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + 1);
    return date;
  }

  function synchroniseRentalDates(isInitial = false) {
    const now = new Date();
    pickupInput.min = toLocalDateTime(now);

    let pDate = parseDateTime(pickupInput.value);
    let dDate = parseDateTime(dropInput.value);

    if (isInitial) {
      const urlPickup = params.get("pickup") || sessionStorageGet("crp_pickupDate");
      const urlDrop = params.get("drop") || sessionStorageGet("crp_dropDate");
      if (urlPickup) pDate = parseDateTime(urlPickup);
      if (urlDrop) dDate = parseDateTime(urlDrop);
    }

    if (!pDate || isNaN(pDate.getTime()) || pDate < now) {
      pDate = roundToNextHour(now);
    }

    if (!dDate || isNaN(dDate.getTime()) || dDate <= pDate) {
      dDate = new Date(pDate.getTime() + 24 * 60 * 60 * 1000);
    }

    pickupInput.value = toLocalDateTime(pDate);
    dropInput.min = toLocalDateTime(pDate);
    dropInput.value = toLocalDateTime(dDate);

    try {
      sessionStorage.setItem("crp_pickupDate", pickupInput.value);
      sessionStorage.setItem("crp_dropDate", dropInput.value);
    } catch (_) {}
  }

  function calculateBooking() {
    const pickup = pickupInput ? pickupInput.value : "";
    const drop = dropInput ? dropInput.value : "";
    const withDriver = Boolean(driverInput && driverInput.checked);
    const paymentPlan =
      paymentPlanInputs.find((input) => input.checked)?.value || "advance";

    const calculation = calculateBookingPrice({
      vehicle,
      pickup,
      drop,
      withDriver,
      coupon: appliedCoupons,
      paymentPlan,
    });

    if (!calculation.valid) {
      totalsEl.innerHTML =
        '<div class="booking-error">' +
        (calculation.error || "Please select valid rental dates.") +
        "</div>";
      return null;
    }

    const {
      duration,
      hours,
      days,
      rentalTotal,
      driverTotal,
      securityDeposit,
      couponDiscount,
      finalAmount,
      advanceAmount,
      remainingAmount,
    } = calculation;

    let html =
      '<div class="booking-totals__header"><span>PRICE BREAKDOWN</span><span>Duration: ' +
      duration.formattedDuration +
      "</span></div>";
    html +=
      '<div class="booking-total-row"><span>Rental Charges (' +
      days +
      " day" +
      (days > 1 ? "s" : "") +
      ")</span><strong>₹" +
      formatCurrency(rentalTotal) +
      "</strong></div>";

    if (withDriver) {
      html +=
        '<div class="booking-total-row"><span>Driver Allowance</span><strong>₹' +
        formatCurrency(driverTotal) +
        "</strong></div>";
    }

    html +=
      '<div class="booking-total-row"><span>Security Deposit<small style="display:block; font-size:0.75rem; color:var(--text-sub)">(100% Refundable upon vehicle return)</small></span><strong>₹' +
      formatCurrency(securityDeposit) +
      "</strong></div>";

    if (couponDiscount > 0) {
      const appliedLabels = appliedCoupons.map((c) => c.code).join(", ");
      html +=
        '<div class="booking-total-row" style="color: var(--kz-success, #34d399);"><span>Coupon Discount (' +
        appliedLabels +
        ')</span><strong style="color: var(--kz-success, #34d399);">-₹' +
        formatCurrency(couponDiscount) +
        "</strong></div>";
    }

    html +=
      '<div class="booking-total-row booking-total-row--grand"><span>Total Estimated Amount</span><strong>₹' +
      formatCurrency(finalAmount) +
      "</strong></div>";
    html +=
      '<div class="booking-total-row booking-total-row--payment"><span>' +
      (paymentPlan === "advance"
        ? "Advance Payable Now"
        : "Full Amount Payable Now") +
      '<small style="display:block; font-size:0.75rem; color:var(--text-sub)">' +
      (paymentPlan === "advance"
        ? "Balance due at pickup: ₹" + formatCurrency(remainingAmount)
        : "100% booking confirmation") +
      "</small></span><strong>₹" +
      formatCurrency(advanceAmount) +
      "</strong></div>";

    totalsEl.innerHTML = html;
    return calculation;
  }

  if (couponApplyBtn && couponInput) {
    couponApplyBtn.addEventListener("click", () => {
      applyCouponCode(couponInput.value);
    });

    couponInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyCouponCode(couponInput.value);
      }
    });
  }

  if (resetBookingTimes) {
    resetBookingTimes.addEventListener("click", () => {
      const resetNow = new Date();
      const resetPickup = new Date(resetNow.getTime() + 60 * 60 * 1000);
      const resetDrop = new Date(resetPickup.getTime() + 24 * 60 * 60 * 1000);

      if (pickupInput._flatpickr) {
        pickupInput._flatpickr.setDate(resetPickup, true);
      } else {
        pickupInput.min = toLocalDateTime(resetNow);
        pickupInput.value = toLocalDateTime(resetPickup);
      }

      if (dropInput._flatpickr) {
        dropInput._flatpickr.setDate(resetDrop, true);
      } else {
        dropInput.min = toLocalDateTime(resetPickup);
        dropInput.value = toLocalDateTime(resetDrop);
      }

      if (driverInput) driverInput.checked = false;
      paymentPlanInputs.forEach((input) => {
        input.checked = input.value === "advance";
      });
      document.querySelectorAll(".booking-payment-option").forEach((option) => {
        const radio = option.querySelector('input[name="paymentPlan"]');
        option.classList.toggle(
          "booking-payment-option--selected",
          radio && radio.value === "advance",
        );
      });

      appliedCoupons = [];
      renderAppliedCoupons();
      if (couponInput) couponInput.value = "";
      if (couponMsg) {
        couponMsg.textContent = "";
        couponMsg.className = "booking-coupon-msg";
      }

      try {
        sessionStorage.removeItem("crp_pickupDate");
        sessionStorage.removeItem("crp_dropDate");
        sessionStorage.removeItem("kruizly_applied_coupon");
        localStorage.removeItem("kruizly_temp_booking");
      } catch (_) {}

      if (window.history && window.history.replaceState) {
        const cleanParams = new URLSearchParams();
        if (vehicle && vehicle.regNo) cleanParams.set("reg", vehicle.regNo);
        const cleanUrl =
          window.location.pathname + "?" + cleanParams.toString();
        window.history.replaceState({}, document.title, cleanUrl);
      }

      calculateBooking();
    });
  }

  pickupInput.addEventListener("change", () => {
    if (pickupInput.value) {
      dropInput.min = pickupInput.value;
      if (!dropInput.value || dropInput.value <= pickupInput.value) {
        const pDate = new Date(pickupInput.value);
        if (!isNaN(pDate.getTime())) {
          const dDate = new Date(pDate.getTime() + 24 * 60 * 60 * 1000);
          dropInput.value = toLocalDateTime(dDate);
        }
      }
    }
    calculateBooking();
  });
  pickupInput.addEventListener("input", calculateBooking);

  dropInput.addEventListener("change", calculateBooking);
  dropInput.addEventListener("input", calculateBooking);
  driverInput && driverInput.addEventListener("change", calculateBooking);

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

  synchroniseRentalDates(true);
  calculateBooking();

  const isAuthenticated = await checkAuth();
  if (isAuthenticated) {
    currentUser = getCurrentUser();
  }

  if (!currentUser) {
    if (statusEl)
      statusEl.textContent = "Please log in to continue with your booking.";
    return;
  }

  if (statusEl) statusEl.textContent = "";

    try {
      const vRes = await api.get(`/vehicles/${vehicle.regNo}`).catch(() => null);
      if (vRes?.vehicle && (vRes.vehicle.available === 0 || vRes.vehicle.available === false)) {
        throw new Error(
          "This vehicle was just marked unavailable. Please choose another car.",
        );
      }

      const uRes = await api.get("/users/me").catch(() => null);
      const userData = uRes?.user || {};

      if (userData.licenseStatus !== "verified" && licenseNote) {
        licenseNote.innerHTML =
          "<strong>Please Note</strong><span>Your driving licence is not verified yet. You can continue with booking, but please upload and verify it from your profile before pickup.</span>";
        licenseNote.classList.add("booking-license-note--warning");
      }
    } catch (error) {
      console.warn("Could not load user profile.", error);
    }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      const nextParams = new URLSearchParams();
      nextParams.set("reg", vehicle.regNo);
      if (pickupInput.value) nextParams.set("pickup", pickupInput.value);
      if (dropInput.value) nextParams.set("drop", dropInput.value);
      const next = "booking.html?" + nextParams.toString();
      window.location.href = "index.html?next=" + encodeURIComponent(next);
      return;
    }

    const now = new Date();
    const pDate = parseDateTime(pickupInput);
    const dDate = parseDateTime(dropInput);

    if (!pDate || isNaN(pDate.getTime()) || pDate < new Date(now.getTime() - 2 * 60 * 1000)) {
      if (statusEl) {
        statusEl.textContent = "Pickup date cannot be in the past. Please select an upcoming date.";
        statusEl.classList.add("form-status--error");
      }
      return;
    }

    if (!dDate || isNaN(dDate.getTime()) || dDate <= pDate) {
      if (statusEl) {
        statusEl.textContent = "Drop date must be after pickup date.";
        statusEl.classList.add("form-status--error");
      }
      return;
    }

    const calculation = calculateBooking();
    if (!calculation || !calculation.valid) {
      if (statusEl) {
        statusEl.textContent = calculation
          ? calculation.error
          : "Please review the booking schedule before proceeding.";
        statusEl.classList.add("form-status--error");
      }
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    if (statusEl) {
      statusEl.textContent = "Creating your booking in Firebase...";
      statusEl.classList.remove("form-status--error");
    }

    try {
      let userData = {};
      try {
        const uRes = await api.get("/users/me").catch(() => null);
        if (uRes?.user) userData = uRes.user;
      } catch (uErr) {
        console.warn("Could not read user profile:", uErr);
      }

      const numericBookingId = generateNumericBookingId();

      const bookingRecord = {
        bookingId: numericBookingId,
        bookingNumber: numericBookingId,
        userId: currentUser.uid,
        userName:
          userData.name || currentUser.displayName || currentUser.email || "",
        userEmail: currentUser.email || "",
        userPhone: userData.phone || null,

        carId: vehicle.regNo,
        vehicleReg: vehicle.regNo,
        vehicleName: vehicle.brand + " " + vehicle.model,
        vehicleCategory: vehicle.category,
        vehicleIcon: "",

        pickupDate: (parseDateTime(pickupInput) || new Date()).toISOString(),
        dropDate: (parseDateTime(dropInput) || new Date()).toISOString(),
        duration: calculation.duration.formattedDuration,
        durationDays: calculation.days,
        days: calculation.days,
        hours: calculation.hours,

        withDriver: calculation.withDriver,
        dayRate: vehicle.priceDay,
        hourlyRate: calculation.hourlyRate,
        driverRate: vehicle.driverPrice || 2000,
        driverHourlyRate: calculation.driverHourlyRate,
        securityDeposit: calculation.securityDeposit,
        baseAmount: calculation.rentalTotal,
        couponCode: calculation.appliedCoupons?.length
          ? calculation.appliedCoupons.map((c) => c.code).join(", ")
          : calculation.couponApplied
            ? calculation.couponApplied.code
            : null,
        couponCodes: calculation.appliedCoupons?.length
          ? calculation.appliedCoupons.map((c) => c.code)
          : calculation.couponApplied
            ? [calculation.couponApplied.code]
            : [],
        appliedCoupons: calculation.appliedCoupons || [],
        couponDiscount: calculation.couponDiscount || 0,
        finalAmount: calculation.finalAmount,
        totalAmount: calculation.finalAmount,

        paymentPlan: calculation.paymentPlan,
        advanceAmount: calculation.advanceAmount,
        paymentAmount: calculation.paymentAmount,
        remainingAmount: calculation.remainingAmount,
        remainingBalance: calculation.remainingAmount,

        location: vehicle.location || "Gavson Business Park, Ghansoli",
        pickupLocation: vehicle.location || "Gavson Business Park, Ghansoli",
        dropLocation: vehicle.location || "Gavson Business Park, Ghansoli",

        status: "pending_payment",
        bookingStatus: "pending_payment",
        paymentStatus: "pending_payment",
        paymentRef: null,
      };

      // Store pending booking in sessionStorage so NO abandoned booking is created in Firestore
      sessionStorage.setItem("kruizly_pending_booking", JSON.stringify(bookingRecord));

      try {
        sessionStorage.removeItem("crp_pickupDate");
        sessionStorage.removeItem("crp_dropDate");
      } catch (_) {}

      const paymentParams = new URLSearchParams();
      paymentParams.set("booking", bookingRecord.bookingId);
      window.location.href = "payment.html?" + paymentParams.toString();
    } catch (error) {
      console.error("Booking preparation failed:", error);
      if (statusEl) {
        statusEl.textContent =
          (error && error.message) ||
          "Couldn't prepare the booking. Please try again.";
        statusEl.classList.add("form-status--error");
      }
      if (submitButton) submitButton.disabled = false;
    }
  });
}
