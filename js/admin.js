// ============================================================================
// CARRENTPE ADMIN DASHBOARD
// Complete admin controller
// ============================================================================

import { auth, db, storage } from "./firebase-init.js";

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
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

import "./nav-helper.js";

import { openReturnModal } from "./return-inspection.js";

// ============================================================================
// DOM
// ============================================================================

const $ = (id) => document.getElementById(id);

const adminContent = $("adminContent");
const accessDenied = $("adminAccessDenied");

const usersTableWrap = $("usersTableWrap");
const paymentsTableWrap = $("paymentsTableWrap");
const bookingsTableWrap = $("bookingsTableWrap");
const hostCarsTableWrap = $("hostCarsTableWrap");

// ============================================================================
// STATE
// ============================================================================

let currentUser = null;

let usersData = [];
let bookingsData = [];
let hostCarsData = [];

let activeDocUser = null;
let activeDocType = null;
let activePaymentBooking = null;

let bookingSortDirection = "desc";
let bookingStatus = "all";
let bookingDateFrom = "";
let bookingDateTo = "";

let expandedBookingId = null;
let expandedHostPhotoId = null;

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatINR(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "₹0";
  }

  return `₹${Math.round(number).toLocaleString("en-IN")}`;
}

function toMillis(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    );
  }

  const stringValue = String(value);

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    const [year, month, day] = stringValue.split("-").map(Number);

    return new Date(year, month - 1, day);
  }

  const parsed = new Date(stringValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
}

function formatDate(value) {
  const date = parseDateOnly(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getBookingDateValue(booking) {
  /*
   * IMPORTANT:
   *
   * Use the actual rental/booking date first.
   * createdAt is only a fallback.
   *
   * This fixes the date filter for your existing bookings.
   */

  return (
    booking.bookingDate ||
    booking.pickupDate ||
    booking.date ||
    booking.createdAt ||
    booking.dropDate ||
    ""
  );
}

function getBookingDateMillis(booking) {
  const value = getBookingDateValue(booking);

  if (!value) {
    return 0;
  }

  if (
    typeof value === "object" &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  if (typeof value === "number") {
    return value;
  }

  const date = parseDateOnly(value);

  if (!date) {
    return 0;
  }

  return date.getTime();
}

function getBookingDisplayDate(booking) {
  return formatDate(getBookingDateValue(booking));
}

function getStatusClass(status) {
  const value = String(status || "").toLowerCase();

  if (
    value === "confirmed" ||
    value === "completed" ||
    value === "paid" ||
    value === "verified" ||
    value === "approved"
  ) {
    return "verified";
  }

  if (
    value === "cancelled" ||
    value === "rejected" ||
    value === "failed"
  ) {
    return "rejected";
  }

  return "pending";
}

function paymentStatusText(booking) {
  switch (booking.paymentStatus) {
    case "paid":
      return `Paid${
        booking.paymentRef
          ? ` • ${escapeHtml(booking.paymentRef)}`
          : ""
      }`;

    case "pending_verification":
      return `Verification Pending${
        booking.paymentRef
          ? ` • ${escapeHtml(booking.paymentRef)}`
          : ""
      }`;

    case "rejected":
      return `Rejected${
        booking.paymentRejectionReason
          ? ` — ${escapeHtml(booking.paymentRejectionReason)}`
          : ""
      }`;

    case "pay_at_pickup":
      return "Pay at Pickup";

    default:
      return "Unpaid";
  }
}

function getStartOdometer(booking) {
  return (
    booking.odometerStart ??
    booking.startOdometer ??
    booking.startOdo ??
    ""
  );
}

function getEndOdometer(booking) {
  return (
    booking.odometerEnd ??
    booking.endOdometer ??
    booking.endOdo ??
    ""
  );
}

function getStartFastag(booking) {
  return (
    booking.fastagStart ??
    booking.startFastag ??
    ""
  );
}

function getReturnFastag(booking) {
  return (
    booking.fastagReturn ??
    booking.returnFastag ??
    ""
  );
}

function calculateDistance(start, end) {
  const startNumber = Number(start);
  const endNumber = Number(end);

  if (
    !Number.isFinite(startNumber) ||
    !Number.isFinite(endNumber) ||
    startNumber < 0 ||
    endNumber < startNumber
  ) {
    return null;
  }

  return endNumber - startNumber;
}

// ============================================================================
// FORCE MODAL VISIBILITY
//
// IMPORTANT:
// Your HTML uses `hidden` on the modals.
// Setting only style.display = "flex" is not enough.
// ============================================================================

function showModal(id) {
  const modal = $(id);

  if (!modal) {
    console.error(`Modal #${id} was not found.`);
    return false;
  }

  modal.hidden = false;
  modal.removeAttribute("hidden");

  modal.style.display = "flex";

  return true;
}

function hideModal(id) {
  const modal = $(id);

  if (!modal) {
    return;
  }

  modal.style.display = "none";
  modal.hidden = true;
}

// ============================================================================
// AUTH
// ============================================================================

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

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
    ).toLowerCase();

    if (role !== "admin") {
      showAccessDenied();
      return;
    }

    accessDenied.hidden = true;
    adminContent.hidden = false;

    initialiseAdmin();

  } catch (error) {
    console.error(
      "ADMIN AUTH ERROR:",
      error
    );

    showAccessDenied();
  }
});

function showAccessDenied() {
  if (accessDenied) {
    accessDenied.hidden = false;
  }

  if (adminContent) {
    adminContent.hidden = true;
  }
}

// ============================================================================
// INITIALISE
// ============================================================================

function initialiseAdmin() {
  initialiseTabs();
  initialiseBookingFilters();
  initialiseDocumentModal();
  initialisePaymentModal();
  initialiseReturnModal();

  loadAllAdminData();
}

// ============================================================================
// TABS
// ============================================================================

function initialiseTabs() {
  const tabs = document.querySelectorAll(
    ".admin-tabs .tab-btn"
  );

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.tab;

      tabs.forEach((item) => {
        item.classList.remove(
          "active",
          "btn-dark"
        );

        item.classList.add(
          "btn-outline"
        );
      });

      tab.classList.add(
        "active",
        "btn-dark"
      );

      tab.classList.remove(
        "btn-outline"
      );

      document
        .querySelectorAll(".tab-panel")
        .forEach((panel) => {
          panel.hidden =
            panel.id !== targetId;
        });
    });
  });

  const userSearch = $("userSearchInput");

  if (userSearch) {
    userSearch.addEventListener(
      "input",
      () => {
        const query =
          userSearch.value
            .toLowerCase()
            .trim();

        const filtered =
          usersData.filter((user) => {
            const name =
              String(user.name || "")
                .toLowerCase();

            const email =
              String(user.email || "")
                .toLowerCase();

            const phone =
              String(user.phone || "")
                .toLowerCase();

            return (
              name.includes(query) ||
              email.includes(query) ||
              phone.includes(query)
            );
          });

        renderUsersTable(filtered);
      }
    );
  }
}

// ============================================================================
// BOOKING FILTERS
// ============================================================================

