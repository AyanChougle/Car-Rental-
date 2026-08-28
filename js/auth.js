// Login + signup + forgot password, backed by real Firebase Auth + Firestore.
import { auth, db } from "./firebase-init.js";
import { saveUserIpAddress } from "./ip-fetcher.js";
import "./nav-helper.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

// ---- where to land after login/signup ----
// booking.html (etc.) sends people here as index.html?next=booking.html%3Freg%3DZIP003
// when they're not signed in yet. Only same-site relative paths are honored —
// no "https://..." or "//..." values — so this can't be turned into an
// open redirect.
function getSafeNextUrl() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next) return "profile.html";
  if (/^https?:\/\//i.test(next) || next.startsWith("//")) return "profile.html";
  return next;
}

// ---- password show/hide (unchanged behavior from the original auth.js) ----
function wirePasswordToggles() {
  document.querySelectorAll(".password-box").forEach(function (box) {
    var input = box.querySelector("input");
    var btn = box.querySelector(".toggle-password");
    if (!btn || !input) return;

    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Show password");
    btn.textContent = "show";

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      btn.textContent = isHidden ? "hide" : "show";
      btn.setAttribute("aria-pressed", String(isHidden));
      btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
      input.focus({ preventScroll: true });
    });

    btn.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        btn.click();
      }
    });
  });
}

// ---- Firebase error codes -> plain language ----
// Covers Auth errors AND the Firestore/project-setup errors that show up
// most often when Email/Password sign-in or Firestore hasn't been turned
// on yet in the Firebase console — those are easy to mistake for a code bug.
function friendlyAuthError(error) {
  const map = {
    "auth/email-already-in-use": "That email already has an account — try logging in instead.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/weak-password": "Password needs to be at least 6 characters.",
    "auth/missing-password": "Enter a password to continue.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Wrong password — try again.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts — wait a bit and try again.",
    "auth/network-request-failed": "Network error — check your connection and try again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/popup-blocked": "Your browser blocked the sign-in pop-up — allow pop-ups for this site and try again.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/account-exists-with-different-credential": "That email is already registered with a password — log in with your password instead.",
    "auth/operation-not-allowed":
      "Email/Password sign-in isn't turned on for this project yet — enable it in Firebase Console → Authentication → Sign-in method.",
    "auth/configuration-not-found":
      "Firebase Authentication isn't set up for this project yet — open Firebase Console → Authentication and click Get Started.",
    "permission-denied":
      "Firestore is blocking this write — deploy firestore.rules (see README) so signed-in users can write their own profile.",
    "unavailable": "Can't reach Firebase right now — check your connection and try again.",
  };
  return map[error.code] || "Something went wrong. Please try again.";
}

function setStatus(form, message, isError) {
  const el = form.querySelector(".form-status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("form-status--error", Boolean(isError));
}

function wireLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const submitBtn = form.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    setStatus(form, "Signing in...", false);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      saveUserIpAddress(cred.user.uid).catch(() => {});
      window.location.href = getSafeNextUrl();
    } catch (error) {
      setStatus(form, friendlyAuthError(error), true);
      submitBtn.disabled = false;
    }
  });
}

function wireSignupForm() {
  const form = document.getElementById("signupForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const phone = document.getElementById("signupPhone").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const submitBtn = form.querySelector('button[type="submit"]');

    if (password !== confirmPassword) {
      setStatus(form, "Passwords don't match.", true);
      return;
    }
    if (password.length < 6) {
      setStatus(form, "Password needs to be at least 6 characters.", true);
      return;
    }

    submitBtn.disabled = true;
    setStatus(form, "Creating your account...", false);

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", credential.user.uid), {
        name,
        email,
        phone: phone || null,
        licenseURL: null,
        licenseFrontURL: null,
        licenseBackURL: null,
        licenseStatus: "not_submitted",
        aadharURL: null,
        aadharStatus: "not_submitted",
        aadharFrontURL: null,
        aadharBackURL: null,
        panFrontURL: null,
        panBackURL: null,
        panStatus: "not_submitted",
        role: "customer",
        createdAt: serverTimestamp(),
      }, { merge: true });

      saveUserIpAddress(credential.user.uid).catch(() => {});
      window.location.href = getSafeNextUrl();
    } catch (error) {
      setStatus(form, friendlyAuthError(error), true);
      submitBtn.disabled = false;
    }
  });
}

