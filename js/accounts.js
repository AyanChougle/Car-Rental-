/**
 * js/accounts.js
 * 
 * Accounts & Financial Verification Console:
 * - Payment Audit Queue (UPI & Bank Transfers)
 * - Verifier Selection (Ayan Chougle, Omkar Tapshale, Rahul Sharma)
 * - Image & Screenshot Proof Preview
 * - Invoice Generation & Verification Tracking
 */

import { auth } from "./firebase-init.js";
import { checkAuth, getCurrentUser, setStoredUser, isAccountantUser, isAdminUser } from "./auth.js?v=20260908-v5";
import { api } from "./kruizly-api.js?v=20260908-v5";
import "./nav-helper.js?v=20260908-v5";

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
      year: "numeric"
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
}

async function loadPaymentsData() {
  const wrap = $("accountsTableWrap");
  if (wrap) wrap.innerHTML = `<div class="manager-state" style="padding: 28px; text-align: center; color: var(--sub);">Loading payment records...</div>`;

  try {
    const [paymentsRes, bookingsRes] = await Promise.allSettled([
      api.get("/payments"),
      api.get("/bookings")
    ]);

    let payments = [];
    if (paymentsRes.status === "fulfilled" && paymentsRes.value && Array.isArray(paymentsRes.value.payments)) {
      payments = paymentsRes.value.payments;
    }

    let bookings = [];
    if (bookingsRes.status === "fulfilled" && bookingsRes.value && Array.isArray(bookingsRes.value.bookings)) {
      bookings = bookingsRes.value.bookings;
    }

    // Merge fallback bookings if payments endpoint returned empty
    if (!payments.length && bookings.length) {
      payments = bookings
        .filter((b) => b.paymentStatus || b.paymentRef || b.paymentScreenshotUrl)
        .map((b) => ({
          id: b.id || b.bookingId,
          bookingId: b.id || b.bookingId,
          bookingNumber: b.bookingNumber || b.id,
          userName: b.userName || b.name || "Customer",
          userEmail: b.userEmail || b.email || "",
          userPhone: b.userPhone || b.phone || "",
          vehicleName: b.carName || b.vehicleName || "Vehicle",
          vehicleReg: b.vehicleReg || "",
          amount: Number(b.paymentAmountPaid || b.advanceAmount || b.totalAmount || 0),
          method: b.paymentMethod || "UPI",
          utr: b.paymentRef || "",
          screenshotUrl: b.paymentScreenshotUrl || "",
          status: String(b.paymentStatus || b.status || "").toLowerCase() === "paid" || String(b.paymentStatus || b.status || "").toLowerCase() === "confirmed" ? "verified" : String(b.paymentStatus || b.status || "").toLowerCase() === "rejected" ? "rejected" : "pending",
          verifiedBy: b.verifiedBy || "",
          createdAt: b.createdAt || b.pickupDate || ""
        }));
    }

    // Strictly deduplicate by paymentId, bookingId, or id
    const seenPay = new Set();
    const deduped = [];
    payments.forEach((p) => {
      const key = String(p.paymentId || p.id || p.utr || p.bookingId || "").trim().toUpperCase();
      if (key && !seenPay.has(key)) {
        seenPay.add(key);
        deduped.push(p);
      }
    });
    payments = deduped;

    allPayments = payments;
    updateStats(payments);
    renderPaymentsTable();
  } catch (err) {
    console.error("Error loading accounts payments:", err);
    if (wrap) wrap.innerHTML = `<div class="manager-state" style="padding: 24px; text-align: center; color: #ef476f;">Error loading payments: ${escapeHtml(err.message)}</div>`;
  }
}

function updateStats(payments) {
  const pendingCount = payments.filter((p) => String(p.status || "").toLowerCase() === "pending" || String(p.status || "").toLowerCase() === "pending_verification").length;
  const verifiedCount = payments.filter((p) => ["verified", "approved", "paid"].includes(String(p.status || "").toLowerCase())).length;
  const totalVol = payments
    .filter((p) => ["verified", "approved", "paid"].includes(String(p.status || "").toLowerCase()))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  if ($("accountsPendingCount")) $("accountsPendingCount").textContent = String(pendingCount);
  if ($("accountsVerifiedCount")) $("accountsVerifiedCount").textContent = String(verifiedCount);
  if ($("accountsTotalVolume")) $("accountsTotalVolume").textContent = formatMoney(totalVol);
}