function initialiseBookingFilters() {
  const statusFilter =
    $("bookingStatusFilter");

  if (statusFilter) {
    statusFilter.addEventListener(
      "change",
      () => {
        bookingStatus =
          statusFilter.value;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const sortSelect =
    $("bookingSortOrder");

  if (sortSelect) {
    sortSelect.value =
      bookingSortDirection;

    sortSelect.addEventListener(
      "change",
      () => {
        bookingSortDirection =
          sortSelect.value;

        sortBookings();

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const dateFrom =
    $("bookingDateFrom");

  if (dateFrom) {
    dateFrom.addEventListener(
      "change",
      () => {
        bookingDateFrom =
          dateFrom.value;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const dateTo =
    $("bookingDateTo");

  if (dateTo) {
    dateTo.addEventListener(
      "change",
      () => {
        bookingDateTo =
          dateTo.value;

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }

  const clearDate =
    $("bookingDateClear");

  if (clearDate) {
    clearDate.addEventListener(
      "click",
      () => {
        bookingDateFrom = "";
        bookingDateTo = "";

        if (dateFrom) {
          dateFrom.value = "";
        }

        if (dateTo) {
          dateTo.value = "";
        }

        renderBookingsTable(
          getFilteredBookings()
        );
      }
    );
  }
}

// ============================================================================
// SORT
// ============================================================================

function sortBookings() {
  bookingsData.sort(
    (a, b) => {
      const dateA =
        getBookingDateMillis(a);

      const dateB =
        getBookingDateMillis(b);

      if (
        bookingSortDirection ===
        "asc"
      ) {
        return dateA - dateB;
      }

      return dateB - dateA;
    }
  );
}

// ============================================================================
// FILTER
// ============================================================================

function getFilteredBookings() {
  let result = [
    ...bookingsData
  ];

  // STATUS
  if (bookingStatus !== "all") {
    result = result.filter(
      (booking) =>
        String(
          booking.status || ""
        ).toLowerCase() ===
        bookingStatus
    );
  }

  // FROM DATE
  if (bookingDateFrom) {
    const from =
      parseDateOnly(
        bookingDateFrom
      );

    if (from) {
      const fromTime =
        from.getTime();

      result =
        result.filter(
          (booking) =>
            getBookingDateMillis(
              booking
            ) >= fromTime
        );
    }
  }

  // TO DATE
  if (bookingDateTo) {
    const to =
      parseDateOnly(
        bookingDateTo
      );

    if (to) {
      // Include complete day.
      to.setHours(
        23,
        59,
        59,
        999
      );

      const toTime =
        to.getTime();

      result =
        result.filter(
          (booking) =>
            getBookingDateMillis(
              booking
            ) <= toTime
        );
    }
  }

  return result;
}

// ============================================================================
// LOAD ALL DATA
// ============================================================================

async function loadAllAdminData() {
  await Promise.all([
    loadUsers(),
    loadBookings(),
    loadHostCars(),
  ]);
}

// ============================================================================
// USERS
// ============================================================================

async function loadUsers() {
  if (usersTableWrap) {
    usersTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading users...
      </p>`;
  }

  try {
    const snapshot =
      await getDocs(
        collection(db, "users")
      );

    usersData =
      snapshot.docs.map(
        (item) => ({
          id: item.id,
          ...item.data(),
        })
      );

    updateUserStats();

    renderUsersTable(
      usersData
    );

  } catch (error) {
    console.error(
      "LOAD USERS ERROR:",
      error
    );

    if (usersTableWrap) {
      usersTableWrap.innerHTML =
        `<div style="padding:20px;">
          <p style="color:#ef476f;">
            Failed to load users.
          </p>

          <small style="color:var(--sub);">
            ${escapeHtml(
              error.message
            )}
          </small>
        </div>`;
    }
  }
}

function updateUserStats() {
  const totalUsers =
    $("statTotalUsers");

  if (totalUsers) {
    totalUsers.textContent =
      usersData.length;
  }

  const pending =
    usersData.filter(
      (user) =>
        user.licenseStatus ===
          "pending" ||
        user.aadharStatus ===
          "pending"
    ).length;

  const pendingEl =
    $("statPendingDocs");

  if (pendingEl) {
    pendingEl.textContent =
      pending;
  }
}

function documentStatusLabel(
  status
) {
  switch (status) {
    case "verified":
      return "Verified";

    case "pending":
      return "Pending Review";

    case "rejected":
      return "Rejected";

    default:
      return "Not Submitted";
  }
}

function documentStatusClass(
  status
) {
  if (status === "verified") {
    return "verified";
  }

  if (status === "rejected") {
    return "rejected";
  }

  if (status === "pending") {
    return "pending";
  }

  return "";
}

// ============================================================================
// USERS TABLE
// ============================================================================

function renderUsersTable(
  users
) {
  if (!usersTableWrap) {
    return;
  }

  if (!users.length) {
    usersTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        No user records found.
      </p>`;

    return;
  }

  let html = `
    <div style="width:100%;overflow-x:auto;">
      <table
        class="admin-table"
        style="
          width:100%;
          min-width:1000px;
          border-collapse:collapse;
          text-align:left;
        "
      >
        <thead>
          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >
            <th style="padding:12px;">
              User
            </th>

            <th style="padding:12px;">
              Contact
            </th>

            <th style="padding:12px;">
              Role
            </th>

            <th style="padding:12px;">
              License
            </th>

            <th style="padding:12px;">
              Aadhaar
            </th>

            <th style="padding:12px;text-align:right;">
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
  `;

  users.forEach(
    (user) => {
      const license =
        user.licenseStatus ||
        "not_submitted";

      const aadhaar =
        user.aadharStatus ||
        "not_submitted";

      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,0.06);
          "
        >

          <td style="padding:12px;">
            <strong>
              ${escapeHtml(
                user.name ||
                  "Unnamed"
              )}
            </strong>

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.8rem;
              "
            >
              ${escapeHtml(
                user.email ||
                  "No email"
              )}
            </span>
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              user.phone ||
                "—"
            )}
          </td>

          <td style="padding:12px;">
            <select
              class="role-select"
              data-uid="${escapeHtml(
                user.id
              )}"
              style="
                padding:6px 8px;
                background:rgba(0,0,0,.5);
                color:var(--text);
                border:1px solid var(--line);
                border-radius:6px;
              "
            >

              <option
                value="customer"
                ${
                  user.role ===
                  "customer"
                    ? "selected"
                    : ""
                }
              >
                Customer
              </option>

              <option
                value="manager"
                ${
                  user.role ===
                  "manager"
                    ? "selected"
                    : ""
                }
              >
                Manager
              </option>

              <option
                value="admin"
                ${
                  user.role ===
                  "admin"
                    ? "selected"
                    : ""
                }
              >
                Admin
              </option>

            </select>
          </td>

          <td style="padding:12px;">
            <span
              class="fleet-status ${documentStatusClass(
                license
              )}"
            >
              ${documentStatusLabel(
                license
              )}
            </span>

            <br>

            <button
              type="button"
              class="btn btn-outline inspect-document-btn"
              data-uid="${escapeHtml(
                user.id
              )}"
              data-type="license"
              style="
                margin-top:6px;
                padding:4px 8px;
                font-size:.75rem;
              "
            >
              Inspect
            </button>
          </td>

          <td style="padding:12px;">
            <span
              class="fleet-status ${documentStatusClass(
                aadhaar
              )}"
            >
              ${documentStatusLabel(
                aadhaar
              )}
            </span>

            <br>

            <button
              type="button"
              class="btn btn-outline inspect-document-btn"
              data-uid="${escapeHtml(
                user.id
              )}"
              data-type="aadhar"
              style="
                margin-top:6px;
                padding:4px 8px;
                font-size:.75rem;
              "
            >
              Inspect
            </button>
          </td>

          <td
            style="
              padding:12px;
              text-align:right;
            "
          >

            <button
              type="button"
              class="btn btn-dark approve-all-docs-btn"
              data-uid="${escapeHtml(
                user.id
              )}"
              style="
                padding:6px 12px;
                font-size:.8rem;
              "
            >
              ${
                license ===
                  "verified" &&
                aadhaar ===
                  "verified"
                  ? "Verified"
                  : "Approve Account"
              }
            </button>

          </td>

        </tr>
      `;
    }
  );

  html += `
        </tbody>
      </table>
    </div>
  `;

  usersTableWrap.innerHTML =
    html;

  // INSPECT DOCUMENT
  usersTableWrap
    .querySelectorAll(
      ".inspect-document-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const uid =
            button.dataset.uid;

          const type =
            button.dataset.type;

          const user =
            usersData.find(
              (item) =>
                item.id === uid
            );

          if (!user) {
            alert(
              "User record not found."
            );

            return;
          }

          openDocumentModal(
            user,
            type
          );
        }
      );
    });

  // ROLE
  usersTableWrap
    .querySelectorAll(
      ".role-select"
    )
    .forEach((select) => {
      select.addEventListener(
        "change",
        async () => {
          const uid =
            select.dataset.uid;

          const newRole =
            select.value;

          const user =
            usersData.find(
              (item) =>
                item.id === uid
            );

          if (!user) return;

          const oldRole =
            user.role;

          user.role =
            newRole;

          try {
            await setDoc(
              doc(
                db,
                "users",
                uid
              ),
              {
                role: newRole,
              },
              {
                merge: true,
              }
            );

          } catch (error) {
            console.error(
              "ROLE UPDATE ERROR:",
              error
            );

            user.role =
              oldRole;

            select.value =
              oldRole ||
              "customer";

            alert(
              "Could not update role.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // APPROVE ACCOUNT
  usersTableWrap
    .querySelectorAll(
      ".approve-all-docs-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const uid =
            button.dataset.uid;

          const oldText =
            button.textContent;

          button.disabled = true;
          button.textContent =
            "Verifying...";

          try {
            await setDoc(
              doc(
                db,
                "users",
                uid
              ),
              {
                licenseStatus:
                  "verified",

                aadharStatus:
                  "verified",

                documentsVerifiedAt:
                  serverTimestamp(),

                documentsVerifiedBy:
                  currentUser
                    ? currentUser.uid
                    : null,
              },
              {
                merge: true,
              }
            );

            const user =
              usersData.find(
                (item) =>
                  item.id === uid
              );

            if (user) {
              user.licenseStatus =
                "verified";

              user.aadharStatus =
                "verified";
            }

            updateUserStats();

            renderUsersTable(
              usersData
            );

          } catch (error) {
            console.error(
              "DOCUMENT APPROVAL ERROR:",
              error
            );

            button.disabled =
              false;

            button.textContent =
              oldText;

            alert(
              "Could not approve documents.\n\n" +
              error.message
            );
          }
        }
      );
    });
}

// ============================================================================
// DOCUMENT MODAL
// ============================================================================

function initialiseDocumentModal() {
  const close =
    $("closeDocModal");

  if (close) {
    close.addEventListener(
      "click",
      () => {
        hideModal(
          "docModal"
        );
      }
    );
  }

  const approve =
    $("approveDocBtn");

  if (approve) {
    approve.addEventListener(
      "click",
      async () => {
        if (
          !activeDocUser ||
          !activeDocType
        ) {
          return;
        }

        await updateDocumentStatus(
          activeDocUser.id,
          activeDocType,
          "verified"
        );

        hideModal(
          "docModal"
        );
      }
    );
  }

  const reject =
    $("rejectDocBtn");

  if (reject) {
    reject.addEventListener(
      "click",
      async () => {
        if (
          !activeDocUser ||
          !activeDocType
        ) {
          return;
        }

        await updateDocumentStatus(
          activeDocUser.id,
          activeDocType,
          "rejected"
        );

        hideModal(
          "docModal"
        );
      }
    );
  }

  const uploadButton =
    $("docUploadBtn");

  const uploadInput =
    $("docUploadInput");

  if (
    uploadButton &&
    uploadInput
  ) {
    uploadButton.addEventListener(
      "click",
      () => {
        uploadInput.click();
      }
    );

    uploadInput.addEventListener(
      "change",
      async () => {
        const file =
          uploadInput.files?.[0];

        if (
          !file ||
          !activeDocUser ||
          !activeDocType
        ) {
          return;
        }

        await uploadDocument(
          activeDocUser.id,
          activeDocType,
          file
        );

        uploadInput.value =
          "";
      }
    );
  }
}

function openDocumentModal(
  user,
  type
) {
  activeDocUser =
    user;

  activeDocType =
    type;

  const url =
    type === "license"
      ? user.licenseURL
      : user.aadharURL;

  const title =
    type === "license"
      ? "Driving Licence"
      : "Aadhaar Card";

  const titleEl =
    $("modalTitle");

  if (titleEl) {
    titleEl.textContent =
      `${user.name || "User"} — ${title}`;
  }

  const img =
    $("modalImg");

  const approve =
    $("approveDocBtn");

  const reject =
    $("rejectDocBtn");

  if (img) {
    if (url) {
      img.src = url;
      img.style.display =
        "block";
    } else {
      img.removeAttribute(
        "src"
      );

      img.style.display =
        "none";
    }
  }

  if (approve) {
    approve.disabled =
      !url;
  }

  if (reject) {
    reject.disabled =
      !url;
  }

  const status =
    $("docUploadStatus");

  if (status) {
    status.textContent =
      url
        ? "Document available for review."
        : "No document uploaded. You can upload one below.";
  }

  showModal(
    "docModal"
  );
}

async function updateDocumentStatus(
  uid,
  type,
  status
) {
  const user =
    usersData.find(
      (item) =>
        item.id === uid
    );

  if (!user) return;

  const updates = {};

  if (
    type === "license" ||
    type === "both"
  ) {
    updates.licenseStatus =
      status;
  }

  if (
    type === "aadhar" ||
    type === "both"
  ) {
    updates.aadharStatus =
      status;
  }

  try {
    await setDoc(
      doc(
        db,
        "users",
        uid
      ),
      updates,
      {
        merge: true,
      }
    );

    Object.assign(
      user,
      updates
    );

    updateUserStats();

    renderUsersTable(
      usersData
    );

  } catch (error) {
    console.error(
      "DOCUMENT STATUS ERROR:",
      error
    );

    alert(
      "Could not update document status.\n\n" +
      error.message
    );
  }
}

async function uploadDocument(
  uid,
  type,
  file
) {
  const status =
    $("docUploadStatus");

  const button =
    $("docUploadBtn");

  if (button) {
    button.disabled =
      true;

    button.textContent =
      "Uploading...";
  }

  if (status) {
    status.textContent =
      "Uploading...";
  }

  try {
    const safeName =
      file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

    const path =
      `user_documents/${uid}/${type}/${Date.now()}-${safeName}`;

    const storageRef =
      ref(
        storage,
        path
      );

    await uploadBytes(
      storageRef,
      file
    );

    const url =
      await getDownloadURL(
        storageRef
      );

    const updates = {
      [`${type}URL`]:
        url,

      [`${type}Status`]:
        "pending",

      [`${type}UploadedBy`]:
        currentUser
          ? currentUser.uid
          : null,

      [`${type}UploadedAt`]:
        serverTimestamp(),
    };

    await setDoc(
      doc(
        db,
        "users",
        uid
      ),
      updates,
      {
        merge: true,
      }
    );

    const user =
      usersData.find(
        (item) =>
          item.id === uid
      );

    if (user) {
      Object.assign(
        user,
        updates
      );
    }

    renderUsersTable(
      usersData
    );

    if (user) {
      activeDocUser =
        user;

      openDocumentModal(
        user,
        type
      );
    }

    if (status) {
      status.textContent =
        "Uploaded successfully. Document is now pending review.";
    }

  } catch (error) {
    console.error(
      "DOCUMENT UPLOAD ERROR:",
      error
    );

    alert(
      "Could not upload document.\n\n" +
      error.message
    );

    if (status) {
      status.textContent =
        error.message;
    }

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        "Upload Replacement / Missing Document";
    }
  }
}

// ============================================================================
// BOOKINGS
// ============================================================================

async function loadBookings() {
  if (bookingsTableWrap) {
    bookingsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading bookings...
      </p>`;
  }

  if (paymentsTableWrap) {
    paymentsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading payments...
      </p>`;
  }

  try {
    /*
     * IMPORTANT:
     *
     * Do NOT use Firestore orderBy(createdAt).
     *
     * Older bookings may not contain createdAt.
     * Fetch all bookings and sort locally.
     */

    const snapshot =
      await getDocs(
        collection(
          db,
          "bookings"
        )
      );

    bookingsData =
      snapshot.docs.map(
        (item) => ({
          id: item.id,
          ...item.data(),
        })
      );

    sortBookings();

    const totalBookings =
      $("statTotalBookings");

    if (totalBookings) {
      totalBookings.textContent =
        bookingsData.length;
    }

    renderBookingsTable(
      getFilteredBookings()
    );

    renderPaymentsTable();

    updateRevenueStats();

  } catch (error) {
    console.error(
      "LOAD BOOKINGS ERROR:",
      error
    );

    if (bookingsTableWrap) {
      bookingsTableWrap.innerHTML =
        `<div style="padding:20px;">
          <p style="color:#ef476f;">
            Failed to load bookings.
          </p>

          <small style="color:var(--sub);">
            ${escapeHtml(
              error.message
            )}
          </small>
        </div>`;
    }

    if (paymentsTableWrap) {
      paymentsTableWrap.innerHTML =
        `<p style="color:#ef476f;">
          Failed to load payment queue.
        </p>`;
    }
  }
}

// ============================================================================
// BOOKINGS TABLE
//
// Date, odometer, and FASTag are deliberately handled as follows:
//
// MAIN TABLE:
// Date | Ref | Customer | Vehicle | Amount | Status | Details
//
// DETAILS:
// Pickup/Return dates
// Start odometer
// End odometer
// Distance
// FASTag at start
// FASTag at return
// Payment
// Status
// Return Report / Process Return
// ============================================================================

function renderBookingsTable(
  bookings
) {
  if (!bookingsTableWrap) {
    return;
  }

  if (!bookings.length) {
    bookingsTableWrap.innerHTML =
      `<div
        style="
          padding:40px;
          text-align:center;
          color:var(--sub);
        "
      >
        <div
          style="
            font-size:2rem;
            margin-bottom:10px;
          "
        >
          📋
        </div>

        <strong>
          No bookings found
        </strong>

        <p style="margin-top:8px;">
          Try changing the status or date filters.
        </p>
      </div>`;

    return;
  }

  let html = `
    <div
      style="
        width:100%;
        overflow-x:auto;
      "
    >

      <table
        class="admin-table"
        style="
          width:100%;
          min-width:1100px;
          border-collapse:collapse;
          text-align:left;
          font-size:.9rem;
        "
      >

        <thead>

          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >

            <th style="padding:14px;">
              DATE
            </th>

            <th style="padding:14px;">
              BOOKING REF
            </th>

            <th style="padding:14px;">
              CUSTOMER
            </th>

            <th style="padding:14px;">
              VEHICLE
            </th>

            <th style="padding:14px;">
              AMOUNT
            </th>

            <th style="padding:14px;">
              STATUS
            </th>

            <th
              style="
                padding:14px;
                text-align:right;
              "
            >
              DETAILS
            </th>

          </tr>

        </thead>

        <tbody>
  `;

  bookings.forEach(
    (booking) => {
      const id =
        booking.id;

      const rowId =
        `booking-details-${id}`;

      const status =
        String(
          booking.status ||
            "unknown"
        ).toLowerCase();

      const customer =
        booking.userName ||
        booking.customerName ||
        booking.name ||
        "Customer";

      const vehicle =
        booking.vehicleName ||
        booking.carName ||
        booking.vehicle ||
        "Vehicle";

      const amount =
        booking.totalAmount ??
        booking.amount ??
        booking.total ??
        0;

      const startOdo =
        getStartOdometer(
          booking
        );

      const endOdo =
        getEndOdometer(
          booking
        );

      const distance =
        calculateDistance(
          startOdo,
          endOdo
        );

      const startFastag =
        getStartFastag(
          booking
        );

      const returnFastag =
        getReturnFastag(
          booking
        );

      let returnButton = "";

      if (
        status ===
        "confirmed"
      ) {
        returnButton = `
          <button
            type="button"
            class="btn btn-dark process-return-btn"
            data-bid="${escapeHtml(
              id
            )}"
            style="
              padding:6px 12px;
              font-size:.8rem;
            "
          >
            Process Return
          </button>
        `;
      }

      if (
        status ===
          "completed" &&
        booking.returnInspection
      ) {
        returnButton = `
          <button
            type="button"
            class="btn btn-outline view-return-report-btn"
            data-bid="${escapeHtml(
              id
            )}"
            style="
              padding:6px 12px;
              font-size:.8rem;
            "
          >
            View Return Report
          </button>
        `;
      }

      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
          "
        >

          <td
            style="
              padding:14px;
              white-space:nowrap;
            "
          >
            ${getBookingDisplayDate(
              booking
            )}
          </td>

          <td
            style="
              padding:14px;
              font-family:monospace;
            "
          >
            #${escapeHtml(
              id.slice(0, 8)
            )}
          </td>

          <td style="padding:14px;">
            <strong>
              ${escapeHtml(
                customer
              )}
            </strong>

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.78rem;
              "
            >
              ${escapeHtml(
                booking.userPhone ||
                  booking.phone ||
                  booking.userEmail ||
                  "—"
              )}
            </span>
          </td>

          <td style="padding:14px;">
            ${escapeHtml(
              vehicle
            )}

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.78rem;
              "
            >
              ${escapeHtml(
                booking.vehicleReg ||
                  booking.registration ||
                  booking.regNumber ||
                  "—"
              )}
            </span>
          </td>

          <td
            style="
              padding:14px;
              color:var(--accent);
              font-weight:700;
            "
          >
            ${formatINR(
              amount
            )}
          </td>

          <td style="padding:14px;">
            <span
              class="fleet-status ${getStatusClass(
                status
              )}"
            >
              ${escapeHtml(
                status
              )}
            </span>
          </td>

          <td
            style="
              padding:14px;
              text-align:right;
            "
          >

            <button
              type="button"
              class="btn btn-outline booking-details-btn"
              data-target="${escapeHtml(
                rowId
              )}"
              data-bid="${escapeHtml(
                id
              )}"
              style="
                padding:6px 12px;
                font-size:.8rem;
              "
            >
              ${
                expandedBookingId === id
                  ? "Details ▲"
                  : "Details ▼"
              }
            </button>

          </td>

        </tr>

        <tr
          id="${escapeHtml(
            rowId
          )}"
          class="booking-detail-row"
          ${
            expandedBookingId === id
              ? ""
              : "hidden"
          }
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
            background:
              rgba(255,255,255,.02);
          "
        >

          <td
            colspan="7"
            style="
              padding:20px;
            "
          >

            <div
              style="
                display:grid;
                grid-template-columns:
                  repeat(
                    auto-fit,
                    minmax(210px,1fr)
                  );
                gap:16px;
              "
            >

              <!-- CUSTOMER -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Customer Email
                </span>

                ${escapeHtml(
                  booking.userEmail ||
                    booking.email ||
                    "—"
                )}
              </div>

              <!-- VEHICLE -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Vehicle Registration
                </span>

                ${escapeHtml(
                  booking.vehicleReg ||
                    booking.registration ||
                    booking.regNumber ||
                    "—"
                )}
              </div>

              <!-- PICKUP -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Pickup Date
                </span>

                ${formatDate(
                  booking.pickupDate ||
                    booking.bookingDate
                )}
              </div>

              <!-- RETURN -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Return Date
                </span>

                ${formatDate(
                  booking.dropDate ||
                    booking.returnDate
                )}
              </div>

              <!-- PAYMENT -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Payment
                </span>

                ${paymentStatusText(
                  booking
                )}
              </div>

              <!-- START ODO -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  Start Odometer (KM)
                </label>

                <input
                  type="number"
                  min="0"
                  class="booking-start-odo"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    startOdo
                  )}"
                  placeholder="Start KM"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- END ODO -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  End Odometer (KM)
                </label>

                <input
                  type="number"
                  min="0"
                  class="booking-end-odo"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    endOdo
                  )}"
                  placeholder="End KM"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- FASTAG AT START -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  FASTag at Start (₹)
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  class="booking-start-fastag"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    startFastag
                  )}"
                  placeholder="Start balance"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- FASTAG AT RETURN -->

              <div>
                <label
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:5px;
                  "
                >
                  FASTag at Return (₹)
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  class="booking-return-fastag"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  value="${escapeHtml(
                    returnFastag
                  )}"
                  placeholder="Return balance"
                  style="
                    width:100%;
                    padding:8px 10px;
                    background:rgba(0,0,0,.45);
                    color:var(--text);
                    border:1px solid var(--line);
                    border-radius:6px;
                  "
                />
              </div>

              <!-- DISTANCE -->

              <div>
                <span
                  style="
                    display:block;
                    color:var(--sub);
                    font-size:.75rem;
                    margin-bottom:4px;
                  "
                >
                  Distance Driven
                </span>

                <strong
                  class="booking-distance"
                  data-bid="${escapeHtml(
                    id
                  )}"
                  style="
                    color:var(--accent);
                    font-size:1.1rem;
                  "
                >
                  ${
                    distance !== null
                      ? `${distance} KM`
                      : "Not calculated"
                  }
                </strong>
              </div>

            </div>

            <!-- DETAIL ACTIONS -->

            <div
              style="
                display:flex;
                gap:10px;
                flex-wrap:wrap;
                align-items:center;
                margin-top:20px;
                padding-top:16px;
                border-top:
                  1px dashed var(--line);
              "
            >

              <button
                type="button"
                class="btn btn-dark save-booking-odo-btn"
                data-bid="${escapeHtml(
                  id
                )}"
                style="
                  padding:7px 14px;
                  font-size:.8rem;
                "
              >
                Save Odometer
              </button>

              <button
                type="button"
                class="btn btn-dark save-booking-fastag-btn"
                data-bid="${escapeHtml(
                  id
                )}"
                style="
                  padding:7px 14px;
                  font-size:.8rem;
                "
              >
                Save FASTag
              </button>

              ${
                status ===
                "pending_payment"
                  ? `
                    <select
                      class="booking-status-select"
                      data-bid="${escapeHtml(
                        id
                      )}"
                      style="
                        padding:7px 10px;
                        background:rgba(0,0,0,.5);
                        color:var(--text);
                        border:1px solid var(--line);
                        border-radius:6px;
                      "
                    >
                      <option
                        value="pending_payment"
                        selected
                      >
                        Pending Payment
                      </option>

                      <option
                        value="confirmed"
                      >
                        Confirmed
                      </option>

                      <option
                        value="cancelled"
                      >
                        Cancelled
                      </option>
                    </select>
                  `
                  : ""
              }

              ${
                status ===
                "confirmed"
                  ? `
                    <select
                      class="booking-status-select"
                      data-bid="${escapeHtml(
                        id
                      )}"
                      style="
                        padding:7px 10px;
                        background:rgba(0,0,0,.5);
                        color:var(--text);
                        border:1px solid var(--line);
                        border-radius:6px;
                      "
                    >
                      <option
                        value="confirmed"
                        selected
                      >
                        Confirmed
                      </option>

                      <option
                        value="cancelled"
                      >
                        Cancelled
                      </option>
                    </select>
                  `
                  : ""
              }

              ${returnButton}

            </div>

          </td>

        </tr>
      `;
    }
  );

  html += `
        </tbody>
      </table>

    </div>
  `;

  bookingsTableWrap.innerHTML =
    html;

  attachBookingEvents();
}