function wireForgotPassword() {
  const link = document.querySelector(".forgot-password");
  const loginForm = document.getElementById("loginForm");
  if (!link || !loginForm) return;

  link.addEventListener("click", async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById("loginEmail");
    const email = emailInput.value.trim();

    if (!email) {
      setStatus(loginForm, "Enter your email above first, then hit Forgot Password.", true);
      emailInput.focus();
      return;
    }

    setStatus(loginForm, "Sending reset link...", false);
    try {
      await sendPasswordResetEmail(auth, email);
      setStatus(loginForm, `Reset link sent to ${email} — check your inbox.`, false);
    } catch (error) {
      setStatus(loginForm, friendlyAuthError(error), true);
    }
  });
}

// ---- Google Sign-In ----
// Only writes a fresh users/{uid} doc the first time this account signs in.
// On every later sign-in it deliberately leaves role and document statuses
// untouched — firestore.rules blocks an owner from changing those fields on
// an *update*, by design (see README's security notes), so re-sending them
// here on a returning user would just fail the write and could break login.
function wireGoogleAuth() {
  const googleBtn = document.getElementById("googleLoginBtn");
  if (!googleBtn) return;

  googleBtn.addEventListener("click", async () => {
    const statusEl = document.getElementById("googleAuthStatus");
    googleBtn.disabled = true;
    if (statusEl) {
      statusEl.classList.remove("form-status--error");
      statusEl.textContent = "Opening Google sign-in...";
    }

    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const user = cred.user;

      const userRef = doc(db, "users", user.uid);
      const existing = await getDoc(userRef);

      if (!existing.exists()) {
        await setDoc(userRef, {
          name: user.displayName || "",
          email: user.email || "",
          phone: user.phoneNumber || null,
          licenseURL: null,
          licenseFrontURL: null,
          licenseBackURL: null,
          licenseStatus: "not_submitted",
          aadharURL: null,
          aadharStatus: "not_submitted",
          aadharFrontURL: null,
          aadharBackURL: null,
          panFrontURL: null,
          panBackURL: null,
          panStatus: "not_submitted",
          role: "customer",
          createdAt: serverTimestamp(),
        });
      }

      saveUserIpAddress(user.uid).catch(() => {});

      if (statusEl) statusEl.textContent = "";

      // Only redirect away if another page explicitly sent us here to sign
      // in (e.g. payment.html?next=...). A plain visit to index.html stays
      // put so the auth-card can swap to the quick date/time picker.
      const hasNext = new URLSearchParams(window.location.search).has("next");
      if (hasNext) {
        window.location.href = getSafeNextUrl();
      }
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = friendlyAuthError(error);
        statusEl.classList.add("form-status--error");
      }
      googleBtn.disabled = false;
    }
  });
}

