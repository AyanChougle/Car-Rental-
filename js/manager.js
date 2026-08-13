import { auth, db } from "./firebase-init.js";

import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import "./nav-helper.js";
import { openReturnModal } from "./return-inspection.js";

/* =========================================================
   ELEMENTS
========================================================= */

const managerContent = document.getElementById("managerContent");
const accessDenied = document.getElementById("managerAccessDenied");

const activeCountEl = document.getElementById("mgrActiveCount");
const pickupCountEl = document.getElementById("mgrPickupCount");
const pendingDocCountEl = document.getElementById("mgrPendingDocCount");

const bookingsWrap = document.getElementById("mgrBookingsWrap");
const docsWrap = document.getElementById("mgrDocsWrap");

let currentUser = null;
let currentManagerBookings = [];

/* =========================================================
   FORCE HIDDEN STATE
   This prevents CSS from overriding the HTML hidden attribute.
========================================================= */

function setVisible(element, visible) {
  if (!element) return;

  element.hidden = !visible;
  element.style.display = visible ? "" : "none";
}

/* =========================================================
   AUTH / MANAGER ACCESS
========================================================= */

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  // Start with everything hidden.
  setVisible(managerContent, false);
  setVisible(accessDenied, false);

  if (!user) {
    showAccessDenied();
    return;
  }

  try {
    const userSnap = await getDoc(
      doc(db, "users", user.uid)
    );

    if (!userSnap.exists()) {
      showAccessDenied();
      return;
    }

    const userData = userSnap.data();

    const role = String(
      userData.role || ""
    ).trim().toLowerCase();

    console.log("Manager user role:", role);

    if (role === "manager" || role === "admin") {
      setVisible(accessDenied, false);
      setVisible(managerContent, true);

      await loadManagerData();
    } else {
      showAccessDenied();
    }
  } catch (error) {
    console.error(
      "Manager authentication error:",
      error
    );

    showAccessDenied();
  }
});

/* =========================================================
   ACCESS DENIED
========================================================= */

function showAccessDenied() {
  setVisible(accessDenied, true);
  setVisible(managerContent, false);
}

/* =========================================================
   LOAD ALL DATA
========================================================= */

async function loadManagerData() {
  await Promise.all([
    loadManagerBookings(),
    loadManagerDocs(),
  ]);
}

/* =========================================================
   BOOKINGS
========================================================= */

async function loadManagerBookings() {
  if (!bookingsWrap) return;

  bookingsWrap.innerHTML = `
    <p style="color: var(--sub);">
      Loading bookings...
    </p>
  `;

  try {
    const snap = await getDocs(
      collection(db, "bookings")
    );

    const bookings = snap.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    currentManagerBookings = bookings;

    /* =====================================================
       ACTIVE TRIPS
    ===================================================== */

    const activeTrips = bookings.filter(
      (booking) =>
        booking.status === "confirmed"
    );

    if (activeCountEl) {
      activeCountEl.textContent =
        activeTrips.length;
    }

    /* =====================================================
       PICKUPS TODAY
    ===================================================== */

    const today = new Date();

    const todayISO =
      today.getFullYear() +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0");

    const pickupsToday = bookings.filter(
      (booking) =>
        booking.pickupDate === todayISO &&
        booking.status === "confirmed"
    );

    if (pickupCountEl) {
      pickupCountEl.textContent =
        pickupsToday.length;
    }

    renderManagerBookingsTable(bookings);

  } catch (error) {
    console.error(
      "Error loading manager bookings:",
      error
    );

    bookingsWrap.innerHTML = `
      <div style="
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 12px;
      ">

        <p style="
          color: #ef476f;
          margin-bottom: 8px;
        ">
          Couldn't load bookings.
        </p>

        <small style="color: var(--sub);">
          ${escapeHtml(
            error.message || "Unknown error"
          )}
        </small>

      </div>
    `;
  }
}

/* =========================================================
   BOOKING TABLE
========================================================= */