// ============================================================================
// BOOKING EVENTS
// ============================================================================

function attachBookingEvents() {
  // DETAILS
  bookingsTableWrap
    .querySelectorAll(
      ".booking-details-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const id =
            button.dataset.bid;

          const row =
            document.getElementById(
              button.dataset.target
            );

          if (!row) {
            console.error(
              "Booking detail row missing:",
              button.dataset.target
            );

            return;
          }

          const isHidden =
            row.hidden;

          row.hidden =
            !isHidden;

          expandedBookingId =
            isHidden
              ? id
              : null;

          button.textContent =
            isHidden
              ? "Details ▲"
              : "Details ▼";
        }
      );
    });

  // ODOMETER SAVE
  bookingsTableWrap
    .querySelectorAll(
      ".save-booking-odo-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          await saveBookingOdometer(
            button.dataset.bid,
            button
          );
        }
      );
    });

  // FASTAG SAVE
  bookingsTableWrap
    .querySelectorAll(
      ".save-booking-fastag-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          await saveBookingFastag(
            button.dataset.bid,
            button
          );
        }
      );
    });

  // STATUS
  bookingsTableWrap
    .querySelectorAll(
      ".booking-status-select"
    )
    .forEach((select) => {
      select.addEventListener(
        "change",
        async () => {
          const bid =
            select.dataset.bid;

          const newStatus =
            select.value;

          const booking =
            bookingsData.find(
              (item) =>
                item.id === bid
            );

          if (!booking) {
            return;
          }

          const oldStatus =
            booking.status;

          booking.status =
            newStatus;

          try {
            await updateDoc(
              doc(
                db,
                "bookings",
                bid
              ),
              {
                status:
                  newStatus,

                updatedAt:
                  serverTimestamp(),
              }
            );

            renderBookingsTable(
              getFilteredBookings()
            );

            updateRevenueStats();

          } catch (error) {
            console.error(
              "BOOKING STATUS ERROR:",
              error
            );

            booking.status =
              oldStatus;

            select.value =
              oldStatus;

            alert(
              "Could not update booking status.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // PROCESS RETURN
  bookingsTableWrap
    .querySelectorAll(
      ".process-return-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const bid =
            button.dataset.bid;

          const booking =
            bookingsData.find(
              (item) =>
                item.id === bid
            );

          if (!booking) {
            alert(
              "Booking not found."
            );

            return;
          }

          try {
            openReturnModal({
              booking,
              currentUser,

              onSaved:
                async () => {
                  await loadBookings();
                },
            });

            /*
             * The external return-inspection.js
             * may set style.display but leave
             * the hidden attribute on the modal.
             *
             * Force it open.
             */

            setTimeout(
              () => {
                const modal =
                  $("returnModal");

                if (modal) {
                  modal.hidden =
                    false;

                  modal.removeAttribute(
                    "hidden"
                  );

                  modal.style.display =
                    "flex";
                }
              },
              50
            );

          } catch (error) {
            console.error(
              "RETURN MODAL ERROR:",
              error
            );

            alert(
              "Could not open return inspection.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // VIEW RETURN REPORT
  bookingsTableWrap
    .querySelectorAll(
      ".view-return-report-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const bid =
            button.dataset.bid;

          const booking =
            bookingsData.find(
              (item) =>
                item.id === bid
            );

          if (!booking) {
            alert(
              "Booking not found."
            );

            return;
          }

          openReturnReport(
            booking
          );
        }
      );
    });
}

// ============================================================================
// SAVE ODOMETER
// ============================================================================

async function saveBookingOdometer(
  bookingId,
  button
) {
  const startInput =
    bookingsTableWrap.querySelector(
      `.booking-start-odo[data-bid="${bookingId}"]`
    );

  const endInput =
    bookingsTableWrap.querySelector(
      `.booking-end-odo[data-bid="${bookingId}"]`
    );

  if (
    !startInput ||
    !endInput
  ) {
    alert(
      "Odometer fields could not be found."
    );

    return;
  }

  const startText =
    startInput.value.trim();

  const endText =
    endInput.value.trim();

  const start =
    startText === ""
      ? null
      : Number(startText);

  const end =
    endText === ""
      ? null
      : Number(endText);

  if (
    start !== null &&
    (
      !Number.isFinite(start) ||
      start < 0
    )
  ) {
    alert(
      "Enter a valid start odometer."
    );

    return;
  }

  if (
    end !== null &&
    (
      !Number.isFinite(end) ||
      end < 0
    )
  ) {
    alert(
      "Enter a valid end odometer."
    );

    return;
  }

  if (
    start !== null &&
    end !== null &&
    end < start
  ) {
    alert(
      "End odometer cannot be less than start odometer."
    );

    return;
  }

  const oldText =
    button.textContent;

  button.disabled =
    true;

  button.textContent =
    "Saving...";

  try {
    /*
     * Save BOTH naming formats.
     *
     * This keeps compatibility with your
     * existing booking/customer code.
     */

    await updateDoc(
      doc(
        db,
        "bookings",
        bookingId
      ),
      {
        odometerStart:
          start,

        odometerEnd:
          end,

        startOdometer:
          start,

        endOdometer:
          end,

        odometerUpdatedAt:
          serverTimestamp(),

        odometerUpdatedBy:
          currentUser
            ? currentUser.uid
            : null,
      }
    );

    const booking =
      bookingsData.find(
        (item) =>
          item.id ===
          bookingId
      );

    if (booking) {
      booking.odometerStart =
        start;

      booking.odometerEnd =
        end;

      booking.startOdometer =
        start;

      booking.endOdometer =
        end;
    }

    const distance =
      calculateDistance(
        start,
        end
      );

    const distanceEl =
      bookingsTableWrap.querySelector(
        `.booking-distance[data-bid="${bookingId}"]`
      );

    if (distanceEl) {
      distanceEl.textContent =
        distance !== null
          ? `${distance} KM`
          : "Not calculated";
    }

    button.textContent =
      "Saved ✓";

    setTimeout(
      () => {
        button.textContent =
          oldText;

        button.disabled =
          false;
      },
      1200
    );

  } catch (error) {
    console.error(
      "ODOMETER SAVE ERROR:",
      error
    );

    button.textContent =
      oldText;

    button.disabled =
      false;

    alert(
      "Could not save odometer readings.\n\n" +
      error.message
    );
  }
}

// ============================================================================
// SAVE FASTAG BALANCES
// ============================================================================

async function saveBookingFastag(
  bookingId,
  button
) {
  const startInput =
    bookingsTableWrap.querySelector(
      `.booking-start-fastag[data-bid="${bookingId}"]`
    );

  const returnInput =
    bookingsTableWrap.querySelector(
      `.booking-return-fastag[data-bid="${bookingId}"]`
    );

  if (!startInput || !returnInput) {
    alert(
      "FASTag fields could not be found."
    );

    return;
  }

  const startText =
    startInput.value.trim();

  const returnText =
    returnInput.value.trim();

  const start =
    startText === ""
      ? null
      : Number(startText);

  const returned =
    returnText === ""
      ? null
      : Number(returnText);

  if (
    start !== null &&
    (!Number.isFinite(start) || start < 0)
  ) {
    alert(
      "Enter a valid FASTag balance at start."
    );

    return;
  }

  if (
    returned !== null &&
    (!Number.isFinite(returned) || returned < 0)
  ) {
    alert(
      "Enter a valid FASTag balance at return."
    );

    return;
  }

  const oldText =
    button.textContent;

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await updateDoc(
      doc(db, "bookings", bookingId),
      {
        fastagStart: start,
        fastagReturn: returned,
        startFastag: start,
        returnFastag: returned,
        fastagUpdatedAt:
          serverTimestamp(),
        fastagUpdatedBy:
          currentUser
            ? currentUser.uid
            : null,
      }
    );

    const booking =
      bookingsData.find(
        (item) => item.id === bookingId
      );

    if (booking) {
      booking.fastagStart = start;
      booking.fastagReturn = returned;
      booking.startFastag = start;
      booking.returnFastag = returned;
    }

    button.textContent = "Saved ✓";

    setTimeout(
      () => {
        button.textContent = oldText;
        button.disabled = false;
      },
      1200
    );
  } catch (error) {
    console.error(
      "FASTAG SAVE ERROR:",
      error
    );

    button.textContent = oldText;
    button.disabled = false;

    alert(
      "Could not save FASTag balances.\n\n" +
      error.message
    );
  }
}

// ============================================================================
// RETURN REPORT
//
// This is intentionally separate from Process Return.
// Completed bookings use this viewer instead of trying to
// run the inspection process again.
// ============================================================================

function openReturnReport(
  booking
) {
  const inspection =
    booking.returnInspection;

  if (!inspection) {
    alert(
      "No return inspection report exists for this booking."
    );

    return;
  }

  const existing =
    document.getElementById(
      "adminReturnReportModal"
    );

  if (existing) {
    existing.remove();
  }

  const deductions =
    Array.isArray(
      inspection.items
    )
      ? inspection.items
      : Array.isArray(
          inspection.deductions
        )
        ? inspection.deductions
        : [];

  const deposit =
    Number(
      inspection.originalDeposit ??
        inspection.securityDeposit ??
        booking.securityDeposit ??
        0
    );

  const totalDeduction =
    Number(
      inspection.totalDeductions ??
        inspection.deductionTotal ??
        deductions.reduce(
          (sum, item) =>
            sum +
            Number(
              item.amount ||
                item.deduction ||
                0
            ),
          0
        )
    );

  const refund =
    Math.max(
      0,
      deposit -
        totalDeduction
    );

  const notes =
    inspection.invoiceNotes ||
    inspection.notes ||
    booking.returnNotes ||
    "No inspection notes.";

  const startOdo =
    getStartOdometer(
      booking
    );

  const endOdo =
    getEndOdometer(
      booking
    );

  const distance =
    calculateDistance(
      startOdo,
      endOdo
    );

  const startFastag =
    getStartFastag(
      booking
    );

  const returnFastag =
    getReturnFastag(
      booking
    );

  let deductionHtml = "";

  if (!deductions.length) {
    deductionHtml =
      `
        <div
          style="
            padding:16px;
            color:var(--sub);
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          No damage deductions recorded.
        </div>
      `;
  } else {
    deductionHtml =
      deductions
        .map(
          (item) => `
            <div
              style="
                display:flex;
                justify-content:space-between;
                gap:20px;
                padding:12px 0;
                border-bottom:1px solid var(--line);
              "
            >
              <span>
                ${escapeHtml(
                  item.label ||
                    item.name ||
                    item.description ||
                    "Inspection item"
                )}
              </span>

              <strong
                style="
                  color:#ef476f;
                "
              >
                ${formatINR(
                  item.amount ||
                    item.deduction ||
                    0
                )}
              </strong>
            </div>
          `
        )
        .join("");
  }

  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "adminReturnReportModal";

  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:99999;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    background:rgba(0,0,0,.88);
    backdrop-filter:blur(10px);
  `;

  modal.innerHTML = `
    <div
      class="card"
      style="
        width:100%;
        max-width:700px;
        max-height:90vh;
        overflow-y:auto;
        padding:28px;
        position:relative;
      "
    >

      <button
        type="button"
        id="closeAdminReturnReport"
        style="
          position:absolute;
          top:15px;
          right:18px;
          background:none;
          border:none;
          color:var(--text);
          font-size:1.8rem;
          cursor:pointer;
        "
      >
        &times;
      </button>

      <div
        style="
          margin-bottom:20px;
        "
      >
        <span
          class="section-label"
        >
          Completed Return
        </span>

        <h2
          style="
            margin:5px 0 8px;
          "
        >
          Return Inspection Report
        </h2>

        <p
          style="
            color:var(--sub);
            margin:0;
          "
        >
          Booking #${escapeHtml(
            booking.id.slice(
              -8
            )
          )}
        </p>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(180px,1fr)
            );
          gap:12px;
          margin-bottom:20px;
        "
      >

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Customer
          </span>

          <strong>
            ${escapeHtml(
              booking.userName ||
                booking.customerName ||
                "Customer"
            )}
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Vehicle
          </span>

          <strong>
            ${escapeHtml(
              booking.vehicleName ||
                booking.carName ||
                "Vehicle"
            )}
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Start Odometer
          </span>

          <strong>
            ${
              startOdo !== ""
                ? `${escapeHtml(
                    startOdo
                  )} KM`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            End Odometer
          </span>

          <strong>
            ${
              endOdo !== ""
                ? `${escapeHtml(
                    endOdo
                  )} KM`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            FASTag at Start
          </span>

          <strong>
            ${
              startFastag !== ""
                ? `₹${escapeHtml(
                    startFastag
                  )}`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            FASTag at Return
          </span>

          <strong>
            ${
              returnFastag !== ""
                ? `₹${escapeHtml(
                    returnFastag
                  )}`
                : "—"
            }
          </strong>
        </div>

        <div
          style="
            padding:14px;
            border:1px solid var(--line);
            border-radius:10px;
          "
        >
          <span
            style="
              display:block;
              color:var(--sub);
              font-size:.75rem;
            "
          >
            Distance Driven
          </span>

          <strong
            style="
              color:var(--accent);
            "
          >
            ${
              distance !== null
                ? `${distance} KM`
                : "—"
            }
          </strong>
        </div>

      </div>

      <h3
        style="
          margin-bottom:12px;
        "
      >
        Inspection / Deductions
      </h3>

      ${deductionHtml}

      <div
        style="
          margin-top:20px;
          padding:16px;
          border-top:1px solid var(--line);
        "
      >

        <div
          style="
            display:flex;
            justify-content:space-between;
            margin-bottom:10px;
          "
        >
          <span>
            Original Security Deposit
          </span>

          <strong>
            ${formatINR(
              deposit
            )}
          </strong>
        </div>

        <div
          style="
            display:flex;
            justify-content:space-between;
            margin-bottom:10px;
          "
        >
          <span>
            Total Deductions
          </span>

          <strong
            style="
              color:#ef476f;
            "
          >
            ${formatINR(
              totalDeduction
            )}
          </strong>
        </div>

        <div
          style="
            display:flex;
            justify-content:space-between;
            font-size:1.15rem;
            padding-top:12px;
            border-top:1px solid var(--line);
          "
        >
          <span>
            Refundable Customer Amount
          </span>

          <strong
            style="
              color:var(--accent);
            "
          >
            ${formatINR(
              refund
            )}
          </strong>
        </div>

      </div>

      <div
        style="
          margin-top:20px;
          padding:16px;
          border:1px solid var(--line);
          border-radius:10px;
        "
      >
        <span
          style="
            display:block;
            color:var(--sub);
            font-size:.75rem;
            margin-bottom:7px;
          "
        >
          Invoice / Inspection Notes
        </span>

        <div
          style="
            line-height:1.7;
          "
        >
          ${escapeHtml(
            notes
          )}
        </div>
      </div>

      <div
        style="
          display:flex;
          justify-content:flex-end;
          margin-top:22px;
        "
      >
        <button
          type="button"
          id="closeAdminReturnReportBottom"
          class="btn btn-dark"
        >
          Close Report
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(
    modal
  );

  const close = () => {
    modal.remove();
  };

  $("closeAdminReturnReport")
    ?.addEventListener(
      "click",
      close
    );

  $("closeAdminReturnReportBottom")
    ?.addEventListener(
      "click",
      close
    );

  modal.addEventListener(
    "click",
    (event) => {
      if (
        event.target ===
        modal
      ) {
        close();
      }
    }
  );
}

// ============================================================================
// PAYMENT
// ============================================================================

async function loadPaymentData() {
  renderPaymentsTable();
}

function renderPaymentsTable() {
  if (!paymentsTableWrap) {
    return;
  }

  const pending =
    bookingsData.filter(
      (booking) =>
        booking.paymentStatus ===
        "pending_verification"
    );

  if (!pending.length) {
    paymentsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        No payments awaiting verification.
      </p>`;

    return;
  }

  let html = `
    <div style="width:100%;overflow-x:auto;">

      <table
        class="admin-table"
        style="
          width:100%;
          min-width:900px;
          border-collapse:collapse;
          text-align:left;
        "
      >

        <thead>
          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >

            <th style="padding:12px;">
              Booking
            </th>

            <th style="padding:12px;">
              Customer
            </th>

            <th style="padding:12px;">
              Vehicle
            </th>

            <th style="padding:12px;">
              Amount
            </th>

            <th style="padding:12px;">
              Reference
            </th>

            <th
              style="
                padding:12px;
                text-align:right;
              "
            >
              Action
            </th>

          </tr>
        </thead>

        <tbody>
  `;

  pending.forEach(
    (booking) => {
      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
          "
        >

          <td
            style="
              padding:12px;
              font-family:monospace;
            "
          >
            #${escapeHtml(
              booking.id.slice(
                -8
              )
            )}
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              booking.userName ||
                "Customer"
            )}
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              booking.vehicleName ||
                "Vehicle"
            )}
          </td>

          <td
            style="
              padding:12px;
              color:var(--accent);
              font-weight:700;
            "
          >
            ${formatINR(
              booking.totalAmount
            )}
          </td>

          <td
            style="
              padding:12px;
              font-family:monospace;
            "
          >
            ${escapeHtml(
              booking.paymentRef ||
                "—"
            )}
          </td>

          <td
            style="
              padding:12px;
              text-align:right;
            "
          >
            <button
              type="button"
              class="btn btn-dark review-payment-btn"
              data-bid="${escapeHtml(
                booking.id
              )}"
              style="
                padding:6px 12px;
                font-size:.8rem;
              "
            >
              Review
            </button>
          </td>

        </tr>
      `;
    }
  );

  html += `
        </tbody>
      </table>

    </div>
  `;

  paymentsTableWrap.innerHTML =
    html;

  paymentsTableWrap
    .querySelectorAll(
      ".review-payment-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const booking =
            bookingsData.find(
              (item) =>
                item.id ===
                button.dataset.bid
            );

          if (booking) {
            openPaymentModal(
              booking
            );
          }
        }
      );
    });
}

