KRUIZLY KPI Revenue Fix

Files included:
- api/services/KpiService.php
- js/manager-summary.js
- manager.html

Deploy:
1. Back up these three existing files from Hostinger first.
2. Upload/overwrite each file at the matching path under your website's public_html/project root.
3. Keep your existing .env and all other server files unchanged.
4. Hard-refresh Manager page (Ctrl+F5) after upload.

Behavior:
- Existing positive kpi_metrics.month_sales is treated as the approved monthly ledger value and is no longer replaced by a different booking-derived monthly sum during KPI recalculation.
- Live booking counts continue to recalculate when available.
- The Manager UI uses the saved monthly SQL value before live aggregate fallbacks and removes hardcoded 423462/477004 values.
- manager.html cache-busts the JS to v2.

Important:
- This preserves the SQL monthly ledger value you have already corrected. If bookings are added/edited/cancelled, the existing KpiService booking hooks should update the ledger.
- Test with the September row (2026-09-01): month_sales should remain 423462 after refresh. The September total_revenue field is cumulative (755859), not September-only revenue.
