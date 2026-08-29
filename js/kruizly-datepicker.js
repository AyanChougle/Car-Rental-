// ============================================================
// KRUIZLY — ULTRA-FAST FLATPICKR DATE & TIME ENFORCER
// Zero Lag | Single Initialization | Lightweight DOM
// ============================================================

(function () {
  function parseKruizlyDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;

    const stringVal = String(dateStr).trim();
    if (!stringVal) return null;

    // DD/MM/YYYY [HH:mm[:ss] [AM|PM]]
    const dmyMatch = stringVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
    if (dmyMatch) {
      let day = parseInt(dmyMatch[1], 10);
      let month = parseInt(dmyMatch[2], 10) - 1;
      let year = parseInt(dmyMatch[3], 10);
      let hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
      let minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
      let seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
      let ampm = dmyMatch[7] ? dmyMatch[7].toUpperCase() : null;

      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;

      const parsed = new Date(year, month, day, hours, minutes, seconds);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    // ISO YYYY-MM-DD
    const isoMatch = stringVal.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
    if (isoMatch) {
      let year = parseInt(isoMatch[1], 10);
      let month = parseInt(isoMatch[2], 10) - 1;
      let day = parseInt(isoMatch[3], 10);
      let hours = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
      let minutes = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
      let seconds = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;

      const parsed = new Date(year, month, day, hours, minutes, seconds);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    const fallback = new Date(stringVal);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  function attachFlatpickrToElement(el) {
    if (!el || el._flatpickrAttached || typeof flatpickr === "undefined") return;

    const isDateTime =
      el.type === "datetime-local" ||
      el.id.toLowerCase().includes("time") ||
      el.id === "pickupDate" ||
      el.id === "dropDate" ||
      el.id === "quickPickup" ||
      el.id === "quickDrop" ||
      el.dataset.nativeType === "datetime-local";

    if (el.type === "date" || el.type === "datetime-local") {
      el.dataset.nativeType = el.type;
      try { el.type = "text"; } catch (_) {}
    }

    const pathname = String(window.location.pathname || "").toLowerCase();
    const isStaffPage =
      pathname.includes("admin.html") ||
      pathname.includes("manager.html") ||
      pathname.includes("executive.html");

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const config = {
      enableTime: isDateTime,
      time_24hr: false,
      dateFormat: isDateTime ? "Y-m-dTH:i" : "Y-m-d",
      altInput: true,
      altFormat: isDateTime ? "d/m/Y h:i K" : "d/m/Y",
      allowInput: true,
      minuteIncrement: 5,
      disableMobile: true,
      monthSelectorType: "static",
      parseDate: parseKruizlyDate,
      formatDate: function (dateObj, formatStr) {
        if (!dateObj) return "";
        const day = String(dateObj.getDate()).padStart(2, "0");
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const year = dateObj.getFullYear();

        if (!isDateTime || formatStr === "d/m/Y") {
          return `${day}/${month}/${year}`;
        }

        let hours = dateObj.getHours();
        const minutes = String(dateObj.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12;
        hours = hours ? hours : 12;
        const formattedHours = String(hours).padStart(2, "0");

        return `${day}/${month}/${year} ${formattedHours}:${minutes} ${ampm}`;
      },
      onReady: function (selectedDates, dateStr, instance) {
        if (instance.altInput && !instance.altInput._iconAttached) {
          instance.altInput._iconAttached = true;
          instance.altInput.placeholder = isDateTime ? "DD/MM/YYYY HH:MM" : "DD/MM/YYYY";
          instance.altInput.style.cursor = "pointer";

          let wrapper = instance.altInput.closest(".kruizly-datepicker-wrapper");
          if (!wrapper && instance.altInput.parentNode) {
            wrapper = document.createElement("div");
            wrapper.className = "kruizly-datepicker-wrapper";
            wrapper.style.cssText = "position:relative;width:100%;display:flex;align-items:center;";
            instance.altInput.parentNode.insertBefore(wrapper, instance.altInput);
            wrapper.appendChild(instance.altInput);
          }

          const targetContainer = wrapper || instance.altInput.parentElement;
          if (targetContainer && !targetContainer.querySelector(".kruizly-datepicker-icon")) {
            const icon = document.createElement("span");
            icon.className = "kruizly-datepicker-icon";
            icon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#4fd7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
            icon.style.cssText = "position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;display:flex;align-items:center;opacity:0.9;z-index:10;pointer-events:auto;";
            icon.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              instance.toggle();
            });
            targetContainer.appendChild(icon);
          }
        }
      },
      onChange: function (selectedDates, dateStr, instance) {
        try {
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (_) {}
      }
    };

    if (!isStaffPage) {
      config.minDate = todayMidnight;
      config.disable = [
        function (date) {
          const t = new Date();
          t.setHours(0, 0, 0, 0);
          return date < t;
        }
      ];
    }

    const fp = flatpickr(el, config);
    el._flatpickrAttached = true;

    if (el.value) {
      try {
        const parsed = parseKruizlyDate(el.value);
        if (parsed) fp.setDate(parsed, false);
      } catch (_) {}
    }

    return fp;
  }

  function initAllKruizlyDatepickers() {
    if (typeof flatpickr === "undefined") return;

    const selector = [
      'input[type="date"]',
      'input[type="datetime-local"]',
      "#pickupDate",
      "#dropDate",
      "#quickPickup",
      "#quickDrop",
      "#bookingDateFrom",
      "#bookingDateTo",
      "#mgrBookingDateFrom",
      "#mgrBookingDateTo",
      "#couponExpiryInput",
    ].join(",");

    document.querySelectorAll(selector).forEach((el) => {
      if (!el._flatpickrAttached) {
        attachFlatpickrToElement(el);
      } else if (el._flatpickr) {
        el._flatpickr.redraw();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllKruizlyDatepickers, { once: true });
  } else {
    initAllKruizlyDatepickers();
  }

  window.attachKruizlyDatePicker = attachFlatpickrToElement;
  window.initAllKruizlyDatepickers = initAllKruizlyDatepickers;
  window.parseKruizlyDate = parseKruizlyDate;
})();