function renderManagerBookingsTable(bookings) {
  if (!bookingsWrap) return;

  if (!bookings.length) {
    bookingsWrap.innerHTML = `
      <div style="
        padding: 30px;
        text-align: center;
        color: var(--sub);
      ">
        No bookings currently in the system.
      </div>
    `;

    return;
  }

  let html = `
    <div style="
      width: 100%;
      overflow-x: auto;
    ">

      <table
        class="admin-table"
        style="
          width: 100%;
          min-width: 950px;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.9rem;
        "
      >

        <thead>

          <tr style="
            border-bottom: 1px solid var(--line);
            color: var(--sub);
          ">

            <th style="padding: 14px;">
              Customer
            </th>

            <th style="padding: 14px;">
              Vehicle
            </th>

            <th style="padding: 14px;">
              Pickup
            </th>

            <th style="padding: 14px;">
              Return
            </th>

            <th style="padding: 14px;">
              Status
            </th>

            <th style="
              padding: 14px;
              text-align: right;
            ">
              Action
            </th>

          </tr>

        </thead>

        <tbody>
  `;

  bookings.forEach((booking) => {
    const status = String(
      booking.status || "unknown"
    )
      .trim()
      .toLowerCase();

    /* =====================================================
       CUSTOMER
    ===================================================== */

    const customer =
      booking.userName ||
      booking.customerName ||
      booking.name ||
      "Customer";

    const phone =
      booking.userPhone ||
      booking.phone ||
      booking.userEmail ||
      booking.email ||
      "—";

    /* =====================================================
       VEHICLE
    ===================================================== */

    const vehicle =
      booking.vehicleName ||
      booking.carName ||
      booking.vehicle ||
      "Vehicle";

    const registration =
      booking.vehicleReg ||
      booking.regNumber ||
      booking.registration ||
      "—";

    /* =====================================================
       DATES
    ===================================================== */

    const pickup =
      booking.pickupDate ||
      booking.startDate ||
      "—";

    const drop =
      booking.dropDate ||
      booking.returnDate ||
      booking.endDate ||
      "—";

    /* =====================================================
       STATUS CLASS
    ===================================================== */

    let statusClass = "pending";

    if (
      status === "confirmed" ||
      status === "completed"
    ) {
      statusClass = "verified";
    }

    if (
      status === "cancelled" ||
      status === "rejected" ||
      status === "failed"
    ) {
      statusClass = "rejected";
    }

    /* =====================================================
       ACTIONS
    ===================================================== */

    let actionCell = `
      <span style="
        color: var(--sub);
        font-size: 0.8rem;
      ">
        —
      </span>
    `;

    /* -----------------------------------------------------
       CONFIRMED BOOKING
    ----------------------------------------------------- */

    if (status === "confirmed") {
      actionCell = `
        <div style="
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          align-items: center;
          flex-wrap: wrap;
        ">

          <button
            type="button"
            class="btn btn-dark process-return-btn"
            data-booking-id="${escapeHtml(booking.id)}"
            style="
              white-space: nowrap;
            "
          >
            Process Return
          </button>

          <button
            type="button"
            class="btn btn-outline mgr-status-btn"
            data-booking-id="${escapeHtml(booking.id)}"
            data-status="cancelled"
            style="
              color: #ef476f;
              border-color: #ef476f;
              white-space: nowrap;
            "
          >
            Cancel
          </button>

        </div>
      `;
    }

    /* -----------------------------------------------------
       COMPLETED BOOKING
       
       IMPORTANT:
       Do NOT call openReturnModal() here.
       We use a dedicated report button.
    ----------------------------------------------------- */

    if (status === "completed") {
      actionCell = `
        <button
          type="button"
          class="btn btn-outline view-return-report-btn"
          data-booking-id="${escapeHtml(booking.id)}"
          style="
            white-space: nowrap;
          "
        >
          View Return Report
        </button>
      `;
    }

    /* =====================================================
       ROW
    ===================================================== */

    html += `
      <tr style="
        border-bottom:
          1px solid rgba(255,255,255,0.06);
      ">

        <td style="padding: 14px;">

          <strong>
            ${escapeHtml(customer)}
          </strong>

          <br>

          <span style="
            color: var(--sub);
            font-size: 0.8rem;
          ">
            ${escapeHtml(phone)}
          </span>

        </td>

        <td style="padding: 14px;">

          ${escapeHtml(vehicle)}

          <br>

          <span style="
            color: var(--sub);
            font-size: 0.8rem;
          ">
            ${escapeHtml(registration)}
          </span>

        </td>

        <td style="padding: 14px;">
          ${escapeHtml(pickup)}
        </td>

        <td style="padding: 14px;">
          ${escapeHtml(drop)}
        </td>

        <td style="padding: 14px;">

          <span class="
            fleet-status
            ${statusClass}
          ">
            ${escapeHtml(formatStatus(status))}
          </span>

        </td>

        <td style="
          padding: 14px;
          text-align: right;
        ">

          ${actionCell}

        </td>

      </tr>
    `;
  });

  html += `
        </tbody>

      </table>

    </div>
  `;

  bookingsWrap.innerHTML = html;

  attachBookingButtonEvents();
}