function initialisePaymentModal() {
  const close =
    $("closePaymentModal");

  if (close) {
    close.addEventListener(
      "click",
      () => {
        hideModal(
          "paymentModal"
        );
      }
    );
  }

  const approve =
    $("approvePaymentBtn");

  if (approve) {
    approve.addEventListener(
      "click",
      async () => {
        if (
          !activePaymentBooking
        ) {
          return;
        }

        try {
          approve.disabled =
            true;

          approve.textContent =
            "Approving...";

          await updateDoc(
            doc(
              db,
              "bookings",
              activePaymentBooking.id
            ),
            {
              paymentStatus:
                "paid",

              status:
                "confirmed",

              paymentVerifiedAt:
                serverTimestamp(),

              paymentVerifiedBy:
                currentUser
                  ? currentUser.uid
                  : null,
            }
          );

          activePaymentBooking.paymentStatus =
            "paid";

          activePaymentBooking.status =
            "confirmed";

          hideModal(
            "paymentModal"
          );

          renderBookingsTable(
            getFilteredBookings()
          );

          renderPaymentsTable();

          updateRevenueStats();

        } catch (error) {
          console.error(
            "PAYMENT APPROVAL ERROR:",
            error
          );

          alert(
            "Could not approve payment.\n\n" +
            error.message
          );

        } finally {
          approve.disabled =
            false;

          approve.textContent =
            "Approve & Confirm Booking";
        }
      }
    );
  }

  const reject =
    $("rejectPaymentBtn");

  if (reject) {
    reject.addEventListener(
      "click",
      async () => {
        if (
          !activePaymentBooking
        ) {
          return;
        }

        const reason =
          prompt(
            "Reason for rejecting this payment:"
          );

        if (
          reason ===
          null
        ) {
          return;
        }

        try {
          await updateDoc(
            doc(
              db,
              "bookings",
              activePaymentBooking.id
            ),
            {
              paymentStatus:
                "rejected",

              paymentRejectionReason:
                reason ||
                "Payment could not be verified.",
            }
          );

          activePaymentBooking.paymentStatus =
            "rejected";

          hideModal(
            "paymentModal"
          );

          renderPaymentsTable();

          renderBookingsTable(
            getFilteredBookings()
          );

        } catch (error) {
          console.error(
            "PAYMENT REJECTION ERROR:",
            error
          );

          alert(
            "Could not reject payment.\n\n" +
            error.message
          );
        }
      }
    );
  }
}

