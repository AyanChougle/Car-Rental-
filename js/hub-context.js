/**
 * KRUIZLY Hub Context
 * Shared Hub selector for Admin, Manager, Executive, Fleet and Payment surfaces.
 * Hub records are always read from the live database API.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "kruizly_selected_hub_id";
  const API = (window.__KRUIZLY_API_URL__ || localStorage.getItem("kruizly_api_url") ||
    ((location.hostname === "localhost" || location.hostname === "127.0.0.1")
      ? "https://kruizly.com/api" : location.origin + "/api")).replace(/\/$/, "");

  let hubs = [];
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
    const res = await fetch(API + "/hubs?active=1&_t=" + Date.now(), {
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || data.message || "Could not load Hubs");
    hubs = Array.isArray(data.hubs) ? data.hubs : [];
    return hubs;
  }

  function pageMode() {
    const p = location.pathname.toLowerCase();
    if (p.includes("payment")) return "payment";
    if (p.includes("fleet")) return "fleet";
    if (p.includes("executive")) return "executive";
    if (p.includes("manager")) return "manager";
    if (p.includes("admin")) return "admin";
    return "customer";
  }

  function ensureBar() {
    const duplicate = document.getElementById("global-hub-selector");
    if (duplicate) duplicate.remove();
    if (document.querySelector(".hub-context-bar")) return document.querySelector(".hub-context-bar");
    const bar = document.createElement("section");
    bar.className = "hub-context-bar";
    bar.setAttribute("aria-label", "KRUIZLY Hub context");
    bar.innerHTML = `
      <div class="hub-context-bar__inner">
        <div class="hub-context-bar__identity">
          <span class="hub-context-bar__eyebrow">OPERATING HUB</span>
          <strong class="hub-context-bar__title">Hub Context</strong>
        </div>
        <div class="hub-context-bar__control">
          <label for="kruizlyHubContextSelect">Select Hub</label>
          <select id="kruizlyHubContextSelect" class="hub-context-select">
            <option value="">Loading Hubs...</option>
          </select>
        </div>
        <div class="hub-context-bar__meta" id="kruizlyHubContextMeta">Live database context</div>
      </div>`;
    const main = document.querySelector("main");
    const header = document.querySelector("header");
    if (main) main.insertBefore(bar, main.firstChild);
    else if (header && header.nextSibling) header.parentNode.insertBefore(bar, header.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
    selector = bar.querySelector("#kruizlyHubContextSelect");
    return bar;
  }

  function render() {
    const bar = ensureBar();
    selector = bar.querySelector("#kruizlyHubContextSelect");
    if (!selector) return;

    const mode = pageMode();
    const allowAll = mode === "admin" || mode === "manager" || mode === "executive";
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
    if (!value || !hubs.some(h => String(h.id) === String(value))) {
      value = allowAll ? "" : (hubs[0] ? String(hubs[0].id) : "");
      setSelectedHubId(value);
    }
    selector.value = value;
    const globalSelect = document.getElementById("kruizly-hub-select");
    if (globalSelect) globalSelect.value = value;

    const meta = document.getElementById("kruizlyHubContextMeta");
    const hub = selectedHub();
    if (meta) {
      meta.textContent = hub
        ? `${hub.code || "HUB"} · ${hub.city || ""}${hub.state ? ", " + hub.state : ""}`
        : (hubs.length ? "All active Hubs" : "No active Hubs configured");
    }

    selector.onchange = function () {
      const next = selector.value || "";
      setSelectedHubId(next);
      const hub = selectedHub();
      if (meta) {
        meta.textContent = hub
          ? `${hub.code || "HUB"} · ${hub.city || ""}${hub.state ? ", " + hub.state : ""}`
          : "All active Hubs";
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
      if (Array.isArray(window.KRUIZLY_HUBS) && window.KRUIZLY_HUBS.length) hubs = window.KRUIZLY_HUBS.slice();
      else await fetchHubs();
      render();
      const hub = selectedHub();
      window.dispatchEvent(new CustomEvent("kruizly:hubchange", {
        detail: { hubId: getSelectedHubId() ? Number(getSelectedHubId()) : null, hub: hub || null, hubs: hubs.slice(), initial: true }
      }));
    } catch (error) {
      console.error("Hub context load error:", error);
      const bar = ensureBar();
      const s = bar.querySelector("select");
      if (s) s.innerHTML = `<option value="">Unable to load Hubs</option>`;
      const meta = bar.querySelector(".hub-context-bar__meta");
      if (meta) meta.textContent = error.message || "Hub service unavailable";
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
