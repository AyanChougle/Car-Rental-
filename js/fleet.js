"use strict";

import { db } from "./firebase-init.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import "./nav-helper.js";

// Fleet page: card rendering, searching, filtering,
// sorting, expandable specifications and navigation.

const search = document.getElementById("search");
const sort = document.getElementById("sort");

const chips = [...document.querySelectorAll(".chip")];
const grid = document.getElementById("fleetGrid");
const fleetEmptyState = document.getElementById("fleetEmptyState");
const clearFleetFiltersBtn = document.getElementById("clearFleetFilters");

const state = {
  activeCategory: "all",
};

function formatCurrency(value) {
  const amount = Number(value) || 0;

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amount);
}

function getVehicleBodyType(vehicle) {
  const cat = (vehicle.category || "").toLowerCase();
  const model = (vehicle.model || "").toLowerCase();
  const brand = (vehicle.brand || "").toLowerCase();
  const slug = (vehicle.slug || "").toLowerCase();

  if (cat === "luxury") return "luxury";
  if (cat === "mpv" || /innova|ertiga|carens|xl6|carnival|rumion|triber/.test(model + " " + slug)) return "mpv";
  if (cat === "suv" || /7xo|scorpio|thar|creta|seltos|fortuner|brezza|nexon|harrier|xuv|safari|venue|sonet|grand vitara|hyryder|taigun|kushaq|punch|exter/.test(model + " " + slug)) return "suv";
  if (/altroz|swift|baleno|i20|tiago|wagonr|ignis|polo|glanza|c3|kwid/.test(model + " " + slug)) return "hatchback";
  if (/city|verna|ciaz|dzire|amaze|slavia|virtus|aura|tigor/.test(model + " " + slug)) return "sedan";
  return cat || "sedan";
}

