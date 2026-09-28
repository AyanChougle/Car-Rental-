KRUIZLY — FINAL HUB DASHBOARD FIX
=================================

This bundle fixes Hub isolation for:
- Admin KPI / revenue / booking / fleet refresh
- Manager KPI refresh and global KPI fallback
- Executive Hub-dependent operations data (preserved, already Hub-aware)
- Accounts payment verification queue
- Payments API Hub filtering and duplicate-WHERE bug
- Shared responsive CSS audit for Admin / Manager / Executive / Accounts

DATABASE SAFETY
---------------
This installer does NOT change the database, vehicles, bookings, hubs, pricing, or historical data.
It creates .hubfix.bak backups beside every modified file.

INSTALL
-------
1. Extract this folder INTO your KRUIZLY project root, so it sits beside js/, api/, css/, admin.html, etc.
2. Double-click APPLY_FIX.bat.
3. Hard refresh the browser with Ctrl+F5.
4. Test Hub switching in this order:
   - Kandivali
   - Gavson HQ
   - Kandivali again

EXPECTED KPI BEHAVIOR
---------------------
Kandivali uses /api/hubs/summary?hub_id=1 only.
Gavson uses /api/hubs/summary?hub_id=2 only.
No selected Hub may use /api/admin/stats for the Hub-scoped dashboards.

IMPORTANT CURRENT DATA FACT
---------------------------
At the time of this fix, the database has 41 vehicles assigned to Gavson HQ and 0 vehicles assigned to Kandivali.
No vehicles are copied or reassigned by this installer.

IF SOMETHING FAILS
------------------
Every changed source file gets a .hubfix.bak backup. Restore the backup next to the affected file if required.
