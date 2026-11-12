// Fleet catalog, generated from official Kruizly Excel Fleet Master
// Categories: economy (sedans & hatchbacks), suv, mpv, luxury.
// All driver rates: ₹2,000 / day.
// Loaded as a plain classic script (no bundler) so fleet.js, booking.js,
// and vehicle-gallery.js can reference fleetVehicles directly.

const DEFAULT_FLEET_VEHICLES = [];

let fleetVehicles = [];
window.fleetVehicles = fleetVehicles;
window.DEFAULT_FLEET_VEHICLES = DEFAULT_FLEET_VEHICLES;
window.fleetLoadError = null;

async function loadGlobalFleet() {
  try {
    const hubId = (typeof localStorage !== "undefined" && localStorage.getItem("kruizly_selected_hub_id")) || "";
    const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    const apiBase = (typeof localStorage !== "undefined" && localStorage.getItem("kruizly_api_url")) || (isLocal ? "https://kruizly.com/api" : "/api");
    const url = apiBase + "/vehicles" + (hubId ? "?hub_id=" + encodeURIComponent(hubId) : "");
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (res.ok && json && json.success && Array.isArray(json.vehicles)) {
      fleetVehicles.length = 0;
      json.vehicles.forEach(v => fleetVehicles.push(v));
      if (typeof window !== "undefined") {
        window.fleetLoadError = null;
        window.fleetVehicles = fleetVehicles;
      }
      return fleetVehicles;
    }
    fleetVehicles.length = 0;
    if (typeof window !== "undefined") {
      window.fleetLoadError = (json && json.error) || "Unable to load fleet vehicles from database.";
      window.fleetVehicles = fleetVehicles;
    }
    return fleetVehicles;
  } catch (err) {
    console.warn("API fleet fetch error:", err);
    fleetVehicles.length = 0;
    if (typeof window !== "undefined") {
      window.fleetLoadError = err?.message || "Unable to load fleet vehicles from database.";
      window.fleetVehicles = fleetVehicles;
    }
    return fleetVehicles;
  }
}

if (typeof window !== "undefined") {
  window.loadGlobalFleet = loadGlobalFleet;
  window.fleetLoadingPromise = loadGlobalFleet();
}



