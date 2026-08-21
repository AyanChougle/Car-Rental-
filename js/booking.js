// ============================================================
// KRUIZLY — BOOKING PAGE
// ============================================================

import { auth, db } from "./firebase-init.js";

import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

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

const catalog = Array.isArray(window.fleetVehicles)
  ? window.fleetVehicles
  : [];

const vehicle = catalog.find(
  (item) => item.regNo === registration
);


const form = document.getElementById("bookingForm");
const totalsEl = document.getElementById("bookingTotals");
const statusEl = document.getElementById("bookingStatus");

const bookingTitle =
  document.getElementById("bookingTitle");

const vehicleImage =
  document.getElementById("bookingVehicleImage");

const vehicleIcon =
  document.getElementById("bookingVehicleIcon");

const vehicleName =
  document.getElementById("bookingVehicleName");

const vehicleMeta =
  document.getElementById("bookingVehicleMeta");

const dayRate =
  document.getElementById("bookingDayRate");

const driverRate =
  document.getElementById("bookingDriverRate");

const deposit =
  document.getElementById("bookingDeposit");

const location =
  document.getElementById("bookingLocation");

const licenseNote =
  document.getElementById("bookingLicenseNote");


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
    "We couldn't find that car. Please return to the fleet and choose another vehicle."
  );

} else if (!vehicle.available) {

  vehicleName.textContent =
    `${vehicle.brand} ${vehicle.model}`;

  showUnavailable(
    "This car is currently booked. Please choose another vehicle from the fleet."
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

  bookingTitle.textContent =
    `Book the ${vehicle.brand} ${vehicle.model}`;


  vehicleName.textContent =
    `${vehicle.brand} ${vehicle.model}`;


  vehicleMeta.textContent =
    `${vehicle.category} • ${vehicle.transmission} • ${vehicle.fuel}`;


  dayRate.textContent =
    `₹${formatCurrency(vehicle.priceDay)}`;


  dayRate.textContent =
    `₹${formatCurrency(vehicle.priceHour || Number(vehicle.priceDay || 0) / 24)}`;

  driverRate.textContent =
    `₹${formatCurrency(vehicle.driverPrice)}`;


  driverRate.textContent =
    `₹${formatCurrency(vehicle.driverPriceHour || Number(vehicle.driverPrice || 0) / 24)}`;

  deposit.textContent =
    `₹${formatCurrency(vehicle.securityDeposit)}`;


  location.textContent =
    vehicle.location || "Gavson Business Park, Ghansoli, Navi Mumbai.";


  // ----------------------------------------------------------
  // Vehicle image
  // ----------------------------------------------------------

  const imagePath =
    window.fleetImagePath
      ? window.fleetImagePath(vehicle)
      : "";


  if (imagePath) {

    const img =
      document.createElement("img");

    img.src = imagePath;

    img.alt =
      `${vehicle.brand} ${vehicle.model}`;

    img.loading = "eager";

    img.decoding = "async";


    img.onload = () => {

      vehicleIcon.style.display = "none";

      vehicleImage.classList.add(
        "has-image"
      );

    };


    img.onerror = () => {

      img.remove();

      vehicleImage.classList.remove(
        "has-image"
      );

    };


    vehicleImage.prepend(img);
  }


  // ----------------------------------------------------------
  // Inputs
  // ----------------------------------------------------------

  const pickupInput =
    document.getElementById("pickupDate");

  const dropInput =
    document.getElementById("dropDate");

  const driverInput =
    document.getElementById("withDriver");

  const paymentPlanInputs =
    Array.from(document.querySelectorAll('input[name="paymentPlan"]'));

  const resetBookingTimes =
    document.getElementById("resetBookingTimes");


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

  const pickupFromUrl =
    params.get("pickup");

  const dropFromUrl =
    params.get("drop");


  const storedPickup =
    sessionStorageGet("crp_pickupDate");

  const storedDrop =
    sessionStorageGet("crp_dropDate");


  const prefillPickup =
    pickupFromUrl || storedPickup;

  const prefillDrop =
    dropFromUrl || storedDrop;


  if (
    prefillPickup &&
    prefillPickup.length >= 10
  ) {

    const pickupValue =
      prefillPickup.length > 10
        ? prefillPickup
        : `${prefillPickup}T12:00`;

    pickupInput.value =
      pickupValue;

    dropInput.min =
      toLocalDateTime(new Date(`${pickupValue}`));

    dropInput.value =
      (() => {
        const valueDate = new Date(pickupValue);
        if (Number.isNaN(valueDate.getTime())) return "";
        const nextDay = new Date(valueDate);
        nextDay.setDate(nextDay.getDate() + 1);
        return toLocalDateTime(nextDay);
      })();
  }


  if (
    prefillDrop &&
    prefillDrop.length >= 10
  ) {

    dropInput.value =
      prefillDrop.length > 10
        ? prefillDrop
        : `${prefillDrop}T12:00`;
  }


  // ----------------------------------------------------------
  // Calculate rental
  // ----------------------------------------------------------

  function calculateBooking() {

    const pickup =
      pickupInput.value;

    const drop =
      dropInput.value;


    if (!pickup || !drop) {

      totalsEl.innerHTML = "";

      return null;
    }


    const pickupDate =
      new Date(pickup);

    const dropDate =
      new Date(drop);


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
    const hourlyRate = Number(vehicle.priceHour || Number(vehicle.priceDay || 0) / 24);
    const driverHourlyRate = Number(vehicle.driverPriceHour || Number(vehicle.driverPrice || 0) / 24);
    const rentalTotal = hours * hourlyRate;
    const driverTotal = withDriver ? hours * driverHourlyRate : 0;


    const securityDeposit =
      Number(vehicle.securityDeposit || 0);


    const total =
      rentalTotal +
      driverTotal +
      securityDeposit;

    const paymentPlan =
      paymentPlanInputs.find((input) => input.checked)?.value || "advance";

    const paymentAmount =
      paymentPlan === "advance" ? 500 : total;

    const remainingBalance =
      Math.max(0, total - paymentAmount);


    totalsEl.innerHTML = `

      <div class="booking-totals__header">
        <span>PRICE BREAKDOWN</span>
        <span>${days} day${days > 1 ? "s" : ""}</span>
      </div>

      <div class="booking-total-row">

        <span>
          Rental
          <small>
            ${days} × ₹${formatCurrency(vehicle.priceDay)}
          </small>
        </span>

        <strong>
          ₹${formatCurrency(rentalTotal)}
        </strong>

      </div>

      ${
        withDriver
          ? `
            <div class="booking-total-row">

              <span>
                Driver
                <small>
                  ${days} × ₹${formatCurrency(vehicle.driverPrice)}
                </small>
              </span>

              <strong>
                ₹${formatCurrency(driverTotal)}
              </strong>

            </div>
          `
          : ""
      }

      <div class="booking-total-row">

        <span>
          Security deposit
          <small>(Refundable T&C*)</small>
        </span>

        <strong>
          ₹${formatCurrency(securityDeposit)}
        </strong>

      </div>

      <div class="booking-total-row booking-total-row--grand">

        <span>
          Total due
        </span>

        <strong>
          ₹${formatCurrency(total)}
        </strong>

      </div>

      <div class="booking-total-row booking-total-row--payment">
        <span>
          ${paymentPlan === "advance" ? "Advance due today" : "Payment due today"}
          <small>${paymentPlan === "advance" ? `Remaining at pickup: ₹${formatCurrency(remainingBalance)}` : "Your full booking amount"}</small>
        </span>
        <strong>₹${formatCurrency(paymentAmount)}</strong>
      </div>
    `;

    const totalRows = totalsEl.querySelectorAll(".booking-total-row");
    const breakdownHeader = totalsEl.querySelector(".booking-totals__header span:last-child");
    if (breakdownHeader) {
      breakdownHeader.textContent = `${hours} hour${hours > 1 ? "s" : ""}`;
    }
    if (totalRows[0]?.querySelector("small")) {
      totalRows[0].querySelector("small").textContent = `Hourly rate: ₹${formatCurrency(hourlyRate)}`;
    }
    if (withDriver && totalRows[1]?.querySelector("small")) {
      totalRows[1].querySelector("small").textContent = `Hourly rate: ₹${formatCurrency(driverHourlyRate)}`;
    }


    return {
      days,
      hours,
      withDriver,
      hourlyRate,
      driverHourlyRate,
      rentalTotal,
      driverTotal,
      securityDeposit,
      total,
      paymentPlan,
      paymentAmount,
      remainingBalance,
    };
  }


  // ----------------------------------------------------------
  // Events
  // ----------------------------------------------------------

  pickupInput.addEventListener(
    "change",
    () => {

      const nextDay =
        nextDayISO(pickupInput.value);

      dropInput.min = nextDay;

      dropInput.value = nextDay;

      calculateBooking();
    }
  );


  dropInput.addEventListener(
    "change",
    calculateBooking
  );


  driverInput.addEventListener(
    "change",
    calculateBooking
  );

  paymentPlanInputs.forEach((input) => {
    input.addEventListener("change", () => {
      document.querySelectorAll(".booking-payment-option").forEach((option) => {
        option.classList.toggle("booking-payment-option--selected", option.contains(input) && input.checked);
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


  onAuthStateChanged(
    auth,
    async (user) => {

      currentUser = user;


      if (!user) {

        statusEl.textContent =
          "Please log in to continue with your booking.";

        return;
      }


      statusEl.textContent = "";


      try {

        const vehicleOverride = await getDoc(
          doc(db, "vehicles", vehicle.regNo)
        );

        if (
          vehicleOverride.exists() &&
          vehicleOverride.data().available === false
        ) {
          throw new Error(
            "This vehicle was just marked unavailable. Please choose another car."
          );
        }

        const userSnapshot =
          await getDoc(
            doc(
              db,
              "users",
              user.uid
            )
          );


        const userData =
          userSnapshot.exists()
            ? userSnapshot.data()
            : {};


        if (
          userData.licenseStatus !==
          "verified"
        ) {

          licenseNote.innerHTML = `
            <strong>Please Note</strong>

            <span>
              Your licence is not verified yet.
              You can continue, but please add and
              verify it from your profile before pickup.
            </span>
          `;

          licenseNote.classList.add(
            "booking-license-note--warning"
          );
        }

      } catch (error) {

        console.warn(
          "Could not load user profile.",
          error
        );

      }

    }
  );


  // ----------------------------------------------------------
  // Submit
  // ----------------------------------------------------------

  form.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();


      // Login required
      if (!currentUser) {

        const nextParams =
          new URLSearchParams();


        nextParams.set(
          "reg",
          vehicle.regNo
        );


        if (pickupInput.value) {

          nextParams.set(
            "pickup",
            pickupInput.value
          );

        }


        if (dropInput.value) {

          nextParams.set(
            "drop",
            dropInput.value
          );

        }


        const next =
          `booking.html?${nextParams.toString()}`;


        window.location.href =
          `index.html?next=${encodeURIComponent(next)}`;


        return;
      }


      const calculation =
        calculateBooking();


      if (!calculation) {
        return;
      }


      const submitButton =
        form.querySelector(
          'button[type="submit"]'
        );


      submitButton.disabled = true;


      statusEl.textContent =
        "Creating your booking...";


      statusEl.classList.remove(
        "form-status--error"
      );


      try {

        const userSnapshot =
          await getDoc(
            doc(
              db,
              "users",
              currentUser.uid
            )
          );


        const userData =
          userSnapshot.exists()
            ? userSnapshot.data()
            : {};


        let bookingRef;

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const numericBookingId = generateNumericBookingId();
          const candidateRef = doc(
            collection(db, "bookings"),
            numericBookingId
          );
          const candidateSnapshot = await getDoc(candidateRef);

          if (!candidateSnapshot.exists()) {
            bookingRef = candidateRef;
            break;
          }
        }

        if (!bookingRef) {
          throw new Error("Could not generate a unique booking number. Please try again.");
        }

        await setDoc(
          bookingRef,
          {

              bookingNumber:
                bookingRef.id,

              userId:
                currentUser.uid,

              userName:
                userData.name ||
                currentUser.displayName ||
                currentUser.email,

              userEmail:
                currentUser.email,

              userPhone:
                userData.phone ||
                null,

              vehicleReg:
                vehicle.regNo,

              vehicleName:
                `${vehicle.brand} ${vehicle.model}`,

              vehicleCategory:
                vehicle.category,

              vehicleIcon: "",

              pickupDate:
                pickupInput.value,

              dropDate:
                dropInput.value,

              days:
                calculation.days,

              hours:
                calculation.hours,

              withDriver:
                calculation.withDriver,

              dayRate:
                vehicle.priceDay,

              hourlyRate:
                calculation.hourlyRate,

              driverRate:
                vehicle.driverPrice,

              driverHourlyRate:
                calculation.driverHourlyRate,

              securityDeposit:
                vehicle.securityDeposit,

              totalAmount:
                calculation.total,

              paymentPlan:
                calculation.paymentPlan,

              paymentAmount:
                calculation.paymentAmount,

              remainingBalance:
                calculation.remainingBalance,

              location:
                vehicle.location,

              status:
                "pending_payment",

              paymentStatus:
                "unpaid",

              paymentRef:
                null,

              createdAt:
                serverTimestamp(),
          }
        );


        // Preserve booking dates when moving to payment.
        const paymentParams =
          new URLSearchParams();

        paymentParams.set(
          "booking",
          bookingRef.id
        );


        window.location.href =
          `payment.html?${paymentParams.toString()}`;


      } catch (error) {

        console.error(
          "Booking creation failed:",
          error
        );


        statusEl.textContent =
          error?.message ||
          "Couldn't create the booking. Please try again.";


        statusEl.classList.add(
          "form-status--error"
        );


        submitButton.disabled =
          false;
      }

    }
  );

}
