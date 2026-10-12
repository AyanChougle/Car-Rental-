/**
 * KRUIZLY Hub Context
 * Shared Hub selector for Admin, Manager, Executive, Fleet and Payment surfaces.
 * Hub records are read from the live database API with fallback.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "kruizly_selected_hub_id";
  const API = (window.__KRUIZLY_API_URL__ || localStorage.getItem("kruizly_api_url") ||
    ((location.hostname === "localhost" || location.hostname === "127.0.0.1")
      ? "https://kruizly.com/api" : location.origin + "/api")).replace(/\/$/, "");

  const DEFAULT_HUBS = [
    { id: 1, name: "Gavson Business Park, Ghansoli", code: "GAV-01", city: "Navi Mumbai", state: "Maharashtra", status: "active" },
    { id: 2, name: "Kandivali Hub, Mumbai", code: "KAND-01", city: "Mumbai", state: "Maharashtra", status: "active" }
  ];

  let hubs = [...DEFAULT_HUBS];
  let selector = null;

  function getSelectedHubId() {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch (_) { return ""; }
  }

  function setSelectedHubId(id) {
    try {
      if (id === null || id === undefined || id === "") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(id));
    } catch (_) {}
  }

  function selectedHub() {
    const id = getSelectedHubId();
    return hubs.find(h => String(h.id) === String(id)) || null;
  }

  async function fetchHubs() {
    try {
      const res = await fetch(API + "/hubs?active=1&_t=" + Date.now(), {
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && Array.isArray(data.hubs) && data.hubs.length > 0) {
        hubs = data.hubs;
      } else if (!hubs.length) {
        hubs = [...DEFAULT_HUBS];
      }
    } catch (err) {
      console.warn("Hub context fetch note:", err);
      if (!hubs.length) hubs = [...DEFAULT_HUBS];
    }
    return hubs;
  }

  function pageMode() {
    const p = location.pathname.toLowerCase();
    if (p.includes("payment")) return "payment";
    if (p.includes("fleet")) return "fleet";
    if (p.includes("executive")) return "executive";
    if (p.includes("manager")) return "manager";
    if (p.includes("admin")) return "admin";
    if (p.includes("accounts")) return "accounts";
    return "customer";
  }

  function ensureBar() {
    const duplicate = document.getElementById("global-hub-selector");
    if (duplicate) duplicate.remove();

    // Clean up any bar erroneously injected inside <header>
    const mislocated = document.querySelector("header .hub-context-bar");
    if (mislocated) mislocated.remove();

    const existing = document.querySelector(".hub-context-bar");
    if (existing) {
      selector = existing.querySelector("#kruizlyHubContextSelect");
      return existing;
    }

    const bar = document.createElement("section");
    bar.className = "hub-context-bar";
    bar.setAttribute("aria-label", "KRUIZLY Hub context");
    bar.innerHTML = `
      <div class="hub-context-bar__inner">
        <div class="hub-context-bar__identity">
          <span class="hub-context-bar__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </span>
          <div class="hub-context-bar__titles">
            <span class="hub-context-bar__eyebrow">OPERATING HUB</span>
            <strong class="hub-context-bar__title">Hub Context</strong>
          </div>
        </div>
        <div class="hub-context-bar__control">
          <label for="kruizlyHubContextSelect" class="hub-context-bar__control-label">Select Hub</label>
          <div class="hub-context-select-wrap">
            <select id="kruizlyHubContextSelect" class="hub-context-select" aria-label="Select Operating Hub">
              <option value="">All Hubs</option>
            </select>
          </div>
        </div>
        <div class="hub-context-bar__meta" id="kruizlyHubContextMeta">
          <span class="hub-context-dot" aria-hidden="true"></span>
          <span class="hub-context-meta-text">All active Hubs</span>
        </div>
      </div>`;
    
    // Strictly target main container: never insert into header!
    const container =
      document.querySelector("main .manager-container") ||
      document.querySelector("main .container") ||
      document.querySelector("main .admin-wrapper") ||
      document.querySelector("main [class*='container']") ||
      document.querySelector("main");

    if (container) {
      container.insertBefore(bar, container.firstChild);
    } else {
      const header = document.querySelector("header.site-header") || document.querySelector("header");
      if (header && header.nextSibling) {
        header.parentNode.insertBefore(bar, header.nextSibling);
      } else {
        document.body.insertBefore(bar, document.body.firstChild);
      }
    }
    selector = bar.querySelector("#kruizlyHubContextSelect");
    return bar;
  }

  function render() {
    const bar = ensureBar();
    selector = bar.querySelector("#kruizlyHubContextSelect");
    if (!selector) return;

    const mode = pageMode();
    const allowAll = mode === "admin" || mode === "manager" || mode === "executive" || mode === "accounts" || mode === "customer" || mode === "fleet";
    const previous = getSelectedHubId();

    selector.innerHTML = "";
    if (allowAll) {
      const all = document.createElement("option");
      all.value = "";
      all.textContent = "All Hubs";
      selector.appendChild(all);
    }

    hubs.forEach(h => {
      const option = document.createElement("option");
      option.value = String(h.id);
      option.textContent = `${h.name}${h.city ? " — " + h.city : ""}`;
      selector.appendChild(option);
    });

    let value = previous;
    if (value && !hubs.some(h => String(h.id) === String(value))) {
      value = "";
      setSelectedHubId("");
    }
    selector.value = value;
    const globalSelect = document.getElementById("kruizly-hub-select");
    if (globalSelect) globalSelect.value = value;

    const meta = document.getElementById("kruizlyHubContextMeta");
    const hub = selectedHub();
    const metaLabel = hub
      ? `${hub.code || "HUB"} · ${hub.city || ""}${hub.state ? ", " + hub.state : ""}`
      : (hubs.length ? "All active Hubs" : "All operating Hubs");

    if (meta) {
      const metaText = meta.querySelector(".hub-context-meta-text");
      if (metaText) {
        metaText.textContent = metaLabel;
      } else {
        meta.textContent = metaLabel;
      }
    }

    selector.onchange = function () {
      const next = selector.value || "";
      setSelectedHubId(next);
      const hub = selectedHub();
      const metaLabel = hub
        ? `${hub.code || "HUB"} · ${hub.city || ""}${hub.state ? ", " + hub.state : ""}`
        : "All active Hubs";
      if (meta) {
        const metaText = meta.querySelector(".hub-context-meta-text");
        if (metaText) {
          metaText.textContent = metaLabel;
        } else {
          meta.textContent = metaLabel;
        }
      }
      const globalSelect = document.getElementById("kruizly-hub-select");
      if (globalSelect && globalSelect.value !== next) globalSelect.value = next;
      window.dispatchEvent(new CustomEvent("kruizly:hubchange", {
        detail: { hubId: next ? Number(next) : null, hub: hub || null, hubs: hubs.slice() }
      }));
    };

    window.KRUIZLY_HUBS = hubs.slice();
    window.getKruizlySelectedHubId = getSelectedHubId;
    window.getKruizlySelectedHub = selectedHub;
    window.setKruizlySelectedHubId = function (id) {
      setSelectedHubId(id);
      render();
      window.dispatchEvent(new CustomEvent("kruizly:hubchange", {
        detail: { hubId: id ? Number(id) : null, hub: selectedHub() || null, hubs: hubs.slice() }
      }));
    };
  }

  async function init() {
    try {
      await fetchHubs();
      render();
      const hub = selectedHub();
      window.dispatchEvent(new CustomEvent("kruizly:hubchange", {
        detail: { hubId: getSelectedHubId() ? Number(getSelectedHubId()) : null, hub: hub || null, hubs: hubs.slice(), initial: true }
      }));
    } catch (error) {
      console.warn("Hub context init error:", error);
      render();
    }
  }

  window.KRUIZLYHubContext = {
    init, fetchHubs, render, getSelectedHubId, setSelectedHubId, selectedHub
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
