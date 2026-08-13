// ============================================================
// CARRENTPE — BOOKING PAGE
// ============================================================

import { auth, db } from "./firebase-init.js";

import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import "./nav-helper.js";

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


  driverRate.textContent =
    `₹${formatCurrency(vehicle.driverPrice)}`;


  deposit.textContent =
    `₹${formatCurrency(vehicle.securityDeposit)}`;


  location.textContent =
    vehicle.location || "Gavson Business Park, Ghansoli";


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


  const today =
    todayISO();


  pickupInput.min = today;

  dropInput.min = today;

  pickupInput.value = today;


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
    prefillPickup >= today
  ) {

    pickupInput.value =
      prefillPickup;

    dropInput.min =
      prefillPickup;
  }


  if (
    prefillDrop &&
    prefillDrop > pickupInput.value
  ) {

    dropInput.value =
      prefillDrop;
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
      new Date(`${pickup}T00:00:00`);

    const dropDate =
      new Date(`${drop}T00:00:00`);


    const millisecondsPerDay =
      1000 * 60 * 60 * 24;


    const days =
      Math.round(
        (dropDate - pickupDate) /
        millisecondsPerDay
      );


    if (days <= 0) {

      totalsEl.innerHTML = `
        <div class="booking-error">
          Drop date must be after the pickup date.
        </div>
      `;

      return null;
    }


    const withDriver =
      driverInput.checked;


    const rentalTotal =
      days * Number(vehicle.priceDay || 0);


    const driverTotal =
      withDriver
        ? days * Number(vehicle.driverPrice || 0)
        : 0;


    const securityDeposit =
      Number(vehicle.securityDeposit || 0);


    const total =
      rentalTotal +
      driverTotal +
      securityDeposit;


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
          <small>Refundable</small>
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
    `;


    return {
      days,
      withDriver,
      rentalTotal,
      driverTotal,
      securityDeposit,
      total,
    };
  }


  // ----------------------------------------------------------
  // Events
  // ----------------------------------------------------------

  pickupInput.addEventListener(
    "change",
    () => {

      dropInput.min =
        pickupInput.value;

      if (
        dropInput.value &&
        dropInput.value <= pickupInput.value
      ) {

        dropInput.value = "";

      }

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
            <strong>Driving licence</strong>

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


        const bookingRef =
          await addDoc(
            collection(db, "bookings"),
            {

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

              vehicleIcon:
                vehicle.icon ||
                "🚗",

              pickupDate:
                pickupInput.value,

              dropDate:
                dropInput.value,

              days:
                calculation.days,

              withDriver:
                calculation.withDriver,

              dayRate:
                vehicle.priceDay,

              driverRate:
                vehicle.driverPrice,

              securityDeposit:
                vehicle.securityDeposit,

              totalAmount:
                calculation.total,

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