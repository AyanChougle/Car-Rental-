from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[2]

if not (ROOT / 'js' / 'admin.js').exists():
    raise SystemExit(f'KRUIZLY project root not found: {ROOT}\nPlace this ZIP folder inside your KRUIZLY project root, then run this script.')


def backup(path: Path):
    bak = path.with_suffix(path.suffix + '.hubfix.bak')
    if not bak.exists():
        shutil.copy2(path, bak)


def replace_once(path: Path, old: str, new: str, label: str):
    text = path.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'{label}: expected code block was not found in {path}')
    backup(path)
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'OK: {label}')

# -----------------------------------------------------------------------------
# 1. ADMIN — Hub KPI must never fall back to global /admin/stats.
# -----------------------------------------------------------------------------
admin = ROOT / 'js' / 'admin.js'
replace_once(admin, '''async function loadKpiStats() {
  try {
    const selectedHubId = getSelectedHubId();
    const globalRes = await api.get("/admin/stats?_t=" + Date.now());
    const globalData = globalRes?.data || {};
    if (!selectedHubId) {
      currentKpiStats = globalData ? { ...globalData, _hubScoped: false } : null;
      applyKpiStats();
      return;
    }

    const hubRes = await api.get("/hubs/summary", { hub_id: selectedHubId, _t: Date.now() });
    if (!hubRes?.success || !hubRes?.data) throw new Error(hubRes?.error || "Hub summary unavailable");
    const hubData = hubRes.data;
    const globalEff = globalData?.effective || globalData?.live || {};
    currentKpiStats = {
      effective: { ...globalEff, ...hubData, total_users: globalEff.total_users ?? 0, pending_docs: globalEff.pending_docs ?? 0 },
      live: { ...globalEff, ...hubData },
      _hubScoped: true,
      hub: hubRes.hub || null
    };
    applyKpiStats();
  } catch (err) {
    console.warn("Could not load Hub-aware admin KPIs:", err);
  }
}''', '''async function loadKpiStats() {
  const selectedHubId = getSelectedHubId();
  const requestTime = Date.now();

  // A selected Hub MUST use the Hub-scoped SQL summary exclusively.
  // Never merge or fall back to /admin/stats because that endpoint is global.
  try {
    if (selectedHubId) {
      currentKpiStats = null;
      const hubRes = await api.get("/hubs/summary", {
        hub_id: selectedHubId,
        _t: requestTime
      });
      if (!hubRes?.success || !hubRes?.data) {
        throw new Error(hubRes?.error || "Hub summary unavailable");
      }
      const hubData = hubRes.data || {};
      currentKpiStats = {
        effective: { ...hubData },
        live: { ...hubData },
        overrides: null,
        _hubScoped: true,
        hub: hubRes.hub || null
      };
      applyKpiStats();
      return;
    }

    // Only an explicit global / All Hubs context may use global KPIs.
    const globalRes = await api.get("/admin/stats?_t=" + requestTime);
    const globalData = globalRes?.data || {};
    currentKpiStats = globalData ? { ...globalData, _hubScoped: false } : null;
    applyKpiStats();
  } catch (err) {
    // Do not leave the previous Hub's numbers visible after a failed refresh.
    if (selectedHubId) {
      currentKpiStats = {
        effective: {
          total_revenue: 0, month_revenue: 0, total_bookings: 0,
          paid_bookings: 0, avg_booking: 0, active_rentals: 0,
          active_trips: 0, pending_docs: 0, pending_payments: 0,
          total_users: 0, active_renters: 0, verified_customers: 0,
          repeat_customers: 0, total_fleet: 0, fleet_count: 0,
          on_road_fleet: 0, available_fleet: 0
        },
        live: {}, _hubScoped: true, hub: null, loadError: true
      };
      applyKpiStats();
    }
    console.warn("Could not load Hub-scoped admin KPIs:", err);
  }
}''', 'Admin Hub KPI isolation')