function openPaymentModal(
  booking
) {
  activePaymentBooking =
    booking;

  const title =
    $("paymentModalTitle");

  if (title) {
    title.textContent =
      `Booking #${booking.id.slice(
        -8
      )}`;
  }

  const body =
    $("paymentModalBody");

  if (body) {
    body.innerHTML = `
      <div
        style="
          display:grid;
          gap:12px;
        "
      >

        <div class="booking-summary__row">
          <span>Customer</span>
          <strong>
            ${escapeHtml(
              booking.userName ||
                "Customer"
            )}
          </strong>
        </div>

        <div class="booking-summary__row">
          <span>Vehicle</span>
          <strong>
            ${escapeHtml(
              booking.vehicleName ||
                "Vehicle"
            )}
          </strong>
        </div>

        <div class="booking-summary__row">
          <span>Amount</span>
          <strong>
            ${formatINR(
              booking.totalAmount
            )}
          </strong>
        </div>

        <div class="booking-summary__row">
          <span>Method</span>
          <strong>
            ${escapeHtml(
              booking.paymentMethod ||
                "UPI"
            )}
          </strong>
        </div>

        <div class="booking-summary__row">
          <span>Reference</span>
          <strong
            style="
              font-family:monospace;
            "
          >
            ${escapeHtml(
              booking.paymentRef ||
                "—"
            )}
          </strong>
        </div>

        ${
          booking.paymentScreenshotURL
            ? `
              <img
                src="${escapeHtml(
                  booking.paymentScreenshotURL
                )}"
                alt="Payment screenshot"
                style="
                  width:100%;
                  max-height:400px;
                  object-fit:contain;
                  border-radius:10px;
                  background:#000;
                  margin-top:10px;
                "
              />
            `
            : `
              <p
                style="
                  color:var(--sub);
                "
              >
                No payment screenshot uploaded.
              </p>
            `
        }

      </div>
    `;
  }

  showModal(
    "paymentModal"
  );
}