/* =========================================================
   BOOKING BUTTON EVENTS
========================================================= */

function attachBookingButtonEvents() {

  /* =====================================================
     CANCEL BUTTONS
  ===================================================== */

  const statusButtons =
    bookingsWrap.querySelectorAll(
      ".mgr-status-btn"
    );

  statusButtons.forEach((button) => {

    button.addEventListener(
      "click",
      async (event) => {

        event.preventDefault();

        const bookingId =
          button.dataset.bookingId;

        const newStatus =
          button.dataset.status;

        if (!bookingId) {
          alert(
            "This booking does not have a valid ID."
          );
          return;
        }

        const confirmed =
          window.confirm(
            "Are you sure you want to cancel this booking?"
          );

        if (!confirmed) return;

        const originalText =
          button.textContent;

        button.disabled = true;
        button.textContent =
          "Cancelling...";

        try {

          await updateDoc(
            doc(
              db,
              "bookings",
              bookingId
            ),
            {
              status: newStatus,
              updatedAt: new Date(),
            }
          );

          await loadManagerBookings();

        } catch (error) {

          console.error(
            "Failed to cancel booking:",
            error
          );

          alert(
            "Failed to cancel booking.\n\n" +
            error.message
          );

          button.disabled = false;
          button.textContent =
            originalText;
        }
      }
    );

  });

  /* =====================================================
     PROCESS RETURN BUTTONS
  ===================================================== */

  const returnButtons =
    bookingsWrap.querySelectorAll(
      ".process-return-btn"
    );

  returnButtons.forEach((button) => {

    button.addEventListener(
      "click",
      async (event) => {

        event.preventDefault();

        const bookingId =
          button.dataset.bookingId;

        if (!bookingId) {
          alert(
            "This booking does not have a valid ID."
          );
          return;
        }

        const booking =
          currentManagerBookings.find(
            (item) =>
              item.id === bookingId
          );

        if (!booking) {
          alert(
            "Could not find this booking."
          );
          return;
        }

        try {

          openReturnModal({
            booking,
            currentUser,

            onSaved: async () => {
              await loadManagerBookings();
            },
          });

        } catch (error) {

          console.error(
            "Failed to open return inspection:",
            error
          );

          alert(
            "Could not open the return inspection.\n\n" +
            error.message
          );
        }
      }
    );

  });

  /* =====================================================
     VIEW RETURN REPORT BUTTONS
     
     THIS IS THE IMPORTANT FIX.
  ===================================================== */

  const reportButtons =
    bookingsWrap.querySelectorAll(
      ".view-return-report-btn"
    );

  reportButtons.forEach((button) => {

    button.addEventListener(
      "click",
      async (event) => {

        event.preventDefault();

        const bookingId =
          button.dataset.bookingId;

        if (!bookingId) {
          alert(
            "This booking does not have a valid ID."
          );
          return;
        }

        const booking =
          currentManagerBookings.find(
            (item) =>
              item.id === bookingId
          );

        if (!booking) {
          alert(
            "Could not find this booking."
          );
          return;
        }

        openReturnReport(booking);
      }
    );

  });
}