replace_once(admin, '''window.addEventListener("kruizly:hubchange", async (event) => {
  const id = event?.detail?.hubId ? String(event.detail.hubId) : "";
  const fleetHub = document.getElementById("fleetHub");
  if (fleetHub) fleetHub.value = id;
  renderSelectedHubContext();
  if (typeof populateHubDropdowns === "function") populateHubDropdowns();
  try {
    await Promise.allSettled([loadKpiStats(), loadBookings(), loadPayments(), loadFleetManagement()]);
  } catch (error) {
    console.warn("Admin Hub refresh failed:", error);
  }
});''', '''window.addEventListener("kruizly:hubchange", async (event) => {
  const id = event?.detail?.hubId ? String(event.detail.hubId) : "";
  const fleetHub = document.getElementById("fleetHub");
  if (fleetHub) fleetHub.value = id;
  renderSelectedHubContext();
  if (typeof populateHubDropdowns === "function") populateHubDropdowns();

  // Clear previous Hub values before the new Hub finishes loading.
  currentKpiStats = null;
  applyKpiStats();

  try {
    await Promise.allSettled([
      loadKpiStats(),
      loadBookings(),
      loadPayments(),
      loadFleetManagement()
    ]);
  } catch (error) {
    console.warn("Admin Hub refresh failed:", error);
  }
});''', 'Admin Hub change refresh')

# -----------------------------------------------------------------------------
# 2. MANAGER — never retain global KPI values when a Hub is selected.
# -----------------------------------------------------------------------------
manager = ROOT / 'js' / 'manager-summary.js'
replace_once(manager, '''async function loadManagerData() {
  try {
    const selectedHubId = window.getKruizlySelectedHubId ? window.getKruizlySelectedHubId() : "";
    const hubParams = selectedHubId ? { hub_id: selectedHubId } : {};
    const [bookingsRes, vehiclesRes, activeFleetsRes, kpiRes, hubSummaryRes] =''', '''async function loadManagerData() {
  try {
    const selectedHubId = window.getKruizlySelectedHubId ? window.getKruizlySelectedHubId() : "";
    const hubParams = selectedHubId ? { hub_id: selectedHubId } : {};
    // Never retain the previous/global KPI snapshot across Hub changes.
    serverKpiStats = null;
    const [bookingsRes, vehiclesRes, activeFleetsRes, kpiRes, hubSummaryRes] =''', 'Manager KPI reset')
replace_once(manager, '''        api.get("/admin/stats", { _t: Date.now() }),''', '''        selectedHubId ? Promise.resolve(null) : api.get("/admin/stats", { _t: Date.now() }),''', 'Manager global KPI suppression')

# -----------------------------------------------------------------------------
# 3. ACCOUNTS — payments and booking fallback must be Hub-scoped.
# -----------------------------------------------------------------------------
accounts = ROOT / 'js' / 'accounts.js'
replace_once(accounts, '''async function loadPaymentsData() {
  const wrap = $("accountsTableWrap");''', '''async function loadPaymentsData() {
  const wrap = $("accountsTableWrap");
  const selectedHubId = window.getKruizlySelectedHubId ? window.getKruizlySelectedHubId() : "";
  const hubParams = selectedHubId ? { hub_id: selectedHubId } : {};''', 'Accounts selected Hub context')
replace_once(accounts, '''      api.get("/payments"),
      api.get("/bookings")''', '''      api.get("/payments", hubParams),
      api.get("/bookings", hubParams)''', 'Accounts Hub-filtered payments/bookings')
replace_once(accounts, '''  } catch (err) {
    console.error("Error loading accounts payments:", err);
    if (wrap) wrap.innerHTML = `<div class="manager-state" style="padding: 24px; text-align: center; color: #ef476f;">Error loading payments: ${escapeHtml(err.message)}</div>`;
  }
}

function updateStats(payments) {''', '''  } catch (err) {
    console.error("Error loading accounts payments:", err);
    if (wrap) wrap.innerHTML = `<div class="manager-state" style="padding: 24px; text-align: center; color: #ef476f;">Error loading payments: ${escapeHtml(err.message)}</div>`;
  }
}

window.addEventListener("kruizly:hubchange", () => {
  loadPaymentsData().catch((err) => console.error("Accounts Hub refresh failed:", err));
});

function updateStats(payments) {''', 'Accounts Hub-change refresh')

# -----------------------------------------------------------------------------
# 4. PAYMENTS API — fix invalid duplicate WHERE and return Hub IDs.
# -----------------------------------------------------------------------------
payments = ROOT / 'api' / 'payments' / 'index.php'
replace_once(payments, '''                b.total_amount, 
                COALESCE(b.booking_number, b.booking_id, p.booking_id) AS matched_booking_number,
                b.pickup_date, b.drop_date,
                COALESCE(''', '''                b.total_amount,
                COALESCE(b.booking_number, b.booking_id, p.booking_id) AS matched_booking_number,
                b.pickup_date, b.drop_date, b.pickup_hub_id, b.drop_hub_id,
                COALESCE(''', 'Payments Hub columns')
