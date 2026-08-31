// ============================================================
// KRUIZLY — DEFAULT NATIVE HTML5 DATE & TIME PICKER ENFORCER
// Zero Custom Overlays | Standard Browser Picker | Dynamic Min-Date
// ============================================================

(function () {
  function toLocalISO(d) {
    if (!d || isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function initNativeDatepickers() {
    const now = new Date();
    const nowStr = toLocalISO(now);

    const inputs = document.querySelectorAll(
      'input[type="datetime-local"], input[type="date"], #pickupDate, #dropDate, #quickPickup, #quickDrop'
    );

    inputs.forEach((el) => {
      // Ensure type is standard native datetime-local
      if (el.type !== "datetime-local" && el.type !== "date") {
        try { el.type = "datetime-local"; } catch (_) {}
      }

      // Enforce min constraint to prevent past selection
      if (!el.min || el.min < nowStr) {
        el.min = nowStr;
      }
    });

    // Pair pickup and drop inputs
    const pairs = [
      { pickup: document.getElementById("pickupDate"), drop: document.getElementById("dropDate") },
      { pickup: document.getElementById("quickPickup"), drop: document.getElementById("quickDrop") }
    ];

    pairs.forEach(({ pickup, drop }) => {
      if (!pickup || !drop) return;

      const updateDropMin = () => {
        if (pickup.value) {
          drop.min = pickup.value;
          if (drop.value && drop.value <= pickup.value) {
            const pDate = new Date(pickup.value);
            const dDate = new Date(pDate.getTime() + 24 * 60 * 60 * 1000);
            drop.value = toLocalISO(dDate);
            drop.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      };

      pickup.addEventListener("change", updateDropMin);
      pickup.addEventListener("input", updateDropMin);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNativeDatepickers);
  } else {
    initNativeDatepickers();
  }

  window.initAllKruizlyDatepickers = initNativeDatepickers;
  window.attachKruizlyDatePicker = initNativeDatepickers;
})();