function renderPaymentsTable() {
  const wrap = $("accountsTableWrap");
  if (!wrap) return;

  const searchQuery = ($("accountsSearchInput")?.value || "").trim().toLowerCase();
  const statusFilter = $("accountsStatusFilter")?.value || "all";

  let filtered = allPayments.filter((p) => {
    const status = String(p.status || "").toLowerCase();
    const isVerified = ["verified", "approved", "paid"].includes(status);
    const isRejected = ["rejected", "failed", "cancelled"].includes(status);
    const isPending = !isVerified && !isRejected;

    if (statusFilter === "pending" && !isPending) return false;
    if (statusFilter === "verified" && !isVerified) return false;
    if (statusFilter === "rejected" && !isRejected) return false;

    if (searchQuery) {
      const match =
        String(p.bookingId || p.id || "").toLowerCase().includes(searchQuery) ||
        String(p.userName || "").toLowerCase().includes(searchQuery) ||
        String(p.userPhone || "").toLowerCase().includes(searchQuery) ||
        String(p.utr || p.paymentRef || "").toLowerCase().includes(searchQuery) ||
        String(p.vehicleName || "").toLowerCase().includes(searchQuery);
      if (!match) return false;
    }

    return true;
  });

  if (!filtered.length) {
    wrap.innerHTML = `<div class="manager-state" style="padding: 32px; text-align: center; color: var(--sub);">No matching payment receipts found.</div>`;
    return;
  }

  let html = `
    <table class="manager-table" style="width:100%; min-width:980px; border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--line); color:var(--sub); font-size:12px; text-transform:uppercase;">
          <th style="padding:12px;">Date</th>
          <th style="padding:12px;">Booking ID</th>
          <th style="padding:12px;">Customer</th>
          <th style="padding:12px;">Vehicle</th>
          <th style="padding:12px;">Amount</th>
          <th style="padding:12px;">Method / UTR</th>
          <th style="padding:12px;">Verified By</th>
          <th style="padding:12px;">Status</th>
          <th style="padding:12px 16px; text-align:right; min-width:160px;">Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  filtered.forEach((p) => {
    const rawStatus = String(p.status || "").toLowerCase();
    const isVerified = ["verified", "approved", "paid"].includes(rawStatus);
    const isRejected = ["rejected", "failed", "cancelled"].includes(rawStatus);
    const statusClass = isVerified ? "verified" : isRejected ? "rejected" : "pending";
    const statusLabel = isVerified ? "VERIFIED" : isRejected ? "REJECTED" : "PENDING";
    const targetBid = p.bookingId || p.id || p.bookingNumber;
    const verifierName = p.verifiedBy || p.verified_by || (isVerified ? "Ayan Chougle" : "—");

    html += `
      <tr style="border-bottom:1px solid rgba(255,255,255,.06); font-size:13.5px;">
        <td style="padding:12px; color:var(--sub); white-space:nowrap;">${escapeHtml(formatDate(p.createdAt))}</td>
        <td style="padding:12px; font-family:monospace; font-weight:700; color:var(--accent); white-space:nowrap;">#${escapeHtml(targetBid)}</td>
        <td style="padding:12px;">
          <strong style="color:#fff;">${escapeHtml(p.userName || "Customer")}</strong><br/>
          <small style="color:#4fd7ff; font-size:12px;">${escapeHtml(p.userEmail || "")}</small>
          ${p.userPhone ? `<br/><small style="color:var(--sub); font-size:11.5px;">${escapeHtml(p.userPhone)}</small>` : ""}
        </td>
        <td style="padding:12px;">
          <strong>${escapeHtml(p.vehicleName || "Vehicle")}</strong>
          ${p.vehicleReg ? `<br/><small style="color:var(--sub); font-family:monospace;">${escapeHtml(p.vehicleReg)}</small>` : ""}
        </td>
        <td style="padding:12px; font-weight:700; color:#fff; white-space:nowrap;">${formatMoney(p.amount)}</td>
        <td style="padding:12px; font-family:monospace;">
          <span style="font-size:11px; text-transform:uppercase; background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px;">${escapeHtml(p.method || "UPI")}</span><br/>
          ${escapeHtml(p.utr || p.paymentRef || "No UTR")}
        </td>
        <td style="padding:12px; color:var(--kr-cyan); font-weight:600; white-space:nowrap;">${escapeHtml(verifierName)}</td>
        <td style="padding:12px; white-space:nowrap;">
          <span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
        </td>
        <td style="padding:12px 16px; text-align:right; white-space:nowrap; min-width:160px;">
          <button type="button" class="accounts-audit-btn ${isVerified ? "is-verified" : isRejected ? "is-rejected" : ""} open-payment-modal-btn" data-pid="${escapeHtml(targetBid)}">
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
      const pid = btn.dataset.pid;
      const item = allPayments.find((p) => String(p.bookingId || p.id || p.bookingNumber) === String(pid));
      if (item) openReviewModal(item);
    });
  });
}