replace_once(payments, '''         WHERE (? = 0 OR b.pickup_hub_id = ? OR b.drop_hub_id = ?)
         WHERE (? = 0 OR b.pickup_hub_id = ? OR b.drop_hub_id = ?)
         ORDER BY p.created_at DESC"''', '''         WHERE (? = 0 OR b.pickup_hub_id = ? OR b.drop_hub_id = ?)
         ORDER BY p.created_at DESC"''', 'Payments duplicate WHERE fix')

# -----------------------------------------------------------------------------
# 5. Shared responsive dashboard CSS audit.
# -----------------------------------------------------------------------------
css_dir = ROOT / 'css'
css_dir.mkdir(parents=True, exist_ok=True)
css = css_dir / 'hub-dashboard-audit.css'
backup(css) if css.exists() else None
css.write_text(r'''/* KRUIZLY Hub Dashboard UI Audit — shared Admin / Manager / Executive / Accounts */
:root { --hub-cyan:#4fd7ff; --hub-green:#06d6a0; --hub-bg:rgba(7,18,42,.72); }

.hub-context-bar, .kruizly-global-hub-selector { box-sizing:border-box; }
.hub-context-bar__inner { min-width:0; }
.hub-context-bar__title, .hub-context-bar__meta { overflow:hidden; text-overflow:ellipsis; }

/* Dashboard grids: prevent cramped KPI cards on tablets. */
.admin-stats-grid, .manager-stats { width:100%; box-sizing:border-box; }
.stat-card, .manager-stat-card { min-width:0; overflow:hidden; }
.stat-value, .manager-stat-value { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Tables remain usable without causing page-wide horizontal overflow. */
.accounts-table-wrap, .manager-table-wrap, .executive-table-wrap,
.data-table-scroll-container, .admin-table-wrap { max-width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; }
.accounts-table, .manager-table, .executive-table { min-width:760px; }

/* Consistent focus state for keyboard users. */
.hub-context-select:focus-visible,
.kruizly-global-hub-select:focus-visible,
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible {
  outline:2px solid var(--hub-cyan);
  outline-offset:2px;
}

@media (max-width:1100px) {
  .admin-stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
  .manager-stats { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
  .hub-context-bar__inner { gap:12px; }
}

@media (max-width:760px) {
  .admin-stats-grid, .manager-stats { grid-template-columns:1fr !important; gap:10px !important; }
  .stat-card, .manager-stat-card { min-height:82px !important; padding:16px !important; }
  .manager-page-header .section-title, .manager-hero .section-title { font-size:1.8rem !important; }
  .admin-tabs { overflow-x:auto; flex-wrap:nowrap !important; -webkit-overflow-scrolling:touch; padding-bottom:8px !important; }
  .admin-tabs .btn, .mgr-tab-btn { flex:0 0 auto; white-space:nowrap; }
  .accounts-table th.col-action, .accounts-table td.col-action { position:sticky; right:0; min-width:125px !important; padding:10px !important; }
}

@media (max-width:520px) {
  .hub-context-bar__inner { border-radius:12px; }
  .hub-context-bar__identity { min-width:0; }
  .hub-context-bar__control { width:100%; }
  .hub-context-select { width:100%; min-width:0; }
  .kruizly-global-hub-selector { width:100%; margin-left:0; }
  .kruizly-global-hub-select { width:100%; }
  .stat-label, .manager-stat-label { font-size:10.5px !important; }
  .stat-value, .manager-stat-value { font-size:1.35rem !important; }
}

@media (prefers-reduced-motion:reduce) {
  *, *::before, *::after { scroll-behavior:auto !important; transition:none !important; animation:none !important; }
}
''', encoding='utf-8')
print('OK: shared responsive CSS audit created')

# -----------------------------------------------------------------------------
# 6. Add the shared CSS to the four staff dashboards if not already present.
# -----------------------------------------------------------------------------
for name in ['admin.html','manager.html','executive.html','accounts.html']:
    p = ROOT / name
    text = p.read_text(encoding='utf-8')
    tag = '<link rel="stylesheet" href="css/hub-dashboard-audit.css?v=20260928-v1">'
    if tag not in text:
        backup(p)
        marker = '</head>'
        text = text.replace(marker, f'    {tag}\n{marker}', 1)
        p.write_text(text, encoding='utf-8')
        print(f'OK: CSS audit linked in {name}')

print('\nHub dashboard fix applied successfully.')
print('Database was not modified.')
print('Backup files use the .hubfix.bak suffix.')