// ============================================================================
// REVENUE
// ============================================================================

function updateRevenueStats() {
  const paid =
    bookingsData.filter(
      (booking) =>
        booking.paymentStatus ===
        "paid"
    );

  const totalRevenue =
    paid.reduce(
      (sum, booking) =>
        sum +
        Number(
          booking.totalAmount ||
            0
        ),
      0
    );

  const now =
    new Date();

  const monthlyRevenue =
    paid
      .filter((booking) => {
        const date =
          parseDateOnly(
            booking.paymentVerifiedAt
          ) ||
          parseDateOnly(
            booking.bookingDate
          ) ||
          parseDateOnly(
            booking.pickupDate
          );

        return (
          date &&
          date.getFullYear() ===
            now.getFullYear() &&
          date.getMonth() ===
            now.getMonth()
        );
      })
      .reduce(
        (sum, booking) =>
          sum +
          Number(
            booking.totalAmount ||
              0
          ),
        0
      );

  const pendingPayments =
    bookingsData.filter(
      (booking) =>
        booking.paymentStatus ===
        "pending_verification"
    ).length;

  const average =
    bookingsData.length
      ? bookingsData.reduce(
          (sum, booking) =>
            sum +
            Number(
              booking.totalAmount ||
                0
            ),
          0
        ) /
        bookingsData.length
      : 0;

  const totalRevenueEl =
    $("statTotalRevenue");

  if (totalRevenueEl) {
    totalRevenueEl.textContent =
      formatINR(
        totalRevenue
      );
  }

  const monthlyEl =
    $("statMonthRevenue");

  if (monthlyEl) {
    monthlyEl.textContent =
      formatINR(
        monthlyRevenue
      );
  }

  const pendingEl =
    $("statPendingPayments");

  if (pendingEl) {
    pendingEl.textContent =
      pendingPayments;
  }

  const averageEl =
    $("statAvgBooking");

  if (averageEl) {
    averageEl.textContent =
      formatINR(
        average
      );
  }

  const badge =
    $("paymentsTabBadge");

  if (badge) {
    if (
      pendingPayments >
      0
    ) {
      badge.hidden =
        false;

      badge.textContent =
        pendingPayments;
    } else {
      badge.hidden =
        true;
    }
  }
}

// ============================================================================
// HOST CAR MEDIA (Node/SQLite media server)
//
// Host car photos now live in the local media server (SQLite metadata +
// disk storage) instead of Firebase Storage, uploaded with:
//   category   = "partner_car_photo"
//   related_id = the host car's Firestore doc id
//
// /api/media requires a Firebase ID token on every request (server verifies
// it the same way profile.js does) — so every call below attaches
// Authorization: Bearer <token> from the signed-in admin.
//
// A partner_cars document may still have an old `photos` array from before
// this migration (public Firebase Storage URLs) — those are rendered
// directly, no auth needed. New, server-hosted photos are private, so each
// one is fetched as a Blob and turned into a temporary object URL, same
// pattern as profile.js's getPrivateMediaBlobUrl().
// ============================================================================

const MEDIA_SERVER_URL = "http://localhost:4000"; // same server profile.js talks to — point this at your real host before deploying

const hostPhotoCache = new Map(); // carId -> loaded [{ id, mimeType, originalName, blobUrl }]

