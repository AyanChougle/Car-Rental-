"use strict";

// Fleet page: card rendering, searching, filtering,
// sorting, expandable specifications and navigation.

const search = document.getElementById("search");
const sort = document.getElementById("sort");
const categorySelect = document.getElementById("categorySelect");
const chips = [...document.querySelectorAll(".chip")];
const grid = document.getElementById("fleetGrid");

const state = {
  activeCategory: "all",
};

function formatCurrency(value) {
  const amount = Number(value) || 0;

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amount);
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
      const imagePath = fleetImagePath(vehicle);
      const imageIcon =
        vehicle.icon ||
        categoryIcons?.[vehicle.category] ||
        "🚗";

      const isAvailable = Boolean(vehicle.available);
      const availabilityLabel = isAvailable
        ? "Available"
        : "Booked";

      const availabilityClass = isAvailable
        ? "available"
        : "booked";

      const detailsId = `fleet-card-details-${index}`;

      return `
        <article
          class="fleet-card fleet-card--compact"
          data-reg="${vehicle.regNo}"
          data-category="${vehicle.category}"
          data-price="${vehicle.priceDay}"
          data-seats="${vehicle.seats}"
          data-name="${vehicleName}"
          data-transmission="${vehicle.transmission}"
          data-fuel="${vehicle.fuel}"
        >
          <div class="fleet-card__image">
            <img
              src="${imagePath}"
              alt="${vehicleName}"
              loading="lazy"
              decoding="async"
              onload="this.parentElement.classList.add('has-loaded-image')"
              onerror="this.remove(); this.parentElement.classList.add('has-image-error')"
            />

            <span
              class="fleet-card__icon"
              aria-hidden="true"
            >
              ${imageIcon}
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
                  ₹${formatCurrency(vehicle.priceDay)}
                </strong>

                <span>/day</span>
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
                data-reg="${vehicle.regNo}"
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
                  <strong>Per Day</strong>
                  <span>
                    ₹${formatCurrency(vehicle.priceDay)}
                  </span>
                </div>

                <div>
                  <strong>Per Hour</strong>
                  <span>
                    ₹${formatCurrency(vehicle.priceHour)}
                  </span>
                </div>

                <div>
                  <strong>Driver</strong>
                  <span>
                    ₹${formatCurrency(vehicle.driverPrice)}
                  </span>
                </div>

                <div>
                  <strong>Deposit</strong>
                  <span>
                    ₹${formatCurrency(vehicle.securityDeposit)}
                  </span>
                </div>

                <div>
                  <strong>Free Distance</strong>
                  <span>
                    ${formatCurrency(vehicle.freeKm)} km
                  </span>
                </div>

                <div>
                  <strong>Extra Distance</strong>
                  <span>
                    ₹${formatCurrency(vehicle.extraKm)}/km
                  </span>
                </div>
              </div>

      `;
    })
    .join("");

  grid.setAttribute("aria-busy", "false");
}

function getCards() {
  return [...grid.querySelectorAll(".fleet-card")];
}

function applyFilters() {
  const query = search.value.trim().toLowerCase();
  const selectedCategory = categorySelect.value;

  getCards().forEach((card) => {
    const name = card.dataset.name.toLowerCase();
    const category = card.dataset.category.toLowerCase();
    const transmission =
      card.dataset.transmission.toLowerCase();
    const fuel = card.dataset.fuel.toLowerCase();

    const matchesCategory =
      state.activeCategory === "all" ||
      category === state.activeCategory;

    const matchesSelect =
      selectedCategory === "all" ||
      category === selectedCategory;

    const searchableContent = [
      name,
      category,
      transmission,
      fuel,
      card.textContent.toLowerCase(),
    ];

    const matchesSearch =
      !query ||
      searchableContent.some((value) =>
        value.includes(query),
      );

    card.classList.toggle(
      "hidden",
      !(
        matchesCategory &&
        matchesSelect &&
        matchesSearch
      ),
    );
  });

  sortCards();
}

function sortCards() {
  const cards = getCards();

  const visibleCards = cards.filter(
    (card) => !card.classList.contains("hidden"),
  );

  const hiddenCards = cards.filter((card) =>
    card.classList.contains("hidden"),
  );

  const mode = sort.value;

  visibleCards.sort((firstCard, secondCard) => {
    const firstPrice = Number(firstCard.dataset.price);
    const secondPrice = Number(secondCard.dataset.price);
    const firstSeats = Number(firstCard.dataset.seats);
    const secondSeats = Number(secondCard.dataset.seats);

    if (mode === "price-asc") {
      return firstPrice - secondPrice;
    }

    if (mode === "price-desc") {
      return secondPrice - firstPrice;
    }

    if (mode === "seats-desc") {
      return secondSeats - firstSeats;
    }

    // Keep original vehicle order for Recommended.
    return 0;
  });

  [...visibleCards, ...hiddenCards].forEach((card) => {
    grid.appendChild(card);
  });
}

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chips.forEach((currentChip) => {
      currentChip.classList.remove("active");
      currentChip.setAttribute(
        "aria-pressed",
        "false",
      );
    });

    chip.classList.add("active");
    chip.setAttribute("aria-pressed", "true");

    state.activeCategory =
      chip.dataset.category || "all";

    categorySelect.value =
      state.activeCategory;

    applyFilters();
  });
});

search.addEventListener("input", applyFilters);

sort.addEventListener("change", sortCards);

categorySelect.addEventListener("change", () => {
  state.activeCategory = categorySelect.value;

  chips.forEach((chip) => {
    const isActive =
      chip.dataset.category === state.activeCategory;

    chip.classList.toggle("active", isActive);

    chip.setAttribute(
      "aria-pressed",
      String(isActive),
    );
  });

  applyFilters();
});

// Card button handling.
grid.addEventListener("click", (event) => {
  const moreToggle = event.target.closest(
    ".fleet-card__more-toggle",
  );

  const galleryButton = event.target.closest(
    ".fleet-card__gallery-link",
  );

  const bookButton = event.target.closest(
    ".fleet-book-btn",
  );

  if (moreToggle) {
    const card = moreToggle.closest(".fleet-card");

    const detailsId =
      moreToggle.getAttribute("aria-controls");

    const details =
      document.getElementById(detailsId);

    const label = moreToggle.querySelector(
      ".fleet-card__more-label",
    );

    if (!card || !details || !label) {
      return;
    }

    const isExpanded =
      moreToggle.getAttribute("aria-expanded") ===
      "true";

    if (isExpanded) {
      details.hidden = true;
      card.classList.remove("is-expanded");
      moreToggle.setAttribute(
        "aria-expanded",
        "false",
      );
      label.textContent = "Show More";
    } else {
      details.hidden = false;
      card.classList.add("is-expanded");
      moreToggle.setAttribute(
        "aria-expanded",
        "true",
      );
      label.textContent = "Show Less";
    }

    return;
  }

  if (galleryButton) {
    const registrationNumber =
      galleryButton.dataset.reg;

    if (!registrationNumber) {
      return;
    }

    window.location.href =
      `vehicle.html?reg=${encodeURIComponent(
        registrationNumber,
      )}`;

    return;
  }

  if (bookButton && !bookButton.disabled) {
    const registrationNumber =
      bookButton.dataset.reg;

    if (!registrationNumber) {
      return;
    }

    window.location.href =
      `booking.html?reg=${encodeURIComponent(
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

renderFleetCards(fleetVehicles);
applyFilters();