/* =========================================================
   RETURN REPORT
========================================================= */

function openReturnReport(booking) {

  const inspection =
    booking.returnInspection || {};

  const overlay =
    document.createElement("div");

  overlay.id =
    "managerReturnReportOverlay";

  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;

    display: flex;
    align-items: center;
    justify-content: center;

    padding: 24px;

    background: rgba(0,0,0,0.82);

    backdrop-filter: blur(10px);

    overflow-y: auto;
  `;

  const vehicleName =
    booking.vehicleName ||
    booking.carName ||
    "Vehicle";

  const registration =
    booking.vehicleReg ||
    booking.regNumber ||
    booking.registration ||
    "—";

  const customer =
    booking.userName ||
    booking.customerName ||
    "Customer";

  const deposit =
    getNumber(
      inspection.securityDeposit ??
      inspection.deposit ??
      booking.securityDeposit ??
      booking.deposit ??
      0
    );

  const deductions =
    getNumber(
      inspection.totalDeductions ??
      inspection.deductions ??
      inspection.deductionTotal ??
      0
    );

  const refund =
    getNumber(
      inspection.refundableAmount ??
      inspection.depositRefund ??
      inspection.refundAmount ??
      Math.max(deposit - deductions, 0)
    );

  const notes =
    inspection.invoiceNotes ||
    inspection.notes ||
    booking.returnNotes ||
    "No inspection notes were added.";

  const completedAt =
    formatDateTime(
      inspection.completedAt ||
      inspection.returnedAt ||
      booking.completedAt
    );

  const inspectedBy =
    inspection.inspectedByName ||
    inspection.inspectedBy ||
    booking.returnedBy ||
    "Manager";

  /* =====================================================
     INSPECTION ITEMS
  ===================================================== */

  const items =
    inspection.items ||
    inspection.checklist ||
    inspection.damageItems ||
    [];

  let itemsHtml = "";

  if (Array.isArray(items) && items.length) {

    itemsHtml = `
      <div style="
        margin-top: 24px;
      ">

        <h4 style="
          margin: 0 0 12px;
          font-size: 1rem;
        ">
          Inspection Items
        </h4>

        <div style="
          display: flex;
          flex-direction: column;
          gap: 8px;
        ">

          ${items.map((item) => {

            if (
              typeof item === "string"
            ) {
              return `
                <div style="
                  padding: 12px;
                  border: 1px solid var(--line);
                  border-radius: 10px;
                ">
                  ${escapeHtml(item)}
                </div>
              `;
            }

            const title =
              item.name ||
              item.title ||
              item.label ||
              item.description ||
              "Inspection item";

            const amount =
              getNumber(
                item.amount ??
                item.deduction ??
                item.cost ??
                0
              );

            const status =
              item.status ||
              item.condition ||
              (item.checked
                ? "Checked"
                : "");

            return `
              <div style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;

                padding: 12px;

                border: 1px solid var(--line);
                border-radius: 10px;
              ">

                <div>

                  <strong>
                    ${escapeHtml(title)}
                  </strong>

                  ${
                    status
                      ? `
                        <div style="
                          margin-top: 4px;
                          color: var(--sub);
                          font-size: 0.82rem;
                        ">
                          ${escapeHtml(status)}
                        </div>
                      `
                      : ""
                  }

                </div>

                ${
                  amount > 0
                    ? `
                      <strong style="
                        color: #ef476f;
                        white-space: nowrap;
                      ">
                        ₹${formatMoney(amount)}
                      </strong>
                    `
                    : ""
                }

              </div>
            `;
          }).join("")}

        </div>

      </div>
    `;

  } else {

    itemsHtml = `
      <div style="
        margin-top: 24px;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 10px;
        color: var(--sub);
        font-size: 0.9rem;
      ">
        No individual inspection items were recorded.
      </div>
    `;
  }

  /* =====================================================
     CREATE REPORT
  ===================================================== */

  overlay.innerHTML = `

    <div style="
      width: min(720px, 100%);
      max-height: 90vh;
      overflow-y: auto;

      background: rgba(18,20,21,0.98);

      border: 1px solid var(--line);
      border-radius: 18px;

      padding: 28px;

      box-shadow:
        0 25px 80px rgba(0,0,0,0.5);
    ">

      <!-- HEADER -->

      <div style="
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
      ">

        <div>

          <span style="
            display: block;
            color: var(--accent);
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            margin-bottom: 6px;
          ">
            Return Inspection
          </span>

          <h3 style="
            margin: 0;
            font-size: 1.35rem;
          ">
            Return Report
          </h3>

        </div>

        <button
          type="button"
          id="closeManagerReturnReport"
          style="
            width: 36px;
            height: 36px;

            border: 1px solid var(--line);
            border-radius: 50%;

            background: transparent;
            color: var(--text);

            font-size: 1.4rem;
            line-height: 1;

            cursor: pointer;
          "
        >
          &times;
        </button>

      </div>

      <!-- VEHICLE INFO -->

      <div style="
        margin-top: 22px;

        display: grid;
        grid-template-columns:
          repeat(auto-fit, minmax(200px, 1fr));

        gap: 12px;
      ">

        <div style="
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 12px;
        ">

          <div style="
            color: var(--sub);
            font-size: 0.75rem;
            margin-bottom: 5px;
          ">
            Vehicle
          </div>

          <strong>
            ${escapeHtml(vehicleName)}
          </strong>

        </div>

        <div style="
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 12px;
        ">

          <div style="
            color: var(--sub);
            font-size: 0.75rem;
            margin-bottom: 5px;
          ">
            Registration
          </div>

          <strong>
            ${escapeHtml(registration)}
          </strong>

        </div>

        <div style="
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 12px;
        ">

          <div style="
            color: var(--sub);
            font-size: 0.75rem;
            margin-bottom: 5px;
          ">
            Customer
          </div>

          <strong>
            ${escapeHtml(customer)}
          </strong>

        </div>

      </div>

      <!-- FINANCIAL SUMMARY -->

      <div style="
        margin-top: 22px;

        border: 1px solid var(--line);
        border-radius: 12px;

        overflow: hidden;
      ">

        <div style="
          display: flex;
          justify-content: space-between;
          gap: 20px;

          padding: 14px 16px;

          border-bottom: 1px solid var(--line);
        ">

          <span style="color: var(--sub);">
            Security Deposit
          </span>

          <strong>
            ₹${formatMoney(deposit)}
          </strong>

        </div>

        <div style="
          display: flex;
          justify-content: space-between;
          gap: 20px;

          padding: 14px 16px;

          border-bottom: 1px solid var(--line);
        ">

          <span style="color: var(--sub);">
            Total Deductions
          </span>

          <strong style="color: #ef476f;">
            ₹${formatMoney(deductions)}
          </strong>

        </div>

        <div style="
          display: flex;
          justify-content: space-between;
          gap: 20px;

          padding: 16px;

          background: rgba(255,255,255,0.025);
        ">

          <span>
            Refundable to Customer
          </span>

          <strong style="
            color: var(--accent);
            font-size: 1.1rem;
          ">
            ₹${formatMoney(refund)}
          </strong>

        </div>

      </div>

      ${itemsHtml}

      <!-- NOTES -->

      <div style="
        margin-top: 24px;
      ">

        <h4 style="
          margin: 0 0 10px;
          font-size: 1rem;
        ">
          Inspection Notes
        </h4>

        <div style="
          padding: 14px;

          border: 1px solid var(--line);
          border-radius: 10px;

          color: var(--sub);

          line-height: 1.6;
          white-space: pre-wrap;
        ">
          ${escapeHtml(notes)}
        </div>

      </div>

      <!-- META -->

      <div style="
        margin-top: 20px;

        display: grid;
        grid-template-columns:
          repeat(auto-fit, minmax(200px, 1fr));

        gap: 12px;

        color: var(--sub);
        font-size: 0.8rem;
      ">

        <div>
          <strong style="color: var(--text);">
            Inspected By
          </strong>
          <br>
          ${escapeHtml(inspectedBy)}
        </div>

        <div>
          <strong style="color: var(--text);">
            Completed
          </strong>
          <br>
          ${escapeHtml(completedAt)}
        </div>

      </div>

      <!-- FOOTER -->

      <div style="
        display: flex;
        justify-content: flex-end;

        margin-top: 24px;
      ">

        <button
          type="button"
          id="closeManagerReturnReportBtn"
          class="btn btn-dark"
        >
          Close Report
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  /* =====================================================
     CLOSE BUTTONS
  ===================================================== */

  const closeReport = () => {

    overlay.remove();

  };

  document
    .getElementById(
      "closeManagerReturnReport"
    )
    ?.addEventListener(
      "click",
      closeReport
    );

  document
    .getElementById(
      "closeManagerReturnReportBtn"
    )
    ?.addEventListener(
      "click",
      closeReport
    );

  /* Click outside modal */

  overlay.addEventListener(
    "click",
    (event) => {

      if (event.target === overlay) {
        closeReport();
      }

    }
  );

  /* ESC */

  const escHandler = (event) => {

    if (event.key === "Escape") {

      closeReport();

      document.removeEventListener(
        "keydown",
        escHandler
      );
    }

  };

  document.addEventListener(
    "keydown",
    escHandler
  );
}