function openReviewModal(p) {
  activePaymentItem = p;
  const body = $("accountsReviewBody");
  if (!body) return;

  const proofUrl = p.screenshotUrl || p.paymentScreenshotUrl || p.proofUrl || "";
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
    ${proofUrl ? `
      <div style="margin-top:14px;">
        <span style="color:var(--sub); font-size:12px; font-weight:700; display:block; margin-bottom:6px;">PAYMENT PROOF SCREENSHOT</span>
        <img src="${escapeHtml(proofUrl)}" alt="Payment proof" style="width:100%; max-height:280px; object-fit:contain; border-radius:8px; border:1px solid rgba(255,255,255,0.15);" />
      </div>
    ` : `
      <div style="margin-top:14px; background:rgba(79, 215, 255, 0.07); border:1px dashed rgba(79, 215, 255, 0.35); border-radius:8px; padding:14px; text-align:center;">
        <span style="display:block; color:#4fd7ff; font-weight:700; font-size:13px; margin-bottom:4px;">No Screenshot Attached by Customer</span>
        <p style="color:var(--sub); font-size:12px; margin:0 0 8px 0;">Customer submitted a direct UPI / Bank transfer with the UTR reference below:</p>
        <span style="display:inline-block; background:rgba(255,255,255,0.08); padding:4px 10px; border-radius:6px; font-family:monospace; font-weight:700; color:#06d6a0;">UTR: ${escapeHtml(p.utr || p.paymentRef || "N/A")}</span>
      </div>
    `}
  `;

  showModal("accountsReviewModal");
}

async function handleApprovePayment() {
  if (!activePaymentItem) return;
  const targetId = activePaymentItem.bookingId || activePaymentItem.id || activePaymentItem.bookingNumber;
  const verifierName = $("accountsVerifierSelect")?.value || "Ayan Chougle";

  const btn = $("accountsApproveBtn");
  if (btn) btn.disabled = true;

  try {
    const res = await api.post(`/payments/${encodeURIComponent(targetId)}/verify`, {
      action: "approve",
      verifiedBy: verifierName
    });

    hideModal("accountsReviewModal");
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
  const targetId = activePaymentItem.bookingId || activePaymentItem.id || activePaymentItem.bookingNumber;
  const verifierName = $("accountsVerifierSelect")?.value || "Ayan Chougle";
  const reasonWrap = $("accountsRejectionReasonWrap");

  if (reasonWrap && reasonWrap.style.display === "none") {
    reasonWrap.style.display = "block";
    $("accountsRejectionReason")?.focus();
    return;
  }

  const reason = $("accountsRejectionReason")?.value?.trim() || "Payment receipt could not be verified.";
  const btn = $("accountsRejectBtn");
  if (btn) btn.disabled = true;

  try {
    await api.post(`/payments/${encodeURIComponent(targetId)}/verify`, {
      action: "reject",
      reason,
      verifiedBy: verifierName
    });

    if (reasonWrap) reasonWrap.style.display = "none";
    hideModal("accountsReviewModal");
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
  const m = $(id);
  if (m) {
    m.hidden = true;
    m.setAttribute("hidden", "hidden");
    m.style.display = "none";
  }
}

// Start
initAccounts();