async function mediaAuthHeaders() {
  if (!currentUser) return {};
  const token = await currentUser.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

// The uploader of a given photo could be the host who submitted the car
// (their own Firebase uid) or an admin who added/replaced a photo from this
// dashboard (the admin's own uid) — the media server only lets you filter by
// one user_id per request, so we query both and merge by media id.
//
// If your partner_cars documents store the owner's Firebase uid under a
// different field name than the ones checked here, add it to this list.
function getHostCarOwnerUid(car) {
  return (
    car.ownerUid ||
    car.ownerId ||
    car.uid ||
    car.userId ||
    car.partnerUid ||
    car.hostUid ||
    null
  );
}

async function fetchHostCarMedia(car) {
  const relatedId = car.id;
  const ownerUid = getHostCarOwnerUid(car);
  const headers = await mediaAuthHeaders();

  const urls = [
    `${MEDIA_SERVER_URL}/api/media?category=partner_car_photo&relatedId=${encodeURIComponent(relatedId)}`,
  ];

  if (ownerUid && ownerUid !== currentUser?.uid) {
    urls.push(
      `${MEDIA_SERVER_URL}/api/media?category=partner_car_photo&relatedId=${encodeURIComponent(
        relatedId
      )}&userId=${encodeURIComponent(ownerUid)}`
    );
  }

  const seen = new Map();

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(`HOST CAR MEDIA FETCH FAILED (${response.status}):`, url);
        continue;
      }

      const rows = await response.json();

      (Array.isArray(rows) ? rows : []).forEach((row) => seen.set(row.id, row));
    } catch (error) {
      console.warn("HOST CAR MEDIA FETCH ERROR:", error);
    }
  }

  return [...seen.values()];
}

async function fetchMediaBlobUrl(mediaId) {
  const headers = await mediaAuthHeaders();

  const response = await fetch(
    `${MEDIA_SERVER_URL}/api/media/file/${encodeURIComponent(mediaId)}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Could not load photo (${response.status}).`);
  }

  const blob = await response.blob();

  return URL.createObjectURL(blob);
}

// Loads + caches the server-hosted photos for one car. Cheap on repeat
// toggles — only hits the network the first time a car's photo row is
// opened, or after invalidateHostPhotoCache() runs post upload/delete.
async function loadHostPhotosIntoCache(car) {
  if (hostPhotoCache.has(car.id)) {
    return hostPhotoCache.get(car.id);
  }

  const records = await fetchHostCarMedia(car);

  const withBlobUrls = await Promise.all(
    records.map(async (record) => {
      try {
        const blobUrl = await fetchMediaBlobUrl(record.id);
        return { ...record, blobUrl };
      } catch (error) {
        console.warn(`Could not load photo ${record.id}:`, error);
        return null;
      }
    })
  );

  const loaded = withBlobUrls.filter(Boolean);

  hostPhotoCache.set(car.id, loaded);

  return loaded;
}

function invalidateHostPhotoCache(carId) {
  const cached = hostPhotoCache.get(carId);

  if (cached) {
    cached.forEach((item) => {
      if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
    });
  }

  hostPhotoCache.delete(carId);
}

// ============================================================================
// HOST CARS
// ============================================================================

async function loadHostCars() {
  if (hostCarsTableWrap) {
    hostCarsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        Loading host listings...
      </p>`;
  }

  try {
    const snapshot =
      await getDocs(
        collection(
          db,
          "partner_cars"
        )
      );

    hostCarsData =
      snapshot.docs.map(
        (item) => ({
          id: item.id,
          ...item.data(),
        })
      );

    const pending =
      hostCarsData.filter(
        (car) =>
          car.status ===
          "pending_approval"
      ).length;

    const pendingEl =
      $("statPendingHosts");

    if (pendingEl) {
      pendingEl.textContent =
        pending;
    }

    renderHostCarsTable(
      hostCarsData
    );

  } catch (error) {
    console.error(
      "HOST CAR LOAD ERROR:",
      error
    );

    if (hostCarsTableWrap) {
      hostCarsTableWrap.innerHTML =
        `<p style="color:#ef476f;">
          Failed to load host listings.
        </p>

        <small style="color:var(--sub);">
          ${escapeHtml(
            error.message
          )}
        </small>`;
    }
  }
}

// Server-hosted photos are private and fetched lazily (only once a car's
// photo row is actually opened), so the row starts out showing just the
// legacy Firestore `photos` array (if any) plus a loading line, and the
// toggle button's count is a "so far" hint until it's been opened once.
function renderHostCarsTable(
  cars
) {
  if (!hostCarsTableWrap) {
    return;
  }

  if (!cars.length) {
    hostCarsTableWrap.innerHTML =
      `<p style="color:var(--sub);">
        No host vehicle listings submitted yet.
      </p>`;

    return;
  }

  let html = `
    <div style="width:100%;overflow-x:auto;">

      <table
        class="admin-table"
        style="
          width:100%;
          min-width:1000px;
          border-collapse:collapse;
          text-align:left;
        "
      >

        <thead>
          <tr
            style="
              border-bottom:1px solid var(--line);
              color:var(--sub);
            "
          >

            <th style="padding:12px;">
              Vehicle
            </th>

            <th style="padding:12px;">
              Specs
            </th>

            <th style="padding:12px;">
              Daily Rate
            </th>

            <th style="padding:12px;">
              Owner
            </th>

            <th style="padding:12px;">
              Status
            </th>

            <th
              style="
                padding:12px;
                text-align:right;
              "
            >
              Action
            </th>

          </tr>
        </thead>

        <tbody>
  `;

  cars.forEach(
    (car) => {
      const legacyPhotos =
        Array.isArray(
          car.photos
        )
          ? car.photos
          : [];

      const cachedServerPhotos =
        hostPhotoCache.get(
          car.id
        ) || [];

      const knownPhotoCount =
        legacyPhotos.length +
        cachedServerPhotos.length;

      const photoRow =
        `host-photo-${car.id}`;

      html += `
        <tr
          style="
            border-bottom:
              1px solid rgba(255,255,255,.06);
          "
        >

          <td style="padding:12px;">
            <strong>
              ${escapeHtml(
                car.brand ||
                  ""
              )}
              ${escapeHtml(
                car.model ||
                  ""
              )}
            </strong>

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.8rem;
              "
            >
              ${escapeHtml(
                car.location ||
                  "—"
              )}
            </span>
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              car.category ||
                "—"
            )}
            •
            ${escapeHtml(
              car.transmission ||
                "—"
            )}
            •
            ${escapeHtml(
              car.fuel ||
                "—"
            )}
          </td>

          <td
            style="
              padding:12px;
              color:var(--accent);
              font-weight:700;
            "
          >
            ${formatINR(
              car.priceDay
            )}
          </td>

          <td style="padding:12px;">
            ${escapeHtml(
              car.ownerName ||
                "—"
            )}

            <br>

            <span
              style="
                color:var(--sub);
                font-size:.8rem;
              "
            >
              ${escapeHtml(
                car.ownerPhone ||
                  "—"
              )}
            </span>
          </td>

          <td style="padding:12px;">
            <span
              class="fleet-status ${getStatusClass(
                car.status
              )}"
            >
              ${escapeHtml(
                car.status ||
                  "unknown"
              )}
            </span>
          </td>

          <td
            style="
              padding:12px;
              text-align:right;
            "
          >

            ${
              car.status ===
              "pending_approval"
                ? `
                  <button
                    type="button"
                    class="btn btn-dark approve-host-btn"
                    data-hid="${escapeHtml(
                      car.id
                    )}"
                    style="
                      padding:5px 9px;
                      font-size:.78rem;
                    "
                  >
                    Approve
                  </button>

                  <button
                    type="button"
                    class="btn btn-outline reject-host-btn"
                    data-hid="${escapeHtml(
                      car.id
                    )}"
                    style="
                      padding:5px 9px;
                      font-size:.78rem;
                      color:#ef476f;
                      border-color:#ef476f;
                    "
                  >
                    Reject
                  </button>
                `
                : car.status ===
                  "approved"
                  ? `
                    <button
                      type="button"
                      class="btn btn-outline host-photo-toggle-btn"
                      data-hid="${escapeHtml(
                        car.id
                      )}"
                      data-target="${escapeHtml(
                        photoRow
                      )}"
                      style="
                        padding:5px 9px;
                        font-size:.78rem;
                      "
                    >
                      ${
                        knownPhotoCount
                          ? `${knownPhotoCount} Photos`
                          : "Photos"
                      }
                      ▾
                    </button>

                    <button
                      type="button"
                      class="btn btn-outline host-photo-upload-btn"
                      data-hid="${escapeHtml(
                        car.id
                      )}"
                      style="
                        padding:5px 9px;
                        font-size:.78rem;
                      "
                    >
                      Upload
                    </button>

                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      class="host-photo-input"
                      data-hid="${escapeHtml(
                        car.id
                      )}"
                      hidden
                    />
                  `
                  : "—"
            }

          </td>

        </tr>

        ${
          car.status ===
          "approved"
            ? `
              <tr
                id="${escapeHtml(
                  photoRow
                )}"
                hidden
              >
                <td
                  colspan="6"
                  style="padding:18px;"
                >

                  <div
                    class="host-photo-grid"
                    data-hid="${escapeHtml(
                      car.id
                    )}"
                    style="
                      display:flex;
                      gap:12px;
                      flex-wrap:wrap;
                    "
                  >

                    ${renderLegacyHostPhotos(
                      car.id,
                      legacyPhotos
                    )}

                    ${renderServerHostPhotos(
                      car.id,
                      cachedServerPhotos
                    )}

                  </div>

                </td>
              </tr>
            `
            : ""
        }
      `;
    }
  );

  html += `
        </tbody>
      </table>

    </div>
  `;

  hostCarsTableWrap.innerHTML =
    html;

  attachHostCarEvents();
}

// Old Firebase Storage photos: public URL, no fetch needed, plain <img>.
function renderLegacyHostPhotos(carId, urls) {
  if (!urls.length) return "";

  return urls
    .map(
      (url, index) => `
        <div
          class="host-photo-tile"
          style="position:relative;width:120px;height:90px;"
        >
          <img
            src="${escapeHtml(url)}"
            alt="Host car photo ${index + 1}"
            style="
              width:100%;height:100%;object-fit:cover;
              border-radius:8px;border:1px solid var(--line);
            "
          />
          <button
            type="button"
            class="remove-host-photo-btn"
            data-hid="${escapeHtml(carId)}"
            data-source="legacy"
            data-url="${encodeURIComponent(url)}"
            style="
              position:absolute;top:-7px;right:-7px;width:24px;height:24px;
              border:none;border-radius:50%;background:#ef476f;color:white;
              cursor:pointer;
            "
          >×</button>
        </div>
      `
    )
    .join("");
}

// New media-server photos: private, so these only render once
// loadHostPhotosIntoCache() has actually fetched blob URLs for them —
// before that, cachedServerPhotos is empty and this renders nothing (the
// toggle handler fills it in and re-renders once the fetch completes).
function renderServerHostPhotos(carId, photos) {
  if (!photos.length) return "";

  return photos
    .map(
      (photo) => `
        <div
          class="host-photo-tile"
          style="position:relative;width:120px;height:90px;"
        >
          <img
            src="${escapeHtml(photo.blobUrl)}"
            alt="${escapeHtml(photo.originalName || "Host car photo")}"
            style="
              width:100%;height:100%;object-fit:cover;
              border-radius:8px;border:1px solid var(--line);
            "
          />
          <button
            type="button"
            class="remove-host-photo-btn"
            data-hid="${escapeHtml(carId)}"
            data-source="server"
            data-media-id="${escapeHtml(photo.id)}"
            style="
              position:absolute;top:-7px;right:-7px;width:24px;height:24px;
              border:none;border-radius:50%;background:#ef476f;color:white;
              cursor:pointer;
            "
          >×</button>
        </div>
      `
    )
    .join("");
}

// ============================================================================
// HOST CAR EVENTS
// ============================================================================

function attachHostCarEvents() {
  // APPROVE
  hostCarsTableWrap
    .querySelectorAll(
      ".approve-host-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const id =
            button.dataset.hid;

          try {
            button.disabled =
              true;

            button.textContent =
              "Approving...";

            await setDoc(
              doc(
                db,
                "partner_cars",
                id
              ),
              {
                status:
                  "approved",

                approvedAt:
                  serverTimestamp(),

                approvedBy:
                  currentUser
                    ? currentUser.uid
                    : null,
              },
              {
                merge: true,
              }
            );

            const car =
              hostCarsData.find(
                (item) =>
                  item.id === id
              );

            if (car) {
              car.status =
                "approved";
            }

            updateHostCount();

            renderHostCarsTable(
              hostCarsData
            );

          } catch (error) {
            console.error(
              "HOST APPROVAL ERROR:",
              error
            );

            button.disabled =
              false;

            button.textContent =
              "Approve";

            alert(
              "Could not approve host car.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // REJECT
  hostCarsTableWrap
    .querySelectorAll(
      ".reject-host-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const id =
            button.dataset.hid;

          const reason =
            prompt(
              "Reason for rejecting this host car:"
            );

          if (
            reason ===
            null
          ) {
            return;
          }

          try {
            button.disabled =
              true;

            await setDoc(
              doc(
                db,
                "partner_cars",
                id
              ),
              {
                status:
                  "rejected",

                rejectionReason:
                  reason ||
                  "Listing rejected.",

                rejectedAt:
                  serverTimestamp(),

                rejectedBy:
                  currentUser
                    ? currentUser.uid
                    : null,
              },
              {
                merge: true,
              }
            );

            const car =
              hostCarsData.find(
                (item) =>
                  item.id === id
              );

            if (car) {
              car.status =
                "rejected";
            }

            updateHostCount();

            renderHostCarsTable(
              hostCarsData
            );

          } catch (error) {
            console.error(
              "HOST REJECTION ERROR:",
              error
            );

            button.disabled =
              false;

            alert(
              "Could not reject host car.\n\n" +
              error.message
            );
          }
        }
      );
    });

  // PHOTOS TOGGLE — lazily fetches server-hosted photos the first time a
  // given car's row is opened, then just shows/hides on subsequent clicks.
  hostCarsTableWrap
    .querySelectorAll(
      ".host-photo-toggle-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const carId = button.dataset.hid;
          const row = document.getElementById(button.dataset.target);

          if (!row) return;

          const wasHidden = row.hidden;
          row.hidden = !wasHidden;

          if (!wasHidden) {
            // just closed — nothing to fetch
            return;
          }

          if (hostPhotoCache.has(carId)) {
            // already loaded on a previous open — nothing to do
            return;
          }

          const grid = row.querySelector(".host-photo-grid");

          if (grid) {
            grid.insertAdjacentHTML(
              "beforeend",
              `<span class="host-photo-loading" style="color:var(--sub);">Loading photos…</span>`
            );
          }

          const car = hostCarsData.find((item) => item.id === carId);

          if (!car) return;

          try {
            await loadHostPhotosIntoCache(car);
          } catch (error) {
            console.warn("HOST PHOTO LOAD ERROR:", error);
          }

          // Re-render so the newly loaded photos (and the accurate count on
          // the toggle button) show up. The row stays open across the
          // re-render since renderHostCarsTable rebuilds `hidden` from
          // scratch — reopen it here.
          renderHostCarsTable(hostCarsData);

          const reopenedRow = document.getElementById(`host-photo-${carId}`);
          if (reopenedRow) reopenedRow.hidden = false;
        }
      );
    });

  // PHOTO UPLOAD trigger
  hostCarsTableWrap
    .querySelectorAll(
      ".host-photo-upload-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const input =
            hostCarsTableWrap.querySelector(
              `.host-photo-input[data-hid="${button.dataset.hid}"]`
            );

          if (input) {
            input.click();
          }
        }
      );
    });

  // FILE INPUT — uploads to the media server, not Firebase Storage
  hostCarsTableWrap
    .querySelectorAll(
      ".host-photo-input"
    )
    .forEach((input) => {
      input.addEventListener(
        "change",
        async () => {
          const files =
            Array.from(
              input.files ||
                []
            );

          if (!files.length) {
            return;
          }

          await uploadHostPhotos(
            input.dataset.hid,
            files
          );

          input.value =
            "";
        }
      );
    });

  // REMOVE PHOTO — legacy Firestore-array photos vs. server-hosted photos
  // are removed through two different paths (see data-source).
  hostCarsTableWrap
    .querySelectorAll(
      ".remove-host-photo-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const confirmed =
            confirm(
              "Remove this photo from the host car listing?"
            );

          if (!confirmed) {
            return;
          }

          const carId = button.dataset.hid;
          const source = button.dataset.source;

          button.disabled = true;

          try {
            if (source === "server") {
              await removeServerHostPhoto(carId, button.dataset.mediaId);
            } else {
              await removeLegacyHostPhoto(
                carId,
                decodeURIComponent(button.dataset.url)
              );
            }

            renderHostCarsTable(hostCarsData);

            const row = document.getElementById(`host-photo-${carId}`);
            if (row) row.hidden = false;

          } catch (error) {
            console.error(
              "PHOTO REMOVE ERROR:",
              error
            );

            button.disabled = false;

            alert(
              "Could not remove photo.\n\n" +
              error.message
            );
          }
        }
      );
    });
}

async function removeLegacyHostPhoto(carId, url) {
  const car = hostCarsData.find((item) => item.id === carId);
  if (!car) return;

  const photos = Array.isArray(car.photos) ? car.photos : [];
  const remaining = photos.filter((photo) => photo !== url);

  await updateDoc(doc(db, "partner_cars", carId), { photos: remaining });

  car.photos = remaining;
}

async function removeServerHostPhoto(carId, mediaId) {
  const headers = await mediaAuthHeaders();

  const response = await fetch(
    `${MEDIA_SERVER_URL}/api/media/${encodeURIComponent(mediaId)}`,
    { method: "DELETE", headers }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Delete failed (${response.status}).`);
  }

  invalidateHostPhotoCache(carId);
}