/* =========================================================
   DRIVER DOCUMENTS
========================================================= */

async function loadManagerDocs() {

  if (!docsWrap) return;

  docsWrap.innerHTML = `
    <p style="color: var(--sub);">
      Loading pending document verifications...
    </p>
  `;

  try {

    const snap = await getDocs(
      collection(db, "users")
    );

    const users =
      snap.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

    const pendingDocs =
      users.filter((user) => {

        return (
          user.licenseStatus === "pending" ||
          user.aadharStatus === "pending"
        );

      });

    if (pendingDocCountEl) {

      pendingDocCountEl.textContent =
        pendingDocs.length;

    }

    renderManagerDocsList(
      pendingDocs
    );

  } catch (error) {

    console.error(
      "Error loading manager documents:",
      error
    );

    docsWrap.innerHTML = `
      <div style="
        padding: 20px;
      ">

        <p style="
          color: #ef476f;
          margin-bottom: 8px;
        ">
          Couldn't load documents.
        </p>

        <small style="color: var(--sub);">
          ${escapeHtml(
            error.message ||
            "Unknown error"
          )}
        </small>

      </div>
    `;
  }
}

/* =========================================================
   DOCUMENT TABLE
========================================================= */

function renderManagerDocsList(users) {

  if (!docsWrap) return;

  if (!users.length) {

    docsWrap.innerHTML = `
      <div style="
        padding: 30px;
        text-align: center;
        color: var(--sub);
      ">
        All pending driver documents
        have been verified!
      </div>
    `;

    return;
  }

  let html = `

    <div style="
      width: 100%;
      overflow-x: auto;
    ">

      <table
        class="admin-table"
        style="
          width: 100%;
          min-width: 850px;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.9rem;
        "
      >

        <thead>

          <tr style="
            border-bottom: 1px solid var(--line);
            color: var(--sub);
          ">

            <th style="padding: 14px;">
              User
            </th>

            <th style="padding: 14px;">
              Contact
            </th>

            <th style="padding: 14px;">
              License
            </th>

            <th style="padding: 14px;">
              Aadhaar
            </th>

            <th style="
              padding: 14px;
              text-align: right;
            ">
              Action
            </th>

          </tr>

        </thead>

        <tbody>
  `;

  users.forEach((user) => {

    const licenseStatus =
      user.licenseStatus ||
      "unknown";

    const aadharStatus =
      user.aadharStatus ||
      "unknown";

    html += `

      <tr style="
        border-bottom:
          1px solid rgba(255,255,255,0.06);
      ">

        <td style="padding: 14px;">

          <strong>
            ${escapeHtml(
              user.name ||
              "User"
            )}
          </strong>

        </td>

        <td style="padding: 14px;">

          ${escapeHtml(
            user.email ||
            "—"
          )}

          <br>

          <span style="
            color: var(--sub);
            font-size: 0.8rem;
          ">
            ${escapeHtml(
              user.phone ||
              "—"
            )}
          </span>

        </td>

        <td style="padding: 14px;">

          <span class="
            fleet-status
            ${getDocumentStatusClass(
              licenseStatus
            )}
          ">
            ${escapeHtml(
              formatStatus(
                licenseStatus
              )
            )}
          </span>

        </td>

        <td style="padding: 14px;">

          <span class="
            fleet-status
            ${getDocumentStatusClass(
              aadharStatus
            )}
          ">
            ${escapeHtml(
              formatStatus(
                aadharStatus
              )
            )}
          </span>

        </td>

        <td style="
          padding: 14px;
          text-align: right;
        ">

          <button
            type="button"
            class="btn btn-dark mgr-verify-btn"
            data-user-id="${escapeHtml(
              user.id
            )}"
          >
            Verify License & Aadhaar
          </button>

        </td>

      </tr>
    `;
  });

  html += `

        </tbody>

      </table>

    </div>
  `;

  docsWrap.innerHTML = html;

  attachDocumentButtonEvents();
}

