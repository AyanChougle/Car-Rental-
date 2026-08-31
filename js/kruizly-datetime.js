// ============================================================
// KRUIZLY — 24-HOUR DD/MM/YYYY DATE & TIME COMPONENT
// Strict 24-Hour Format (DD/MM/YYYY HH:MM) | Pure White Icon
// ============================================================

(function () {
  "use strict";

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatTo24Hr(date) {
    if (!date || isNaN(date.getTime())) return "";
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  function formatToIso(date) {
    if (!date || isNaN(date.getTime())) return "";
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function parseDateString(str) {
    if (!str) return null;
    if (str instanceof Date) return isNaN(str.getTime()) ? null : str;

    const s = String(str).trim();
    if (!s) return null;

    // DD/MM/YYYY HH:mm or DD-MM-YYYY HH:mm
    const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\sT]+(\d{1,2}):(\d{2}))?/i);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
      const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
      const d = new Date(year, month, day, hours, minutes, 0);
      if (!isNaN(d.getTime())) return d;
    }

    // YYYY-MM-DDTHH:mm
    const isoMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2}))?/i);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      const hours = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
      const minutes = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
      const d = new Date(year, month, day, hours, minutes, 0);
      if (!isNaN(d.getTime())) return d;
    }

    const fallback = new Date(s);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  function enhanceDateTimeInput(input) {
    if (!input || input._kruizlyEnhanced) return;
    input._kruizlyEnhanced = true;

    // Wrap the input in a styled container
    const wrapper = document.createElement("div");
    wrapper.className = "kruizly-datetime-wrapper";
    wrapper.style.cssText = "position:relative;width:100%;display:flex;align-items:center;";

    input.parentNode.insertBefore(wrapper, input);

    // Create the display text input that always shows DD/MM/YYYY HH:MM
    const displayInput = document.createElement("input");
    displayInput.type = "text";
    displayInput.className = input.className;
    displayInput.id = input.id ? `${input.id}_display` : "";
    displayInput.placeholder = "DD/MM/YYYY HH:MM";
    displayInput.autocomplete = "off";
    displayInput.style.cssText = "width:100%;cursor:pointer;padding-right:42px;font-family:inherit;font-weight:600;color:#ffffff;background-color:var(--kr-surface-input);border:1px solid var(--kr-border);border-radius:12px;height:var(--kr-input-height);padding-left:14px;box-sizing:border-box;";

    // Create the pure white calendar SVG icon
    const iconBtn = document.createElement("button");
    iconBtn.type = "button";
    iconBtn.className = "kruizly-datetime-icon-btn";
    iconBtn.setAttribute("aria-label", "Select date and time");
    iconBtn.style.cssText = "position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;padding:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ffffff;opacity:0.95;z-index:3;transition:transform 160ms ease, opacity 160ms ease;";
    iconBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="8" cy="15" r="1" fill="#ffffff"></circle><circle cx="12" cy="15" r="1" fill="#ffffff"></circle><circle cx="16" cy="15" r="1" fill="#ffffff"></circle></svg>`;

    // Hide the native input offscreen but keep it focusable / triggerable
    input.style.cssText = "position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;left:0;top:0;";

    wrapper.appendChild(displayInput);
    wrapper.appendChild(iconBtn);
    wrapper.appendChild(input);

    function syncDisplayFromNative() {
      const d = parseDateString(input.value);
      if (d) {
        displayInput.value = formatTo24Hr(d);
      } else {
        displayInput.value = "";
      }
    }

    function syncNativeFromDisplay() {
      const d = parseDateString(displayInput.value);
      if (d) {
        input.value = formatToIso(d);
        displayInput.value = formatTo24Hr(d);
      }
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function openPicker() {
      if (typeof input.showPicker === "function") {
        try {
          input.showPicker();
          return;
        } catch (_) {}
      }
      input.focus();
    }

    displayInput.addEventListener("click", openPicker);
    iconBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openPicker();
    });

    displayInput.addEventListener("change", syncNativeFromDisplay);
    displayInput.addEventListener("blur", syncNativeFromDisplay);

    input.addEventListener("input", syncDisplayFromNative);
    input.addEventListener("change", syncDisplayFromNative);

    // Initial sync
    if (input.value) {
      syncDisplayFromNative();
    }

    // Intercept getter/setter on input.value to keep display in sync
    const originalValueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (originalValueDesc && originalValueDesc.set) {
      Object.defineProperty(input, "value", {
        get() {
          return originalValueDesc.get.call(input);
        },
        set(newVal) {
          originalValueDesc.set.call(input, newVal);
          syncDisplayFromNative();
        }
      });
    }
  }

  function initAllDateTimePickers() {
    const targets = document.querySelectorAll(
      'input[type="datetime-local"], #pickupDate, #dropDate, #quickPickup, #quickDrop'
    );
    targets.forEach(enhanceDateTimeInput);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllDateTimePickers);
  } else {
    initAllDateTimePickers();
  }

  window.initKruizlyDateTimePickers = initAllDateTimePickers;
})();
