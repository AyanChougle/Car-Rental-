// Vehicle detail page: pulls the vehicle from js/vehicles.js by ?reg= or ?id=,
// fills in specs, and drives the 7-angle scroll gallery.
(async function () {
	"use strict";

	const params = new URLSearchParams(window.location.search);
	let query = params.get("id") || params.get("car") || params.get("reg") || params.get("vehicle");
	if (query === "undefined" || query === "null" || query === "") query = null;

	if (window.fleetLoadingPromise) {
		try {
			await window.fleetLoadingPromise;
		} catch (_) {}
	}

	let catalog = window.fleetVehicles || [];
	let vehicle = (typeof window.getFleetVehicle === "function" && window.getFleetVehicle(query)) ||
		catalog.find((v) =>
			(query && (String(v.id) === String(query) || v.slug === query || v.regNo === query || v.carId === query)) ||
			(query && `${v.brand} ${v.model}`.toLowerCase() === query.toLowerCase())
		);

	if (!vehicle) {
		try {
			const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
			const apiBase = localStorage.getItem("kruizly_api_url") || (isLocal ? "https://kruizly.com/api" : "/api");
			const res = await fetch(`${apiBase}/vehicles`);
			if (res.ok) {
				const json = await res.json();
				if (json.success && Array.isArray(json.vehicles)) {
					window.fleetVehicles = json.vehicles;
					catalog = json.vehicles;
					vehicle = (typeof window.getFleetVehicle === "function" && window.getFleetVehicle(query)) ||
						catalog.find((v) =>
							(query && (String(v.id) === String(query) || v.slug === query || v.regNo === query || v.carId === query)) ||
							(query && `${v.brand} ${v.model}`.toLowerCase() === query.toLowerCase())
						) || catalog[0];
				}
			}
		} catch (e) {
			console.error("Error fetching vehicle details:", e);
		}
	}

	const nameEl = document.getElementById("vehicleName");

	if (!vehicle) {
		if (nameEl) nameEl.textContent = "Vehicle not found";
		const catEl = document.getElementById("vehicleCategory");
		if (catEl) catEl.textContent = "Try the fleet page instead";
		return;
	}

	const isLuxury = (vehicle.category || "").toLowerCase() === "luxury";
	const depositAmount = vehicle.securityDeposit || (isLuxury ? 15000 : 3000);
	const extraKmAmount = vehicle.extraKm || (isLuxury ? 30 : 12);

	const ANGLES = ["Front", "Front 3/4", "Side Profile", "Rear 3/4", "Rear", "Interior", "Detail"];

	function formatCurrency(value) {
		return new Intl.NumberFormat("en-IN").format(value);
	}

	// ---- header + specs ----
	document.title = `${vehicle.brand} ${vehicle.model} | KRUIZLY`;
	const catEl = document.getElementById("vehicleCategory");
	if (catEl) {
		catEl.textContent = isLuxury ? "KRUIZLY Luxury & Performance" : `KRUIZLY Main — ${(vehicle.category || "Standard").toUpperCase()}`;
	}
	nameEl.textContent = `${vehicle.brand} ${vehicle.model}`;
	document.getElementById("vehicleMetaRow").innerHTML = `
		<span>${vehicle.transmission}</span>
		<span>${vehicle.fuel}</span>
		<span>${vehicle.seats} Seats</span>
		<span>${vehicle.bags || 2} Bags</span>
	`;
	document.getElementById("vehiclePrice").textContent = `₹${formatCurrency(vehicle.priceDay)}/day`;

	const bookBtn = document.getElementById("vehicleBookBtn");
	if (vehicle.available) {
		const vIdentifier = vehicle.id || vehicle.slug || vehicle.regNo;
		bookBtn.href = `booking.html?id=${encodeURIComponent(vIdentifier)}`;
		bookBtn.addEventListener("click", () => {
			try {
				sessionStorage.setItem("crp_selectedCarId", vIdentifier);
				localStorage.setItem("crp_selectedCarId", vIdentifier);
			} catch (_) {}
		});
	} else {
		bookBtn.textContent = "Currently Unavailable";
		bookBtn.classList.remove("btn-dark");
		bookBtn.classList.add("btn-outline");
		bookBtn.setAttribute("aria-disabled", "true");
		bookBtn.addEventListener("click", (e) => e.preventDefault());
	}

	const specEntries = [
		["Day rate", `₹${formatCurrency(vehicle.priceDay)}`],
		["Hour rate", `₹${formatCurrency(vehicle.priceHour || Math.round(vehicle.priceDay / 24))}`],
		["With driver", `₹${formatCurrency(vehicle.driverPrice || 2000)}`],
		["Deposit", `₹${formatCurrency(depositAmount)}`],
		["Free km/day", `${vehicle.freeKm || 200} km`],
		["Extra km", `₹${formatCurrency(extraKmAmount)}/km`],
		["Fuel", vehicle.fuel || "Petrol"],
		["Bags", `${vehicle.bags || 2}`],
		["Location", vehicle.location || "Gavson Business Park, Ghansoli"],
		["Odometer", vehicle.odometer || "—"],
		["Last service", vehicle.lastService || "—"],
		["Live tracking", vehicle.tracking || "Active"],
		["Status", vehicle.available ? "Available" : "Booked"],
	];
	document.getElementById("vehicleSpecs").innerHTML = specEntries
		.map(([label, value]) => `<div><strong>${label}</strong><span>${value}</span></div>`)
		.join("");

	// ---- gallery ----
	const galleryEl = document.getElementById("vehicleGallery");
	const stage = document.getElementById("galleryStage");
	const progressEl = document.getElementById("galleryProgress");
	const labelEl = document.getElementById("galleryLabel");

	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	// Real photos: one confirmed hero shot per model (assets/fleet/, resolved
	// by the shared fleetImagePath() helper in vehicles.js) is used for the
	// "Front" slot. The other 6 angles fall back to a themed placeholder
	// until per-angle shots exist at assets/fleet/{regNo}/{n}-{angle}.jpg —
	// the placeholder is honest rather than repeating the one real photo
	// seven times and pretending it's a full rotation.
	const slots = ANGLES.map((angle, i) => {
		if (i === 0) {
			return { angle, src: window.fleetImagePath ? window.fleetImagePath(vehicle) : "" };
		}
		const slug = angle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
		return { angle, src: `assets/fleet/${vehicle.regNo}/${i + 1}-${slug}.jpg` };
	});

	function buildShotEl(slot, index) {
		const wrap = document.createElement("div");
		wrap.className = "vehicle-gallery__shot";
		wrap.dataset.index = String(index);

		const img = document.createElement("img");
		img.alt = `${vehicle.brand} ${vehicle.model} — ${slot.angle}`;
		img.src = slot.src;
		img.loading = index === 0 ? "eager" : "lazy";

		img.addEventListener("error", () => {
			wrap.classList.add("vehicle-gallery__shot--placeholder");
			img.remove();
			const icon = document.createElement("span");
			icon.className = "vehicle-gallery__icon";
			icon.textContent = "KR";
			const tag = document.createElement("span");
			tag.className = "vehicle-gallery__tag";
			tag.textContent = slot.angle;
			wrap.append(icon, tag);
		});

		wrap.appendChild(img);
		return wrap;
	}

	slots.forEach((slot, i) => stage.appendChild(buildShotEl(slot, i)));
	const shotEls = [...stage.children];

	const dotEls = ANGLES.map((angle, i) => {
		const dot = document.createElement("button");
		dot.type = "button";
		dot.className = "vehicle-gallery__dot";
		dot.setAttribute("aria-label", `Show ${angle} view`);
		dot.addEventListener("click", () => goToIndex(i));
		progressEl.appendChild(dot);
		return dot;
	});

	let activeIndex = -1;
	function setActive(index) {
		if (index === activeIndex) return;
		activeIndex = index;
		shotEls.forEach((el, i) => el.classList.toggle("is-active", i === index));
		dotEls.forEach((el, i) => el.classList.toggle("is-active", i === index));
		labelEl.textContent = ANGLES[index];
	}
	setActive(0);

	function goToIndex(index) {
		if (reducedMotion) {
			setActive(index);
			return;
		}
		const rect = galleryEl.getBoundingClientRect();
		const total = galleryEl.offsetHeight - window.innerHeight;
		const targetY = window.scrollY + rect.top + (total * index) / (ANGLES.length - 1);
		window.scrollTo({ top: targetY, behavior: "smooth" });
	}

	if (reducedMotion) {
		// Static strip: no scroll-jacking, just click/keyboard through the dots.
		galleryEl.classList.add("vehicle-gallery--static");
		return;
	}

	let ticking = false;
	function onScroll() {
		if (ticking) return;
		ticking = true;
		requestAnimationFrame(() => {
			const rect = galleryEl.getBoundingClientRect();
			const total = galleryEl.offsetHeight - window.innerHeight;
			const scrolled = -rect.top;
			const fraction = total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : 0;
			const index = Math.min(ANGLES.length - 1, Math.round(fraction * (ANGLES.length - 1)));
			setActive(index);
			ticking = false;
		});
	}

	const io = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					window.addEventListener("scroll", onScroll, { passive: true });
					onScroll();
				} else {
					window.removeEventListener("scroll", onScroll);
				}
			});
		},
		{ threshold: 0 }
	);
	io.observe(galleryEl);
})();