// ---- Homepage guest/authenticated swap ----
// Only present on index.html: while signed out, the auth-card shows Google
// sign-in + the login/signup forms (#authGuestView). Once signed in, it
// swaps to a quick date/time picker (#authUserView) so a returning user can
// jump straight to browsing available cars instead of seeing a login form
// again. Logging out (here or from profile.html) always lands back on
// index.html, which naturally flips this back to the guest view.
function wireHomepageAuthSwap() {
  const guestView = document.getElementById("authGuestView");
  const userView = document.getElementById("authUserView");
  if (!guestView || !userView) return;

  const quickPickup = document.getElementById("quickPickup");
  const quickDrop = document.getElementById("quickDrop");
  const quickBookBtn = document.getElementById("quickBookBtn");
  const quickBookStatus = document.getElementById("quickBookStatus");
  const quickLogoutBtn = document.getElementById("quickLogoutBtn");
  const authUserName = document.getElementById("authUserName");
  const padDatePart = (value) => String(value).padStart(2, "0");
  const toLocalInput = (date) =>
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;

  function setSensibleDefaultDates() {
    if (!quickPickup || !quickDrop) return;
    const now = new Date();

    const pickup = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
    const drop = new Date(pickup);
    drop.setDate(drop.getDate() + 1);

    quickPickup.min = toLocalInput(now);
    quickDrop.min = toLocalInput(pickup);
    if (!quickPickup.value) quickPickup.value = toLocalInput(pickup);
    if (!quickDrop.value) quickDrop.value = toLocalInput(drop);
  }

  function getFormattedDateTime(el) {
    if (!el) return "";
    if (el._flatpickr && el._flatpickr.selectedDates[0]) {
      const d = el._flatpickr.selectedDates[0];
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedHours = String(hours).padStart(2, "0");
      return `${day}/${month}/${year} ${formattedHours}:${minutes} ${ampm}`;
    }
    return el.value || "";
  }

  if (quickPickup && quickDrop) {
    const syncDatesToStorage = () => {
      const pickupVal = getFormattedDateTime(quickPickup);
      const dropVal = getFormattedDateTime(quickDrop);
      if (pickupVal) {
        sessionStorage.setItem("crp_pickupDate", pickupVal);
        sessionStorage.setItem("kruizly_pickup_full", pickupVal);
      }
      if (dropVal) {
        sessionStorage.setItem("crp_dropDate", dropVal);
        sessionStorage.setItem("kruizly_drop_full", dropVal);
      }
    };

    quickPickup.addEventListener("change", () => {
      syncDatesToStorage();

      if (quickBookStatus) {
        quickBookStatus.textContent = "";
        quickBookStatus.classList.remove("form-status--error");
      }
    });

    quickDrop.addEventListener("change", () => {
      syncDatesToStorage();
    });
  }

  if (quickBookBtn) {
    quickBookBtn.addEventListener("click", () => {
      const pickupVal = getFormattedDateTime(quickPickup);
      const dropVal = getFormattedDateTime(quickDrop);

      if (!pickupVal || !dropVal) {
        quickBookStatus.textContent = "Pick both a pickup and drop date/time first.";
        quickBookStatus.classList.add("form-status--error");
        return;
      }

      quickBookStatus.classList.remove("form-status--error");
      sessionStorage.setItem("crp_pickupDate", pickupVal);
      sessionStorage.setItem("crp_dropDate", dropVal);
      window.location.href = `fleet.html?pickup=${encodeURIComponent(pickupVal)}&drop=${encodeURIComponent(dropVal)}`;
    });
  }

  // Intercept any "Explore Fleet" hero buttons or nav links to pass selected dates
  document.querySelectorAll('a[href*="fleet.html"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const pickupVal = getFormattedDateTime(quickPickup);
      const dropVal = getFormattedDateTime(quickDrop);
      if (pickupVal && dropVal) {
        e.preventDefault();
        sessionStorage.setItem("crp_pickupDate", pickupVal);
        sessionStorage.setItem("crp_dropDate", dropVal);
        window.location.href = `fleet.html?pickup=${encodeURIComponent(pickupVal)}&drop=${encodeURIComponent(dropVal)}`;
      }
    });
  });

  if (quickLogoutBtn) {
    quickLogoutBtn.addEventListener("click", () => {
      signOut(auth);
    });
  }

  setSensibleDefaultDates();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      guestView.hidden = true;
      userView.hidden = false;
      if (authUserName) {
        const nameToUse = user.displayName || user.email || "";
        const firstName = nameToUse.split(" ")[0].replace(/,/g, "").trim();
        authUserName.textContent = firstName || "Driver";
      }
      setSensibleDefaultDates();
      if (typeof window.initAllKruizlyDatepickers === "function") {
        window.initAllKruizlyDatepickers();
      }
    } else {
      guestView.hidden = false;
      userView.hidden = true;
    }
  });
}

function wireAuthTabs() {
  const loginRadio = document.getElementById("login-tab");
  const signupRadio = document.getElementById("signup-tab");
  const loginLabel = document.getElementById("loginTabLabel");
  const signupLabel = document.getElementById("signupTabLabel");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  if (!loginLabel || !signupLabel) return;

  function activateTab(tab) {
    if (tab === "signup") {
      if (signupRadio) signupRadio.checked = true;
      if (loginRadio) loginRadio.checked = false;
      if (loginForm) loginForm.style.display = "none";
      if (signupForm) signupForm.style.display = "flex";
    } else {
      if (loginRadio) loginRadio.checked = true;
      if (signupRadio) signupRadio.checked = false;
      if (loginForm) loginForm.style.display = "flex";
      if (signupForm) signupForm.style.display = "none";
    }
  }

  loginLabel.addEventListener("click", () => activateTab("login"));
  signupLabel.addEventListener("click", () => activateTab("signup"));
}

document.addEventListener("DOMContentLoaded", () => {
  wireAuthTabs();
  wirePasswordToggles();
  wireLoginForm();
  wireSignupForm();
  wireForgotPassword();
  wireGoogleAuth();
  wireHomepageAuthSwap();
});
