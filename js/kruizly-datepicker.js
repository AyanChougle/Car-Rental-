// ============================================================
// KRUIZLY — NATIVE DATE & TIME PICKER ENFORCER
// Enforces native HTML5 datepickers with minDate restrictions (no past dates)
// ============================================================

(function () {
  function toLocalDateTimeString(d) {
    if (!d || isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function enforceNativeDateInputs() {
    const now = new Date();
    const nowStr = toLocalDateTimeString(now);

    const dateInputs = document.querySelectorAll(
      'input[type="date"], input[type="datetime-local"], #pickupDate, #dropDate, #quickPickup, #quickDrop'
    );

    dateInputs.forEach((el) => {
      // Ensure element is standard datetime-local
      if (el.type !== "datetime-local" && el.type !== "date") {
        try { el.type = "datetime-local"; } catch (_) {}
      }

      // Prevent past dates
      if (!el.min || el.min < nowStr) {
        el.min = nowStr;
      }
    });

    // Pair pickup & drop elements
    const pairs = [
      { pickup: document.getElementById("pickupDate"), drop: document.getElementById("dropDate") },
      { pickup: document.getElementById("quickPickup"), drop: document.getElementById("quickDrop") }
    ];

    pairs.forEach(({ pickup, drop }) => {
      if (!pickup || !drop) return;

      pickup.addEventListener("change", () => {
        if (pickup.value) {
          drop.min = pickup.value;
          if (drop.value && drop.value <= pickup.value) {
            const pDate = new Date(pickup.value);
            const dDate = new Date(pDate.getTime() + 24 * 60 * 60 * 1000);
            drop.value = toLocalDateTimeString(dDate);
          }
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enforceNativeDateInputs);
  } else {
    enforceNativeDateInputs();
  }

  window.attachKruizlyDatePicker = enforceNativeDateInputs;
})();