/* =========================================================
   DOCUMENT VERIFICATION
========================================================= */

function attachDocumentButtonEvents() {

  const verifyButtons =
    docsWrap.querySelectorAll(
      ".mgr-verify-btn"
    );

  verifyButtons.forEach((button) => {

    button.addEventListener(
      "click",
      async (event) => {

        event.preventDefault();

        const userId =
          button.dataset.userId;

        if (!userId) {

          alert(
            "Missing user ID."
          );

          return;
        }

        const confirmed =
          window.confirm(
            "Verify both the driving licence and Aadhaar for this user?"
          );

        if (!confirmed) return;

        const originalText =
          button.textContent;

        button.disabled = true;
        button.textContent =
          "Verifying...";

        try {

          await setDoc(
            doc(
              db,
              "users",
              userId
            ),
            {
              licenseStatus:
                "verified",

              aadharStatus:
                "verified",

              documentsVerifiedAt:
                new Date(),

              documentsVerifiedBy:
                currentUser
                  ? currentUser.uid
                  : null,
            },
            {
              merge: true,
            }
          );

          await loadManagerDocs();

        } catch (error) {

          console.error(
            "Failed to verify documents:",
            error
          );

          alert(
            "Failed to verify user documents.\n\n" +
            error.message
          );

          button.disabled = false;

          button.textContent =
            originalText;
        }
      }
    );

  });
}

/* =========================================================
   HELPERS
========================================================= */

function getDocumentStatusClass(status) {

  const value =
    String(status || "")
      .toLowerCase();

  if (value === "verified") {
    return "verified";
  }

  if (
    value === "rejected" ||
    value === "failed"
  ) {
    return "rejected";
  }

  return "pending";
}

/* =========================================================
   STATUS FORMATTER
========================================================= */

function formatStatus(status) {

  return String(status || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

/* =========================================================
   NUMBER
========================================================= */

function getNumber(value) {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

/* =========================================================
   MONEY
========================================================= */

function formatMoney(value) {

  return getNumber(value)
    .toLocaleString(
      "en-IN",
      {
        maximumFractionDigits: 2,
      }
    );
}

/* =========================================================
   DATE / TIME
========================================================= */

function formatDateTime(value) {

  if (!value) {
    return "Not recorded";
  }

  try {

    /* Firestore Timestamp */

    if (
      value &&
      typeof value.toDate ===
        "function"
    ) {
      return value
        .toDate()
        .toLocaleString("en-IN");
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return String(value);
    }

    return date.toLocaleString(
      "en-IN"
    );

  } catch {

    return String(value);
  }
}

/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}