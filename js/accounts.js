/**
 * js/accounts.js
 *
 * Accounts & Financial Verification Console:
 * - Payment Audit Queue (UPI & Bank Transfers)
 * - Verifier Selection
 * - Image & Screenshot Proof Preview
 * - Invoice Generation & Verification Tracking
 */

import { auth } from "./firebase-init.js";
import {
  checkAuth,
  getCurrentUser,
  setStoredUser,
  isAccountantUser,
  isAdminUser,
} from "./auth.js?v=20260908-v5";
import { api } from "./kruizly-api.js?v=20261001-v2";
import "./nav-helper.js?v=20260928-v2";
import {
  openImageLightbox,
  fetchProtectedMediaPreview,
  revokeObjectUrlSafely,
} from "./image-lightbox.js?v=20261112-v3";

let activeAccountsProofObjectUrl = "";

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(num) {
  const val = Number(num || 0);
  return `₹${Math.round(val).toLocaleString("en-IN")}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return dateStr;
  }
}

function showEl(el) {
  if (!el) return;
  el.hidden = false;
  el.removeAttribute("hidden");
  el.style.display = "block";
}

function hideEl(el) {
  if (!el) return;
  el.hidden = true;
  el.setAttribute("hidden", "hidden");
  el.style.display = "none";
}

// State
let currentUser = null;
let allPayments = [];
let activePaymentItem = null;

async function initAccounts() {
  const accessDeniedEl = $("accountsAccessDenied");
  const contentEl = $("accountsContent");

  hideEl(accessDeniedEl);
  hideEl(contentEl);

  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    showEl(accessDeniedEl);
    return;
  }

  currentUser = getCurrentUser();

  if (!isAccountantUser(currentUser) && !isAdminUser(currentUser)) {
    try {
      const meRes = await api.get("/users/me");
      if (meRes && meRes.user) {
        setStoredUser(meRes.user);
        currentUser = getCurrentUser();
      }
    } catch (_) {}
  }

  const hasAccess = isAccountantUser(currentUser) || isAdminUser(currentUser);
  if (!hasAccess) {
    showEl(accessDeniedEl);
    return;
  }

  showEl(contentEl);

  initEvents();
  await loadPaymentsData();

  // Auto-fetch payments every 25 seconds
  setInterval(() => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      loadPaymentsData();
    }
  }, 25000);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        loadPaymentsData();
      }
    });
  }
}

function initEvents() {
  $("accountsRefreshBtn")?.addEventListener("click", loadPaymentsData);
  $("accountsSearchInput")?.addEventListener("input", renderPaymentsTable);
  $("accountsStatusFilter")?.addEventListener("change", renderPaymentsTable);

  $("closeAccountsReviewModal")?.addEventListener("click", () => {
    hideModal("accountsReviewModal");
  });

  $("accountsApproveBtn")?.addEventListener("click", handleApprovePayment);
  $("accountsRejectBtn")?.addEventListener("click", handleRejectPayment);

  $("accountsReviewModal")?.addEventListener("click", (e) => {
    if (e.target === $("accountsReviewModal")) {
      hideModal("accountsReviewModal");
    }
  });

  if (typeof window !== "undefined") {
    window.addEventListener("kruizly:hubchange", () => {
      loadPaymentsData();
    });
  }
}

async function loadPaymentsData() {
  const wrap = $("accountsTableWrap");
  if (wrap)
    wrap.innerHTML = `<div class="manager-state" style="padding: 28px; text-align: center; color: var(--sub);">Loading payment records...</div>`;

  try {
    const selectedHubId =
      (typeof localStorage !== "undefined" &&
        localStorage.getItem("kruizly_selected_hub_id")) ||
      "";
    const [paymentsRes, bookingsRes] = await Promise.allSettled([
      api.get("/payments", selectedHubId ? { hub_id: selectedHubId } : {}),
      api.get("/bookings", selectedHubId ? { hub_id: selectedHubId } : {}),
    ]);

    let rawPayments = [];
    if (
      paymentsRes.status === "fulfilled" &&
      paymentsRes.value &&
      Array.isArray(paymentsRes.value.payments)
    ) {
      rawPayments = paymentsRes.value.payments;
    }

    let rawBookings = [];
    if (
      bookingsRes.status === "fulfilled" &&
      bookingsRes.value &&
      Array.isArray(bookingsRes.value.bookings)
    ) {
      rawBookings = bookingsRes.value.bookings;
    }

    // Combine payments and payment-bearing bookings seamlessly
    const combined = [...rawPayments];
    const seenBookingRefs = new Set();
    rawPayments.forEach((p) => {
      const ref1 = String(p.bookingId || "").trim().toUpperCase();
      const ref2 = String(p.bookingNumber || "").trim().toUpperCase();
      if (ref1) seenBookingRefs.add(ref1);
      if (ref2) seenBookingRefs.add(ref2);
    });

    rawBookings.forEach((b) => {
      const bNum = String(b.bookingNumber || b.bookingId || b.id || "").trim().toUpperCase();
      const bId = String(b.bookingId || "").trim().toUpperCase();
      if ((bNum && seenBookingRefs.has(bNum)) || (bId && seenBookingRefs.has(bId))) {
        return;
      }

      const pStat = String(b.paymentStatus || "").toLowerCase();
      const bStat = String(b.status || b.bookingStatus || "").toLowerCase();
      if (
        ["cancelled", "rejected", "refunded"].includes(pStat) ||
        ["cancelled", "rejected"].includes(bStat)
      ) {
        return;
      }

      const hasSubmittedProof = Boolean(
        String(b.paymentRef || "").trim() ||
          String(b.paymentScreenshotUrl || "").trim(),
      );
      const isVerified =
        ["paid", "advance_paid", "verified"].includes(pStat) ||
        ["confirmed", "active", "in_trip", "completed"].includes(bStat);

      // Never synthesize pending verification rows for unpaid bookings that never submitted proof
      if (!isVerified && !hasSubmittedProof) {
        return;
      }

      const isRejected = ["rejected", "cancelled"].includes(pStat);
      const status = isVerified ? "verified" : isRejected ? "rejected" : "pending";
      const firstPositive = (...vals) => {
        for (const v of vals) {
          const num = Number(v);
          if (Number.isFinite(num) && num > 0) return num;
        }
        return 0;
      };
      const displayAmt = isVerified
        ? firstPositive(
            b.verifiedCollected,
            b.paymentAmountPaid,
            b.netRentalBeforeRefund,
            b.finalAmount,
            b.totalAmount,
          )
        : firstPositive(
            b.pendingPaymentAmount,
            b.paymentAmountPaid,
            b.advanceAmount,
            b.netRentalBeforeRefund,
            b.finalAmount,
            b.totalAmount,
            b.verifiedCollected,
          );

      combined.push({
        id: b.id || b.bookingId,
        paymentId: "PAY-" + (b.bookingNumber || b.bookingId || b.id),
        bookingId: b.bookingId || b.id,
        bookingNumber: b.bookingNumber || b.bookingId || b.id,
        userName: b.userName || b.name || "Customer",
        userEmail: b.userEmail || b.email || "",
        userPhone: b.userPhone || b.phone || "",
        vehicleName: b.carName || b.vehicleName || "Vehicle",
        vehicleReg: b.vehicleReg || "",
        amount: displayAmt,
        method: b.paymentMethod || "UPI",
        utr: b.paymentRef || b.bookingNumber || b.bookingId || "",
        screenshotUrl: b.paymentScreenshotUrl || "",
        screenshotMediaId: b.paymentScreenshotMediaId || b.screenshotMediaId || "",
        status,
        verifiedBy: b.verifiedBy || "",
        createdAt: b.createdAt || b.pickupDate || "",
        pickupHubId: b.pickupHubId || b.pickup_hub_id || 0,
        dropHubId: b.dropHubId || b.drop_hub_id || 0,
      });

      if (bNum) seenBookingRefs.add(bNum);
      if (bId) seenBookingRefs.add(bId);
    });

    // Deduplicate by payment key
    const seenPay = new Set();
    const deduped = [];
    combined.forEach((p) => {
      const key = String(p.paymentId || p.id || p.utr || p.bookingId || "")
        .trim()
        .toUpperCase();
      if (key && !seenPay.has(key)) {
        seenPay.add(key);
        deduped.push(p);
      }
    });

    // Final filter excluding cancelled and refunded
    const payments = deduped.filter((p) => {
      const pStat = String(p.status || "").toLowerCase();
      const bStat = String(p.bookingStatus || "").toLowerCase();
      return (
        !["cancelled", "refunded", "rejected"].includes(pStat) &&
        !["cancelled", "rejected"].includes(bStat)
      );
    });

    allPayments = payments;
    updateStats(payments);

    const pendingCount = payments.filter(
      (p) =>
        String(p.status || "").toLowerCase() === "pending" ||
        String(p.status || "").toLowerCase() === "pending_verification",
    ).length;
    if (pendingCount === 0 && $("accountsStatusFilter")?.value === "pending") {
      const filterEl = $("accountsStatusFilter");
      if (filterEl) filterEl.value = "all";
    }

    renderPaymentsTable();
  } catch (err) {
    console.error("Error loading accounts payments:", err);
    if (wrap)
      wrap.innerHTML = `<div class="manager-state" style="padding: 24px; text-align: center; color: #ef476f;">Error loading payments: ${escapeHtml(err.message)}</div>`;
  }
}

function updateStats(payments) {
  const pendingCount = payments.filter(
    (p) =>
      String(p.status || "").toLowerCase() === "pending" ||
      String(p.status || "").toLowerCase() === "pending_verification",
  ).length;
  const verifiedCount = payments.filter((p) =>
    ["verified", "approved", "paid"].includes(
      String(p.status || "").toLowerCase(),
    ),
  ).length;

  if ($("accountsPendingCount"))
    $("accountsPendingCount").textContent = String(pendingCount);
  if ($("accountsVerifiedCount"))
    $("accountsVerifiedCount").textContent = String(verifiedCount);
}

function renderPaymentsTable() {
  const wrap = $("accountsTableWrap");
  if (!wrap) return;

  const searchQuery = ($("accountsSearchInput")?.value || "")
    .trim()
    .toLowerCase();
  const statusFilter = $("accountsStatusFilter")?.value || "all";

  let filtered = allPayments.filter((p) => {
    const status = String(p.status || "").toLowerCase();
    const isVerified = ["verified", "approved", "paid"].includes(status);
    const isRejected = ["rejected", "failed", "cancelled", "refunded", "partial_refund"].includes(status);
    const isPending = ["pending", "pending_verification"].includes(status);

    if (statusFilter === "pending" && !isPending) return false;
    if (statusFilter === "verified" && !isVerified) return false;
    if (statusFilter === "rejected" && !isRejected) return false;

    if (searchQuery) {
      const match =
        String(p.bookingId || p.id || "")
          .toLowerCase()
          .includes(searchQuery) ||
        String(p.userName || "")
          .toLowerCase()
          .includes(searchQuery) ||
        String(p.userPhone || "")
          .toLowerCase()
          .includes(searchQuery) ||
        String(p.utr || p.paymentRef || "")
          .toLowerCase()
          .includes(searchQuery) ||
        String(p.vehicleName || "")
          .toLowerCase()
          .includes(searchQuery);
      if (!match) return false;
    }

    return true;
  });

  if (!filtered.length) {
    wrap.innerHTML = `<div class="manager-state" style="padding: 32px; text-align: center; color: var(--sub);">No matching payment receipts found.</div>`;
    return;
  }

  let html = `
    <table class="manager-table accounts-table" style="width:100%; min-width:860px; border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--line); color:var(--sub); font-size:12px; text-transform:uppercase;">
          <th style="padding:12px 10px;">Date</th>
          <th style="padding:12px 10px;">Booking ID</th>
          <th style="padding:12px 10px;">Customer</th>
          <th style="padding:12px 10px;">Vehicle</th>
          <th style="padding:12px 10px;">Method / UTR</th>
          <th style="padding:12px 10px;">Verified By</th>
          <th style="padding:12px 10px;">Status</th>
          <th class="col-action">Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  filtered.forEach((p, idx) => {
    const rawStatus = String(p.status || "").toLowerCase();
    const isVerified = ["verified", "approved", "paid"].includes(rawStatus);
    const isRefunded = ["refunded", "partial_refund"].includes(rawStatus);
    const isRejected = ["rejected", "failed", "cancelled"].includes(rawStatus) || isRefunded;
    const statusClass = isVerified
      ? "verified"
      : isRejected
        ? "rejected"
        : "pending";
    const statusLabel = isVerified
      ? "VERIFIED"
      : isRefunded
        ? "REFUNDED"
        : isRejected
          ? "REJECTED"
          : "PENDING";
    const targetBid = p.bookingId || p.id || p.bookingNumber;
    const verifierName =
      p.verifiedBy || p.verified_by || (isVerified ? "—" : "—");

    html += `
      <tr style="border-bottom:1px solid rgba(255,255,255,.06); font-size:13.5px;">
        <td style="padding:12px 10px; color:var(--sub); white-space:nowrap;">${escapeHtml(formatDate(p.createdAt))}</td>
        <td style="padding:12px 10px; font-family:monospace; font-weight:700; color:var(--accent); white-space:nowrap;">#${escapeHtml(targetBid)}</td>
        <td style="padding:12px 10px;">
          <strong style="color:#fff;">${escapeHtml(p.userName || "Customer")}</strong><br/>
          <small style="color:#4fd7ff; font-size:12px;">${escapeHtml(p.userEmail || "")}</small>
          ${p.userPhone ? `<br/><small style="color:var(--sub); font-size:11.5px;">${escapeHtml(p.userPhone)}</small>` : ""}
        </td>
        <td style="padding:12px 10px;">
          <strong style="color:#fff;">${escapeHtml(p.vehicleName || "Vehicle")}</strong>
        </td>
        <td style="padding:12px 10px; font-family:monospace;">
          <span style="font-size:11px; text-transform:uppercase; background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px;">${escapeHtml(p.method || "UPI")}</span><br/>
          ${escapeHtml(p.utr || p.paymentRef || "No UTR")}
        </td>
        <td style="padding:12px 10px; color:var(--kr-cyan); font-weight:600; white-space:nowrap;">${escapeHtml(verifierName)}</td>
        <td style="padding:12px 10px; white-space:nowrap;">
          <span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
        </td>
        <td class="col-action">
          <button type="button" class="accounts-audit-btn ${isVerified ? "is-verified" : isRejected ? "is-rejected" : ""} open-payment-modal-btn" data-idx="${idx}" data-pid="${escapeHtml(targetBid)}">
            ${isVerified ? "Review Receipt" : isRejected ? "View Rejection" : "Audit Payment"}
          </button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  wrap.innerHTML = html;

  wrap.querySelectorAll(".open-payment-modal-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const pid = btn.dataset.pid;
      const item =
        !Number.isNaN(idx) && filtered[idx]
          ? filtered[idx]
          : allPayments.find(
              (p) =>
                String(
                  p.bookingId || p.id || p.bookingNumber || p.paymentId,
                ) === String(pid),
            );
      if (item) {
        openReviewModal(item);
      } else {
        console.warn("Could not find payment item for pid:", pid);
      }
    });
  });
}

async function openReviewModal(p) {
  activePaymentItem = p;
  const body = $("accountsReviewBody");
  if (!body) return;

  if (activeAccountsProofObjectUrl) {
    revokeObjectUrlSafely(activeAccountsProofObjectUrl);
    activeAccountsProofObjectUrl = "";
  }

  const proofSource =
    p.screenshotUrl ||
    p.paymentScreenshotUrl ||
    p.proofUrl ||
    p.screenshotMediaId ||
    "";
  const verifierSelect = $("accountsVerifierSelect");
  if (verifierSelect && p.verifiedBy) {
    verifierSelect.value = p.verifiedBy;
  }

  body.innerHTML = `
    <div style="display:grid; gap:12px; background:rgba(255,255,255,0.03); padding:14px; border-radius:10px; border:1px solid rgba(255,255,255,0.08);">
      <div style="display:flex; justify-content:space-between;">
        <span style="color:var(--sub);">Booking ID:</span>
        <strong style="color:var(--accent);">#${escapeHtml(p.bookingId || p.id)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="color:var(--sub);">Customer Name:</span>
        <strong style="color:#fff;">${escapeHtml(p.userName || "Customer")}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="color:var(--sub);">Payment Amount:</span>
        <strong style="color:#06d6a0; font-size:1.1rem;">${formatMoney(p.amount)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="color:var(--sub);">UTR / Ref No:</span>
        <strong style="font-family:monospace; color:#4fd7ff;">${escapeHtml(p.utr || p.paymentRef || "N/A")}</strong>
      </div>
    </div>
    ${
      proofSource
        ? `
      <div style="margin-top:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;">
          <span style="color:var(--sub); font-size:12px; font-weight:700;">PAYMENT PROOF (CLICK TO ENLARGE)</span>
          <button type="button" id="accountsProofEnlargeBtn" style="background:rgba(79,215,255,0.14); border:1px solid rgba(79,215,255,0.38); color:#4fd7ff; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; cursor:pointer;">Full View</button>
        </div>
        <div id="accountsProofZoomWrap" style="position:relative; cursor:zoom-in; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.15); background:#060a11; min-height:140px; display:flex; align-items:center; justify-content:center;" role="button" tabindex="0" title="Click to enlarge payment proof">
          <div style="color:var(--sub); font-size:13px; padding:20px;">Loading payment proof preview…</div>
        </div>
      </div>
    `
        : `
      <div style="margin-top:14px; background:rgba(79, 215, 255, 0.07); border:1px dashed rgba(79, 215, 255, 0.35); border-radius:8px; padding:14px; text-align:center;">
        <span style="display:block; color:#4fd7ff; font-weight:700; font-size:13px; margin-bottom:4px;">No Screenshot Attached by Customer</span>
        <p style="color:var(--sub); font-size:12px; margin:0 0 8px 0;">Customer submitted a direct UPI / Bank transfer with the UTR reference below:</p>
        <span style="display:inline-block; background:rgba(255,255,255,0.08); padding:4px 10px; border-radius:6px; font-family:monospace; font-weight:700; color:#06d6a0;">UTR: ${escapeHtml(p.utr || p.paymentRef || "N/A")}</span>
      </div>
    `
    }
  `;

  showModal("accountsReviewModal");

  const zoomWrap = $("accountsProofZoomWrap");
  const enlargeBtn = $("accountsProofEnlargeBtn");
  const openFullViewer = () => {
    openImageLightbox(
      proofSource,
      `Payment Proof — Booking #${p.bookingId || p.id}`,
      `${p.userName || "Customer"} · Ref: ${p.utr || p.paymentRef || "N/A"}`,
    );
  };

  if (enlargeBtn && proofSource) {
    enlargeBtn.addEventListener("click", openFullViewer);
  }

  if (zoomWrap && proofSource) {
    zoomWrap.addEventListener("click", openFullViewer);

    try {
      const preview = await fetchProtectedMediaPreview(proofSource);
      if (activePaymentItem !== p || !zoomWrap.isConnected) {
        if (preview.isBlob) revokeObjectUrlSafely(preview.url);
        return;
      }

      if (preview.isBlob) {
        activeAccountsProofObjectUrl = preview.url;
      }

      if (preview.isPdf) {
        zoomWrap.innerHTML = `
          <iframe src="${escapeHtml(preview.url)}#toolbar=0" title="Payment proof PDF" style="width:100%; height:300px; border:none; background:#0b1322; display:block;"></iframe>
        `;
      } else if (preview.isNonInline) {
        const extLabel = (preview.ext || "FILE").toUpperCase();
        zoomWrap.innerHTML = `
          <div style="padding:22px; text-align:center;">
            <div style="display:inline-block; padding:4px 12px; border-radius:999px; background:rgba(56,189,248,0.16); color:#38bdf8; font-size:12px; font-weight:800; margin-bottom:8px;">${escapeHtml(extLabel)}</div>
            <div style="color:#e2e8f0; font-size:13px; font-weight:600;">Click "Full View" to inspect or download this ${escapeHtml(extLabel)} receipt.</div>
          </div>
        `;
      } else {
        zoomWrap.innerHTML = `
          <img src="${escapeHtml(preview.url)}" alt="Payment proof" style="width:100%; max-height:280px; object-fit:contain; display:block; transition:transform 200ms ease;" />
          <div style="position:absolute; bottom:8px; right:8px; background:rgba(3,7,13,0.85); backdrop-filter:blur(8px); color:#4fd7ff; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; border:1px solid rgba(79,215,255,0.4); pointer-events:none; display:inline-flex; align-items:center; gap:5px;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            <span>Click to Enlarge</span>
          </div>
        `;
      }
    } catch (err) {
      if (activePaymentItem !== p || !zoomWrap.isConnected) return;
      zoomWrap.innerHTML = `
        <div style="padding:18px; text-align:center; color:#fca5a5; font-size:12px;">
          <strong style="display:block; margin-bottom:4px;">Unable to load payment proof preview</strong>
          <span style="color:var(--sub);">${escapeHtml(err?.message || "Click Full View to retry or download.")}</span>
        </div>
      `;
    }
  }
}

async function handleApprovePayment() {
  if (!activePaymentItem) return;
  const targetId =
    activePaymentItem.bookingId ||
    activePaymentItem.id ||
    activePaymentItem.bookingNumber;
  const verifierName =
    $("accountsVerifierSelect")?.value || currentUser?.name || "Admin";

  const btn = $("accountsApproveBtn");
  if (btn) btn.disabled = true;

  try {
    const res = await api.post(
      `/payments/${encodeURIComponent(targetId)}/verify`,
      {
        action: "approve",
        paymentId: activePaymentItem.paymentId || activePaymentItem.id || null,
        verifiedBy: verifierName,
      },
    );

    hideModal("accountsReviewModal");
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const ch = new BroadcastChannel("kruizly_kpi_sync");
        ch.postMessage({ type: "KPI_UPDATED", timestamp: Date.now() });
        ch.close();
      }
      localStorage.setItem("kruizly_kpi_last_sync", String(Date.now()));
    } catch (_) {}
    alert(`Payment #${targetId} verified & approved by ${verifierName}!`);
    await loadPaymentsData();
  } catch (err) {
    alert("Could not approve payment: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleRejectPayment() {
  if (!activePaymentItem) return;
  const targetId =
    activePaymentItem.bookingId ||
    activePaymentItem.id ||
    activePaymentItem.bookingNumber;
  const verifierName =
    $("accountsVerifierSelect")?.value || currentUser?.name || "Admin";
  const reasonWrap = $("accountsRejectionReasonWrap");

  if (reasonWrap && reasonWrap.style.display === "none") {
    reasonWrap.style.display = "block";
    $("accountsRejectionReason")?.focus();
    return;
  }

  const reason =
    $("accountsRejectionReason")?.value?.trim() ||
    "Payment receipt could not be verified.";
  const btn = $("accountsRejectBtn");
  if (btn) btn.disabled = true;

  try {
    await api.post(`/payments/${encodeURIComponent(targetId)}/verify`, {
      action: "reject",
      paymentId: activePaymentItem.paymentId || activePaymentItem.id || null,
      reason,
      verifiedBy: verifierName,
    });

    if (reasonWrap) reasonWrap.style.display = "none";
    hideModal("accountsReviewModal");
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const ch = new BroadcastChannel("kruizly_kpi_sync");
        ch.postMessage({ type: "KPI_UPDATED", timestamp: Date.now() });
        ch.close();
      }
      localStorage.setItem("kruizly_kpi_last_sync", String(Date.now()));
    } catch (_) {}
    alert(`Payment #${targetId} rejected.`);
    await loadPaymentsData();
  } catch (err) {
    alert("Could not reject payment: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showModal(id) {
  const m = $(id);
  if (m) {
    m.hidden = false;
    m.removeAttribute("hidden");
    m.style.display = "flex";
  }
}

function hideModal(id) {
  if (id === "accountsReviewModal" && activeAccountsProofObjectUrl) {
    revokeObjectUrlSafely(activeAccountsProofObjectUrl);
    activeAccountsProofObjectUrl = "";
  }
  const m = $(id);
  if (m) {
    m.hidden = true;
    m.setAttribute("hidden", "hidden");
    m.style.display = "none";
  }
}

// Start
initAccounts();