// Image path resolution: map vehicle brand + model to asset files.
const fleetImageOverrides = {
  // Maruti models
  "maruti swift": "assets/fleet/Maruti Suzuki Swift.png",
  "maruti suzuki swift": "assets/fleet/Maruti Suzuki Swift.png",
  "swift": "assets/fleet/Maruti Suzuki Swift.png",
  "swift vxi": "assets/fleet/Maruti Suzuki Swift.png",
  "swift vxi (o)": "assets/fleet/Maruti Suzuki Swift.png",
  "maruti swift vxi (o)": "assets/fleet/Maruti Suzuki Swift.png",
  "maruti suzuki swift vxi (o)": "assets/fleet/Maruti Suzuki Swift.png",
  "maruti baleno": "assets/fleet/Maruti Suzuki Baleno.png",
  "maruti suzuki baleno": "assets/fleet/Maruti Suzuki Baleno.png",
  "baleno": "assets/fleet/Maruti Suzuki Baleno.png",
  "maruti brezza": "assets/fleet/Maruti Suzuki Brezza.png",
  "maruti suzuki brezza": "assets/fleet/Maruti Suzuki Brezza.png",
  "brezza": "assets/fleet/Maruti Suzuki Brezza.png",
  "maruti dzire": "assets/fleet/Maruti Suzuki Dzire.png",
  "maruti suzuki dzire": "assets/fleet/Maruti Suzuki Dzire.png",
  "dzire": "assets/fleet/Maruti Suzuki Dzire.png",
  "dzire zxi+": "assets/fleet/Maruti Suzuki Dzire.png",
  "dzire zxi+ sunroof": "assets/fleet/Maruti Suzuki Dzire.png",
  "maruti dzire zxi+": "assets/fleet/Maruti Suzuki Dzire.png",
  "maruti suzuki dzire zxi+": "assets/fleet/Maruti Suzuki Dzire.png",
  "maruti ertiga": "assets/fleet/Maruti Suzuki Ertiga.png",
  "maruti suzuki ertiga": "assets/fleet/Maruti Suzuki Ertiga.png",
  "ertiga": "assets/fleet/Maruti Suzuki Ertiga.png",
  "ertiga hybrid": "assets/fleet/Maruti Suzuki Ertiga.png",
  "maruti ertiga hybrid": "assets/fleet/Maruti Suzuki Ertiga.png",
  "maruti suzuki ertiga hybrid": "assets/fleet/Maruti Suzuki Ertiga.png",
  "maruti fronx": "assets/fleet/Maruti Suzuki Fronx.png",
  "maruti suzuki fronx": "assets/fleet/Maruti Suzuki Fronx.png",
  "fronx": "assets/fleet/Maruti Suzuki Fronx.png",
  "maruti grand vitara": "assets/fleet/Maruti Suzuki Grand Vitara.png",
  "maruti suzuki grand vitara": "assets/fleet/Maruti Suzuki Grand Vitara.png",
  "grand vitara": "assets/fleet/Maruti Suzuki Grand Vitara.png",
  "maruti ignis": "assets/fleet/Maruti Suzuki Ignis.png",
  "maruti suzuki ignis": "assets/fleet/Maruti Suzuki Ignis.png",
  "ignis": "assets/fleet/Maruti Suzuki Ignis.png",
  "maruti wagon r": "assets/fleet/Maruti Suzuki WagonR.png",
  "maruti wagonr": "assets/fleet/Maruti Suzuki WagonR.png",
  "maruti suzuki wagon r": "assets/fleet/Maruti Suzuki WagonR.png",
  "maruti suzuki wagonr": "assets/fleet/Maruti Suzuki WagonR.png",
  "wagon r": "assets/fleet/Maruti Suzuki WagonR.png",
  "wagonr": "assets/fleet/Maruti Suzuki WagonR.png",
  "maruti xl6": "assets/fleet/Maruti Suzuki XL6.png",
  "maruti suzuki xl6": "assets/fleet/Maruti Suzuki XL6.png",
  "xl6": "assets/fleet/Maruti Suzuki XL6.png",

  // Hyundai models
  "hyundai exter": "assets/fleet/Hyundai Exter.png",
  "exter": "assets/fleet/Hyundai Exter.png",
  "hyundai aura": "assets/fleet/Hyundai Aura.png",
  "aura": "assets/fleet/Hyundai Aura.png",
  "hyundai creta": "assets/fleet/Hyundai Creta.png",
  "creta": "assets/fleet/Hyundai Creta.png",
  "hyundai i20": "assets/fleet/Hyundai i20.png",
  "i20": "assets/fleet/Hyundai i20.png",
  "hyundai verna": "assets/fleet/Hyundai Aura.png",
  "verna": "assets/fleet/Hyundai Aura.png",
  "hyundai venue": "assets/fleet/Hyundai Creta.png",
  "venue": "assets/fleet/Hyundai Creta.png",

  // Tata models
  "tata altroz": "assets/fleet/Tata Altroz.png",
  "altroz": "assets/fleet/Tata Altroz.png",
  "tata tigor": "assets/fleet/Tigor.jpg",
  "tigor": "assets/fleet/Tigor.jpg",
  "tata nexon": "assets/fleet/Tata Nexon.png",
  "nexon": "assets/fleet/Tata Nexon.png",
  "tata punch": "assets/fleet/Tata Punch.png",
  "punch": "assets/fleet/Tata Punch.png",
  "tata safari": "assets/fleet/Tata Safari.png",
  "safari": "assets/fleet/Tata Safari.png",
  "tata harrier": "assets/fleet/Tata Safari.png",
  "harrier": "assets/fleet/Tata Safari.png",

  // Mahindra models
  "mahindra 7xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra xuv 7xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra xuv7xo": "assets/fleet/Mahindra 7XO.png",
  "7xo": "assets/fleet/Mahindra 7XO.png",
  "xuv 7xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra 3xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra xuv 3xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra xuv3xo": "assets/fleet/Mahindra 7XO.png",
  "3xo": "assets/fleet/Mahindra 7XO.png",
  "xuv 3xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra xuv700": "assets/fleet/Mahindra XUV700.png",
  "xuv700": "assets/fleet/Mahindra XUV700.png",
  "mahindra xuv 700": "assets/fleet/Mahindra XUV700.png",
  "mahindra scorpio n": "assets/fleet/Mahindra Scorpio N.png",
  "scorpio n": "assets/fleet/Mahindra Scorpio N.png",
  "mahindra scorpio": "assets/fleet/Mahindra Scorpio N.png",
  "scorpio": "assets/fleet/Mahindra Scorpio N.png",
  "mahindra bolero neo": "assets/fleet/Mahindra Scorpio N.png",
  "bolero neo": "assets/fleet/Mahindra Scorpio N.png",
  "mahindra bolero": "assets/fleet/Mahindra Scorpio N.png",
  "bolero": "assets/fleet/Mahindra Scorpio N.png",
  "mahindra thar": "assets/fleet/Mahindra Thar.png",
  "thar": "assets/fleet/Mahindra Thar.png",
  "mahindra thar roxx": "assets/fleet/Mahindra Thar Roxx.png",  
  "thar roxx": "assets/fleet/Mahindra Thar Roxx.png",
  "thar roxx sunroof": "assets/fleet/Mahindra Thar Roxx.png",
  "mahindra xuv500": "assets/fleet/Mahindra XUV500.png",
  "xuv500": "assets/fleet/Mahindra XUV500.png",
  "mahindra xuv 500": "assets/fleet/Mahindra XUV500.png",

  // Toyota models
  "toyota glanza": "assets/fleet/Toyota Glanza.png",
  "glanza": "assets/fleet/Toyota Glanza.png",
  "toyota innova crysta": "assets/fleet/Toyota Innova Crysta.png",
  "innova crysta": "assets/fleet/Toyota Innova Crysta.png",
  "toyota innova hycross": "assets/fleet/Toyota Innova Crysta.png",
  "innova hycross": "assets/fleet/Toyota Innova Crysta.png",
  "toyota innova": "assets/fleet/Toyota Innova Crysta.png",
  "innova": "assets/fleet/Toyota Innova Crysta.png",
  "toyota rumion": "assets/fleet/Toyota Rumion.png",
  "rumion": "assets/fleet/Toyota Rumion.png",
  "toyota urban cruiser": "assets/fleet/Toyota Taisor.png",
  "toyota urban cruiser taisor": "assets/fleet/Toyota Taisor.png",
  "urban cruiser taisor": "assets/fleet/Toyota Taisor.png",
  "urban cruiser": "assets/fleet/Toyota Taisor.png",
  "toyota taisor": "assets/fleet/Toyota Taisor.png",
  "taisor": "assets/fleet/Toyota Taisor.png",
  "toyota fortuner legender": "assets/fleet/Toyota Fortuner.png",
  "fortuner legender": "assets/fleet/Toyota Fortuner.png",
  "toyota fortuner": "assets/fleet/Toyota Fortuner.png",
  "fortuner": "assets/fleet/Toyota Fortuner.png",

  // Kia models
  "kia seltos": "assets/fleet/Seltos.png",
  "seltos": "assets/fleet/Seltos.png",
  "seltos sunroof": "assets/fleet/Seltos.png",
  "kia seltos sunroof": "assets/fleet/Seltos.png",
  "kia sonet": "assets/fleet/Hyundai Creta.png",
  "sonet": "assets/fleet/Hyundai Creta.png",
  "kia carens": "assets/fleet/Kia Carens.png",
  "carens": "assets/fleet/Kia Carens.png",

  // Jeep models
  "jeep compass": "assets/fleet/Jeep Compass.png",
  "compass": "assets/fleet/Jeep Compass.png",
  "compass 4x4": "assets/fleet/Jeep Compass.png",
  "compass 4x4 sunroof": "assets/fleet/Jeep Compass.png",
  "jeep compass 4x4 sunroof": "assets/fleet/Jeep Compass.png",

  // BMW models
  "bmw 520d": "assets/fleet/BMW 520D.png",
  "520d": "assets/fleet/BMW 520D.png",
  "bmw m5": "assets/fleet/BMW.png",
  "m5": "assets/fleet/BMW.png",
  "bmw m5 modified": "assets/fleet/BMW.png",
  "m5 modified": "assets/fleet/BMW.png",
  "m5 modified sunroof": "assets/fleet/BMW.png",
  "bmw m5 modified sunroof": "assets/fleet/BMW.png",
  "bmw": "assets/fleet/BMW 520D.png",

  // MG models
  "mg hector": "assets/fleet/MG Hector.png",
  "mg hector plus": "assets/fleet/MG Hector.png",
  "hector": "assets/fleet/MG Hector.png",
  "mg": "assets/fleet/MG Hector.png",

  // Honda, Skoda, VW, Mercedes
  "honda amaze": "assets/fleet/Hyundai Aura.png",
  "amaze": "assets/fleet/Hyundai Aura.png",
  "honda city": "assets/fleet/Hyundai Aura.png",
  "city": "assets/fleet/Hyundai Aura.png",
  "skoda slavia": "assets/fleet/BMW 520D.png",
  "slavia": "assets/fleet/BMW 520D.png",
  "volkswagen virtus": "assets/fleet/BMW 520D.png",
  "virtus": "assets/fleet/BMW 520D.png",
  "mercedes": "assets/fleet/BMW 520D.png",
  "mercedes-benz": "assets/fleet/BMW 520D.png"
};