function updateHostCount() {
  const pending =
    hostCarsData.filter(
      (car) =>
        car.status ===
        "pending_approval"
    ).length;

  const element =
    $("statPendingHosts");

  if (element) {
    element.textContent =
      pending;
  }
}

// Uploads to the local media server (category=partner_car_photo,
// relatedId=<car id>) instead of Firebase Storage — the admin's own ID
// token is attached, so these uploads land under the admin's uid on the
// server side (see the merge logic in fetchHostCarMedia).
async function uploadHostPhotos(
  hostId,
  files
) {
  const car =
    hostCarsData.find(
      (item) =>
        item.id === hostId
    );

  if (!car) {
    return;
  }

  if (!currentUser) {
    alert("You must be signed in to upload photos.");
    return;
  }

  const headers = await mediaAuthHeaders();
  const failures = [];

  for (const file of files) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "partner_car_photo");
      formData.append("relatedId", hostId);

      const response = await fetch(
        `${MEDIA_SERVER_URL}/api/media/upload`,
        { method: "POST", headers, body: formData }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Upload failed (${response.status}).`);
      }
    } catch (error) {
      console.error("HOST PHOTO UPLOAD ERROR:", error);
      failures.push(`${file.name}: ${error.message}`);
    }
  }

  invalidateHostPhotoCache(hostId);

  // Immediately reload so the new photos show up rather than waiting for
  // the next toggle-open.
  try {
    await loadHostPhotosIntoCache(car);
  } catch (error) {
    console.warn("HOST PHOTO RELOAD ERROR:", error);
  }

  renderHostCarsTable(hostCarsData);

  const row = document.getElementById(`host-photo-${hostId}`);
  if (row) row.hidden = false;

  if (failures.length) {
    alert(
      "Some photos could not be uploaded:\n\n" + failures.join("\n")
    );
  }
}

// ============================================================================
// RETURN MODAL CLOSE
// ============================================================================

function initialiseReturnModal() {
  const close =
    $("closeReturnModal");

  if (close) {
    close.addEventListener(
      "click",
      () => {
        hideModal(
          "returnModal"
        );
      }
    );
  }

  const modal =
    $("returnModal");

  if (modal) {
    modal.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          modal
        ) {
          hideModal(
            "returnModal"
          );
        }
      }
    );
  }
}

// ============================================================================
// GLOBAL ERROR LOGGING
// ============================================================================

window.addEventListener(
  "error",
  (event) => {
    console.error(
      "ADMIN PAGE ERROR:",
      event.error ||
        event.message
    );
  }
);

window.addEventListener(
  "unhandledrejection",
  (event) => {
    console.error(
      "ADMIN PROMISE ERROR:",
      event.reason
    );
  }
);

console.log(
  "CARRENTPE Admin JS loaded successfully."
);