function renderFleetCards(records) {
  if (!Array.isArray(records) || records.length === 0) {
    grid.innerHTML = `
      <div class="fleet-grid__placeholder">
        No vehicles found.
      </div>
    `;

    grid.setAttribute("aria-busy", "false");
    return;
  }

  grid.innerHTML = records
    .map((vehicle, index) => {
      const vehicleName = `${vehicle.brand} ${vehicle.model}`;
      const imagePath = vehicle.imageUrl || window.fleetImagePath(vehicle);
      const isAvailable = Boolean(vehicle.available);
      const availabilityLabel = isAvailable
        ? "Available"
        : "Booked";

      const availabilityClass = isAvailable
        ? "available"
        : "booked";

      const bodyType = getVehicleBodyType(vehicle);
      const detailsId = `fleet-card-details-${index}`;

      return `
        <article
          class="fleet-card fleet-card--compact"
          data-reg="${vehicle.regNo}"
          data-category="${vehicle.category}"
          data-bodytype="${bodyType}"
          data-price="${vehicle.priceDay}"
          data-seats="${vehicle.seats}"
          data-name="${vehicleName}"
          data-transmission="${vehicle.transmission}"
          data-fuel="${vehicle.fuel}"
          data-index="${index}"
        >
          <div class="fleet-card__image">
            <img
              src="${imagePath}"
              alt="${vehicleName}"
              loading="lazy"
              decoding="async"
              onload="this.parentElement.classList.add('has-loaded-image')"
              onerror="this.onerror=null; this.style.opacity='0.4';"
            />

            <span
              class="fleet-card__icon"
              aria-hidden="true"
            >
            </span>

            <span
              class="fleet-card__dot ${availabilityClass}"
              title="${availabilityLabel}"
              aria-label="${availabilityLabel}"
            ></span>
          </div>

          <div class="fleet-card__body">
            <!-- Vehicle name and price -->
            <div class="fleet-card__header">
              <div class="fleet-card__heading">
                <span
                  class="fleet-card__availability ${availabilityClass}"
                >
                  ${availabilityLabel}
                </span>
                <h3>${vehicleName}</h3>

                <div class="fleet-card__subline">
                  ${vehicle.year}
                  <span aria-hidden="true">•</span>
                  ${vehicle.category}
                </div>
              </div>

              <div class="fleet-card__main-price">
                <strong>
                  ₹${formatCurrency(vehicle.priceHour)}
                </strong>

                <span>/Hour</span>
              </div>
            </div>

            <!-- Transmission, fuel and seats -->
            <div class="fleet-card__chips">
              <span class="chip-sm">
                ${vehicle.transmission}
              </span>

              <span class="chip-sm">
                ${vehicle.fuel}
              </span>

              <span class="chip-sm">
                ${vehicle.seats} Seats
              </span>
            </div>

            <!-- Book Now and Show More -->
            <div class="fleet-card__main-actions">
              <button
                class="fleet-book-btn"
                type="button"
                data-id="${vehicle.id || vehicle.slug}"
                data-reg="${vehicle.regNo || vehicle.id || vehicle.slug}"
                data-name="${vehicleName}"
                ${isAvailable ? "" : "disabled"}
              >
                ${isAvailable ? "Book Now" : "Unavailable"}
              </button>

              <button
                class="fleet-card__more-toggle"
                type="button"
                aria-expanded="false"
                aria-controls="${detailsId}"
              >
                <span class="fleet-card__more-label">
                  Show More
                </span>

                <span
                  class="fleet-card__chevron"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="m6 9 6 6 6-6"></path>
                  </svg>
                </span>
              </button>
            </div>

            <!-- Expandable area -->
            <div
              class="fleet-card__details"
              id="${detailsId}"
              hidden
            >
              <div class="fleet-specs">
                <div>
                  <strong>Per Hour</strong>
                  <span>
                    ₹${formatCurrency(vehicle.priceHour)}
                  </span>
                </div>

                <div>
                  <strong>Per Day</strong>
                  <span>
                    ₹${formatCurrency(vehicle.priceDay)}
                  </span>
                </div>

                <div>
                  <strong>Driver</strong>
                  <span>
                    ₹${formatCurrency(vehicle.driverPriceHour || Number(vehicle.driverPrice || 0) / 24)}
                  </span>
                </div>

                <div>
                  <strong>Deposit</strong>
                  <span>
                    ₹${formatCurrency(vehicle.securityDeposit || 5000)}
                  </span>
                </div>

                <div>
                  <strong>Free Distance</strong>
                  <span>
                    ${formatCurrency(vehicle.freeKm || 200)} km
                  </span>
                </div>

                <div>
                  <strong>Extra Distance</strong>
                  <span>
                    ₹${formatCurrency(vehicle.extraKm || 12)}/km
                  </span>
                </div>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  grid.setAttribute("aria-busy", "false");
}

function getCards() {
  return [...grid.querySelectorAll(".fleet-card")];
}

function applyFilters() {
  const query = search ? search.value.trim().toLowerCase() : "";

  const selectedTransmissions = [...document.querySelectorAll('input[name="filterTransmission"]:checked')].map((el) => el.value.toLowerCase());
  const selectedFuels = [...document.querySelectorAll('input[name="filterFuel"]:checked')].map((el) => el.value.toLowerCase());
  const selectedBodyTypes = [...document.querySelectorAll('input[name="filterBodyType"]:checked')].map((el) => el.value.toLowerCase());
  const selectedSeats = [...document.querySelectorAll('input[name="filterSeats"]:checked')].map((el) => el.value);

  const activeCount = selectedTransmissions.length + selectedFuels.length + selectedBodyTypes.length + selectedSeats.length;
  const badge = document.getElementById("filterActiveBadge");
  if (badge) {
    badge.textContent = activeCount;
    badge.hidden = activeCount === 0;
  }

  getCards().forEach((card) => {
    const name = (card.dataset.name || "").toLowerCase();
    const category = (card.dataset.category || "").toLowerCase();
    const transmission = (card.dataset.transmission || "").toLowerCase();
    const fuel = (card.dataset.fuel || "").toLowerCase();
    const bodyType = (card.dataset.bodytype || category).toLowerCase();
    const seats = Number(card.dataset.seats) || 5;

    // Transmission Filter
    let matchesTransmission = true;
    if (selectedTransmissions.length > 0) {
      matchesTransmission = selectedTransmissions.some((t) => {
        if (t === "automatic") return transmission.includes("auto") || transmission.includes("amt");
        if (t === "manual") return transmission.includes("man");
        return transmission.includes(t);
      });
    }

    // Fuel Filter
    let matchesFuel = true;
    if (selectedFuels.length > 0) {
      matchesFuel = selectedFuels.some((f) => fuel.includes(f));
    }

    // Body Type Filter
    let matchesBodyType = true;
    if (selectedBodyTypes.length > 0) {
      matchesBodyType = selectedBodyTypes.includes(bodyType) || selectedBodyTypes.includes(category);
    }

    // Seating Capacity Filter
    let matchesSeats = true;
    if (selectedSeats.length > 0) {
      matchesSeats = selectedSeats.some((s) => {
        if (s === "5") return seats <= 5;
        if (s === "7") return seats >= 7;
        return seats === Number(s);
      });
    }

    // Search Query
    const searchableContent = [
      name,
      category,
      bodyType,
      transmission,
      fuel,
      card.textContent.toLowerCase(),
    ];
    const matchesSearch = !query || searchableContent.some((value) => value.includes(query));

    const isMatch = Boolean(
      matchesBodyType &&
      matchesTransmission &&
      matchesFuel &&
      matchesSeats &&
      matchesSearch,
    );

    card.classList.toggle("hidden", !isMatch);
    card.hidden = !isMatch;
  });

  // Nothing survived the filters — show the empty state
  const anyVisible = getCards().some(
    (card) => !card.classList.contains("hidden") && !card.hidden,
  );

  if (fleetEmptyState) {
    fleetEmptyState.classList.toggle("hidden", anyVisible);
    fleetEmptyState.hidden = anyVisible;
  }
  grid.classList.toggle("hidden", !anyVisible);
  grid.hidden = !anyVisible;

  sortCards();
}

function sortCards() {
  const cards = getCards();

  const visibleCards = cards.filter(
    (card) => !card.classList.contains("hidden"),
  );

  const hiddenCards = cards.filter((card) => card.classList.contains("hidden"));

  const mode = sort.value;

  visibleCards.sort((firstCard, secondCard) => {
    const firstPrice = Number(firstCard.dataset.price);
    const secondPrice = Number(secondCard.dataset.price);
    const firstIndex = Number(firstCard.dataset.index || 0);
    const secondIndex = Number(secondCard.dataset.index || 0);

    if (mode === "price-asc") {
      return firstPrice - secondPrice;
    }

    if (mode === "price-desc") {
      return secondPrice - firstPrice;
    }

    // Default & "recommended": Sort by original vehicle list order!
    return firstIndex - secondIndex;
  });

  [...visibleCards, ...hiddenCards].forEach((card) => {
    grid.appendChild(card);
  });
}

if (search) search.addEventListener("input", applyFilters);

if (sort) {
  sort.addEventListener("change", () => {
    if (typeof updateSortDropdown === "function") {
      updateSortDropdown(sort.value);
    }
    sortCards();
  });
}

// Checkbox Filter Change Listeners
document.querySelectorAll(".filter-check-input").forEach((chk) => {
  chk.addEventListener("change", applyFilters);
});

// Sidebar drawer open/close
const mobileFilterToggle = document.getElementById("mobileFilterToggle");
const fleetSidebar = document.getElementById("fleetSidebar");
const fleetSidebarBackdrop = document.getElementById("fleetSidebarBackdrop");
const applyMobileFiltersBtn = document.getElementById("applyMobileFiltersBtn");
const resetSidebarFilters = document.getElementById("resetSidebarFilters");

function openSidebar() {
  if (fleetSidebar) fleetSidebar.classList.add("is-open");
  if (fleetSidebarBackdrop) fleetSidebarBackdrop.classList.add("is-open");
}

function closeSidebar() {
  if (fleetSidebar) fleetSidebar.classList.remove("is-open");
  if (fleetSidebarBackdrop) fleetSidebarBackdrop.classList.remove("is-open");
}

if (mobileFilterToggle) mobileFilterToggle.addEventListener("click", openSidebar);
if (fleetSidebarBackdrop) fleetSidebarBackdrop.addEventListener("click", closeSidebar);
if (applyMobileFiltersBtn) {
  applyMobileFiltersBtn.addEventListener("click", () => {
    applyFilters();
    closeSidebar();
  });
}

function resetAllFilters() {
  document.querySelectorAll(".filter-check-input").forEach((chk) => (chk.checked = false));
  if (search) search.value = "";
  applyFilters();
}

if (resetSidebarFilters) resetSidebarFilters.addEventListener("click", resetAllFilters);
if (clearFleetFiltersBtn) clearFleetFiltersBtn.addEventListener("click", resetAllFilters);

// Card button handling.
grid.addEventListener("click", (event) => {
  const moreToggle = event.target.closest(".fleet-specs-btn, .fleet-card__more-toggle");

  const galleryButton = event.target.closest(".fleet-card__gallery-link");

  const bookButton = event.target.closest(".fleet-book-btn");

  if (moreToggle) {
    const card = moreToggle.closest(".fleet-card");
    const detailsId = moreToggle.getAttribute("aria-controls");
    const details = document.getElementById(detailsId);

    if (!card || !details) return;

    const isExpanded = moreToggle.getAttribute("aria-expanded") === "true";
    details.hidden = isExpanded;
    card.classList.toggle("is-expanded", !isExpanded);
    moreToggle.setAttribute("aria-expanded", String(!isExpanded));
    return;
  }

  if (galleryButton) {
    const registrationNumber =
      galleryButton.dataset.id ||
      galleryButton.dataset.reg ||
      galleryButton.dataset.name;

    if (!registrationNumber) {
      return;
    }

    window.location.href = `vehicle.html?id=${encodeURIComponent(
      registrationNumber,
    )}`;

    return;
  }

  if (bookButton && !bookButton.disabled) {
    const registrationNumber =
      bookButton.dataset.id ||
      bookButton.dataset.reg ||
      bookButton.dataset.name;

    if (!registrationNumber) {
      return;
    }

    window.location.href = `booking.html?id=${encodeURIComponent(
      registrationNumber,
    )}${bookingDateParams()}`;
  }
});

// Carries ?pickup= / ?drop= dates from the homepage quick-book widget
// through to booking.html, so picking dates there isn't a dead end. Falls
// back to sessionStorage so the dates survive a click into vehicle.html
// and back without being re-typed into the URL.
function bookingDateParams() {
  const params = new URLSearchParams(window.location.search);
  let pickup = params.get("pickup");
  let drop = params.get("drop");

  if (pickup && drop) {
    try {
      sessionStorage.setItem("crp_pickupDate", pickup);
      sessionStorage.setItem("crp_dropDate", drop);
    } catch (e) {
      // sessionStorage unavailable (private browsing etc.) — fine, just skip caching
    }
  } else {
    try {
      pickup = pickup || sessionStorage.getItem("crp_pickupDate");
      drop = drop || sessionStorage.getItem("crp_dropDate");
    } catch (e) {
      // ignore
    }
  }

  if (!pickup || !drop) return "";
  return `&pickup=${encodeURIComponent(pickup)}&drop=${encodeURIComponent(drop)}`;
}

async function applyFleetAvailabilityOverrides() {
  try {
    const snapshot = await getDocs(collection(db, "vehicles"));
    const overrides = new Map(
      snapshot.docs.map((item) => [item.id, item.data()]),
    );

    const catalog = window.fleetVehicles || [];
    const catalogRegistrations = new Set(
      catalog.map((vehicle) => vehicle.regNo),
    );

    catalog.forEach((vehicle) => {
      const override = overrides.get(vehicle.regNo);
      if (override?.removed) {
        vehicle.removed = true;
      } else if (override) {
        Object.assign(vehicle, override);
        if (typeof override.available === "boolean") {
          vehicle.available = override.available ? 1 : 0;
          vehicle.status = override.available ? "available" : "unavailable";
        }
      }
    });

    snapshot.docs
      .map((item) => ({ regNo: item.id, ...item.data() }))
      .filter(
        (vehicle) =>
          vehicle.isCustomFleet &&
          !vehicle.removed &&
          !catalogRegistrations.has(vehicle.regNo),
      )
      .forEach((vehicle) => catalog.push(vehicle));

    window.fleetVehicles = catalog.filter((vehicle) => !vehicle.removed);
  } catch (error) {
    console.warn("Could not load fleet availability overrides:", error);
  }
}

// Render the catalog immediately — it's already available from vehicles.js,
// no need to wait on a network call for it. Live availability overrides
// (from Firestore) are layered on top afterward and re-render the grid if
// they succeed; if that call is slow, blocked by security rules, or fails
// outright, the fleet is still visible instead of stuck on "Loading fleet...".
renderFleetCards(window.fleetVehicles || []);
applyFilters();

applyFleetAvailabilityOverrides().then(() => {
  renderFleetCards(window.fleetVehicles || []);
  applyFilters();
});
/* =========================================================
   CUSTOM SORT DROPDOWN
   ========================================================= */

const sortDropdown = document.getElementById("sortDropdown");
const sortDropdownButton = document.getElementById("sortDropdownButton");
const sortDropdownLabel = document.getElementById("sortDropdownLabel");
const sortDropdownMenu = document.getElementById("sortDropdownMenu");

const sortOptions = [
  ...document.querySelectorAll(".fleet-custom-select__option"),
];

function closeSortDropdown() {
  if (!sortDropdown || !sortDropdownButton) {
    return;
  }

  sortDropdown.classList.remove("is-open");
  sortDropdownButton.setAttribute("aria-expanded", "false");
}

function openSortDropdown() {
  if (!sortDropdown || !sortDropdownButton) {
    return;
  }

  sortDropdown.classList.add("is-open");
  sortDropdownButton.setAttribute("aria-expanded", "true");
}

function updateSortDropdown(value) {
  const selectedOption = sortOptions.find(
    (option) => option.dataset.value === value,
  );

  if (!selectedOption) {
    return;
  }

  const label = selectedOption.querySelector("span");

  if (label && sortDropdownLabel) {
    sortDropdownLabel.textContent = label.textContent.trim();
  }

  sortOptions.forEach((option) => {
    const isSelected = option.dataset.value === value;

    option.classList.toggle("is-selected", isSelected);

    option.setAttribute("aria-selected", String(isSelected));
  });
}

if (sortDropdown && sortDropdownButton && sortDropdownMenu) {
  sortDropdownButton.addEventListener("click", (event) => {
    event.stopPropagation();

    const isOpen = sortDropdown.classList.contains("is-open");

    if (isOpen) {
      closeSortDropdown();
    } else {
      openSortDropdown();
    }
  });

  sortOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const value = option.dataset.value;

      if (!value) {
        return;
      }

      /*
       * Update the real select.
       * The existing fleet.js sorting code continues
       * to work without being rewritten.
       */
      sort.value = value;

      updateSortDropdown(value);

      closeSortDropdown();

      /*
       * Trigger the existing sort handler.
       */
      sort.dispatchEvent(
        new Event("change", {
          bubbles: true,
        }),
      );
    });
  });

  document.addEventListener("click", (event) => {
    if (!sortDropdown.contains(event.target)) {
      closeSortDropdown();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSortDropdown();
    }
  });

  updateSortDropdown(sort.value);
}