function findFleetImageOverride(key) {
  if (!key) return null;
  const clean = String(key).trim().toLowerCase().replace(/\s+/g, " ");
  if (fleetImageOverrides[clean]) return fleetImageOverrides[clean];
  const noSpace = clean.replace(/[\s\-_]+/g, "");
  for (const [k, v] of Object.entries(fleetImageOverrides)) {
    if (k.replace(/[\s\-_]+/g, "") === noSpace) return v;
  }
  return null;
}

function normalizeCustomUrl(url) {
  if (!url || typeof url !== "string") return null;
  const s = url.trim();
  if (!s) return null;
  if (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:") ||
    s.startsWith("blob:")
  ) {
    return s;
  }
  if (s.startsWith("api/") || s.startsWith("/api/")) {
    return s.startsWith("/") ? s : `/${s}`;
  }
  if (s.startsWith("uploads/") || s.startsWith("/uploads/")) {
    return s.startsWith("/") ? s : `/${s}`;
  }
  if (s.startsWith("assets/")) {
    return encodeURI(s);
  }
  return null;
}

function fleetImagePath(vehicle) {
  if (!vehicle) return "assets/fleet/BMW 520D.png";

  if (typeof vehicle === "string") {
    if (vehicle.startsWith("assets/fleet/")) {
      const baseName = vehicle.replace(/^assets\/fleet\//, "").replace(/\.(png|jpg|jpeg|webp|avif)$/i, "").trim();
      const ov = findFleetImageOverride(baseName);
      if (ov) return encodeURI(ov);
      return encodeURI(vehicle);
    }
    const custom = normalizeCustomUrl(vehicle);
    if (custom && !custom.includes("MED-") && !custom.includes("/api/media/")) return custom;
    const ov = findFleetImageOverride(vehicle);
    if (ov) return encodeURI(ov);
    return "assets/fleet/BMW 520D.png";
  }

  // 1. Check catalog asset override first by brand & model (studio transparent cutouts)
  const brand = (vehicle.brand || "").trim();
  const model = (vehicle.model || "").trim();
  const fullName = `${brand} ${model}`.trim();

  const ov =
    findFleetImageOverride(fullName) ||
    findFleetImageOverride(model) ||
    (brand.toLowerCase() === "maruti" ? findFleetImageOverride(`Maruti Suzuki ${model}`) : null) ||
    (brand.toLowerCase() === "mg" ? findFleetImageOverride("mg hector") : null);

  if (ov) return encodeURI(ov);

  // 2. Check for real user-uploaded car photos (http, uploads, data, blob)
  // Skip protected media document IDs (MED- / /api/media/) that return SVG document placeholders
  const candidateImages = [
    Array.isArray(vehicle.gallery) ? vehicle.gallery[0] : null,
    vehicle.imageUrl,
    vehicle.image,
    vehicle.photo,
  ];

  for (const candidate of candidateImages) {
    if (!candidate || typeof candidate !== "string") continue;
    const s = candidate.trim();
    if (s.includes("MED-") || s.includes("/api/media/")) continue;
    if (
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("data:") ||
      s.startsWith("blob:") ||
      s.startsWith("uploads/") ||
      s.startsWith("/uploads/")
    ) {
      const custom = normalizeCustomUrl(s);
      if (custom) return custom;
    }
  }

  // 3. Fallback to candidate if it starts with assets/
  for (const candidate of candidateImages) {
    if (candidate && typeof candidate === "string" && candidate.trim().startsWith("assets/")) {
      return encodeURI(candidate.trim());
    }
  }

  return "assets/fleet/BMW 520D.png";
}

function getFleetVehicle(query) {
  if (!query || query === "undefined" || query === "null") return null;
  const q = String(query).trim().toLowerCase();
  
  const direct = fleetVehicles.find(
    (v) =>
      (v.id && (String(v.id).toLowerCase() === q || String(v.id).replace(/\D/g, "") === q)) ||
      (v.slug && v.slug.toLowerCase() === q) ||
      (v.regNo && v.regNo.toLowerCase() === q) ||
      `${v.brand} ${v.model}`.toLowerCase() === q ||
      `${v.brand}-${v.model}`.toLowerCase().replace(/\s+/g, "-") === q ||
      v.brand.toLowerCase() === q ||
      v.model.toLowerCase() === q
  );
  if (direct) return direct;

  const num = parseInt(q, 10);
  if (!isNaN(num)) {
    if (fleetVehicles[num - 1]) return fleetVehicles[num - 1];
    const byNum = fleetVehicles.find(v => v.id === `krz-${String(num).padStart(2, "0")}` || v.id === String(num));
    if (byNum) return byNum;
  }
  return null;
}

if (typeof window !== "undefined") {
  window.fleetImagePath = fleetImagePath;
  window.fleetVehicles = fleetVehicles;
  window.getFleetVehicle = getFleetVehicle;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { fleetVehicles, fleetImagePath, getFleetVehicle };
}
