/**
 * js/auth.js
 * 
 * KRUIZLY Authentication using Firebase Auth SDK + Hostinger MySQL Synchronization.
 * Supports Email/Password, Google Sign-In, Password Reset, and Live Auth State.
 */

import { auth } from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import { api } from "./kruizly-api.js?v=20260904-v15";
import { initDynamicNav } from "./nav-helper.js?v=20260904-v15";

// ============================================================
// STATE & STORAGE
// ============================================================

export function getStoredUser() {
  const stored = localStorage.getItem("kruizly_user");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (!user) {
    localStorage.removeItem("kruizly_user");
  } else {
    localStorage.setItem("kruizly_user", JSON.stringify(user));
  }
}

export function clearStoredUser() {
  localStorage.removeItem("kruizly_user");
  localStorage.removeItem("kruizly_tokens");
}

export function isAdminUser(user) {
  if (!user) return false;
  const role = String(user.role || "").trim().toLowerCase();
  if (role === "admin") return true;
  const email = String(user.email || "").trim().toLowerCase();
  return ["ayan@kruizly.com", "admin@kruizly.com", "carrentpedatabase@gmail.com"].includes(email);
}

export function isManagerUser(user) {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  const role = String(user.role || "").trim().toLowerCase();
  return role === "manager";
}

export function isExecutiveUser(user) {
  if (!user) return false;
  if (isAdminUser(user) || isManagerUser(user)) return true;
  const role = String(user.role || "").trim().toLowerCase();
  return role === "executive";
}

export function getCurrentUser() {
  const stored = getStoredUser();
  if (auth.currentUser) {
    const isAdmin = isAdminUser({ email: auth.currentUser.email, role: stored?.role });
    return {
      uid: auth.currentUser.uid,
      id: auth.currentUser.uid,
      email: auth.currentUser.email,
      name: auth.currentUser.displayName || stored?.name || "User",
      role: isAdmin ? "admin" : (stored?.role || "customer"),
      status: stored?.status || "active",
      ...stored
    };
  }
  if (stored && isAdminUser(stored)) {
    stored.role = "admin";
  }
  return stored;
}

export function isLoggedIn() {
  return !!auth.currentUser || !!getStoredUser();
}

export async function checkAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        const isAdmin = isAdminUser({ email: user.email });
        const initialUser = {
          uid: user.uid,
          id: user.uid,
          email: user.email,
          name: user.displayName || "User",
          role: isAdmin ? "admin" : "customer"
        };
        
        if (!getStoredUser() || (isAdmin && getStoredUser()?.role !== "admin")) {
          setStoredUser(initialUser);
        }

        try {
          const syncRes = await api.post("/users/sync", {
            name: user.displayName || "",
            email: user.email || ""
          }).catch(() => null);

          if (syncRes && syncRes.user) {
            if (isAdmin) syncRes.user.role = "admin";
            setStoredUser(syncRes.user);
          }
        } catch (_) {}
        resolve(true);
      } else {
        clearStoredUser();
        resolve(false);
      }
    });
  });
}

export function requireAuth(redirectTo = "index.html?next=") {
  if (!isLoggedIn()) {
    const safeNext = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = redirectTo + safeNext;
    return false;
  }
  return true;
}

// ============================================================
// AUTHENTICATION OPERATIONS
// ============================================================

export async function login(email, password) {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const user = credential.user;

  const isAdmin = ["ayan@kruizly.com", "admin@kruizly.com", "carrentpedatabase@gmail.com"].includes((user.email || "").toLowerCase());
  const initialUser = {
    uid: user.uid,
    id: user.uid,
    email: user.email,
    name: user.displayName || "Driver",
    role: isAdmin ? "admin" : "customer"
  };
  setStoredUser(initialUser);

  // Sync with MySQL database on Hostinger
  try {
    const syncRes = await api.post("/users/sync", {
      email: user.email,
      name: user.displayName || ""
    }).catch(() => null);
    if (syncRes && syncRes.user) {
      setStoredUser(syncRes.user);
    }
  } catch (err) {
    console.warn("Backend user sync notice:", err);
  }

  initDynamicNav();
  updateIndexAuthView(user);
  return { success: true, user };
}

export async function register(email, password, name, phone = "") {
  if (!email || !password || !name) {
    throw new Error("Full name, email, and password are required.");
  }

  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = credential.user;

  try {
    await updateProfile(user, { displayName: name.trim() });
  } catch (_) {}

  const initialUser = {
    uid: user.uid,
    id: user.uid,
    email: user.email,
    name: name.trim(),
    role: "customer"
  };
  setStoredUser(initialUser);

  // Sync new user with MySQL database on Hostinger
  try {
    const syncRes = await api.post("/users/sync", {
      name: name.trim(),
      email: user.email,
      phone: phone ? phone.trim() : ""
    }).catch(() => null);
    if (syncRes && syncRes.user) {
      setStoredUser(syncRes.user);
    }
  } catch (err) {
    console.warn("Backend user sync notice:", err);
  }

  initDynamicNav();
  updateIndexAuthView(user);
  return { success: true, user };
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  const isAdmin = ["ayan@kruizly.com", "admin@kruizly.com", "carrentpedatabase@gmail.com"].includes((user.email || "").toLowerCase());
  const initialUser = {
    uid: user.uid,
    id: user.uid,
    email: user.email,
    name: user.displayName || "Google User",
    role: isAdmin ? "admin" : "customer"
  };
  setStoredUser(initialUser);

  // Sync Google user with MySQL database
  try {
    const syncRes = await api.post("/users/sync", {
      name: user.displayName || "Google User",
      email: user.email || "",
      phone: user.phoneNumber || ""
    }).catch(() => null);
    if (syncRes && syncRes.user) {
      setStoredUser(syncRes.user);
    }
  } catch (err) {
    console.warn("Backend Google sync notice:", err);
  }

  initDynamicNav();
  updateIndexAuthView(user);
  return { success: true, user };
}

export async function resetPassword(email) {
  if (!email) {
    throw new Error("Please enter your registered email address.");
  }
  await sendPasswordResetEmail(auth, email.trim());
  return { success: true, message: "Password reset link sent to your email." };
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (_) {}
  clearStoredUser();
  initDynamicNav();
  updateIndexAuthView(null);
  window.location.href = "index.html";
}

// ============================================================
// UI HELPERS & ERROR HANDLING
// ============================================================

export function friendlyAuthError(error) {
  const code = error?.code || "";
  const msg = error?.message || String(error || "");

  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Incorrect email or password. Please try again.";
  }
  if (code === "auth/email-already-in-use") {
    return "This email is already registered. Please log in instead.";
  }
  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }
  if (code === "auth/weak-password") {
    return "Password should be at least 6 characters long.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Google Sign-In popup was closed before finishing.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many unsuccessful attempts. Please try again later or reset your password.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error. Please check your internet connection.";
  }

  return msg || "An unexpected error occurred. Please try again.";
}

function setStatus(formOrEl, message, isError) {
  const el = formOrEl?.querySelector?.(".form-status") || (typeof formOrEl === "string" ? document.getElementById(formOrEl) : formOrEl);
  if (!el) return;

  el.textContent = message;
  el.style.display = message ? "block" : "none";
  el.style.color = isError ? "#ef476f" : "#06d6a0";

  if (isError) {
    el.classList.remove("success");
    el.classList.add("error");
  } else {
    el.classList.remove("error");
    el.classList.add("success");
  }
}

function wirePasswordToggles() {
  document.querySelectorAll(".password-box").forEach((box) => {
    const input = box.querySelector("input");
    const btn = box.querySelector(".toggle-password");
    if (!btn || !input) return;

    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Show password");
    btn.textContent = "show";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      btn.textContent = isHidden ? "hide" : "show";
      btn.setAttribute("aria-pressed", String(isHidden));
      btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
      input.focus({ preventScroll: true });
    });
  });
}

function getSafeNextUrl() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next) return "profile.html";
  if (/^https?:\/\//.test(next) || next.startsWith("//")) return "profile.html";
  return next;
}

export function updateIndexAuthView(user) {
  const guestView = document.getElementById("authGuestView");
  const userView = document.getElementById("authUserView");
  const userNameEl = document.getElementById("authUserName");

  if (!guestView || !userView) return;

  if (user) {
    guestView.hidden = true;
    userView.hidden = false;
    if (userNameEl) {
      const name = user.displayName || user.name || (user.email ? user.email.split("@")[0] : "Driver");
      userNameEl.textContent = name;
    }
  } else {
    guestView.hidden = false;
    userView.hidden = true;
  }
}

function formatToLocalDateTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}

function wireQuickBookingDates() {
  const pickupEl = document.getElementById("quickPickup");
  const dropEl = document.getElementById("quickDrop");
  if (!pickupEl || !dropEl) return;

  const now = new Date();
  const remainder = 30 - (now.getMinutes() % 30);
  const start = new Date(now.getTime() + remainder * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const minNow = formatToLocalDateTime(now);
  pickupEl.min = minNow;
  dropEl.min = minNow;

  if (!pickupEl.value) {
    pickupEl.value = formatToLocalDateTime(start);
  }
  if (!dropEl.value) {
    dropEl.value = formatToLocalDateTime(end);
  }
  dropEl.min = pickupEl.value;

  pickupEl.addEventListener("change", () => {
    if (pickupEl.value < pickupEl.min) {
      pickupEl.value = pickupEl.min;
    }
    dropEl.min = pickupEl.value;
    if (!dropEl.value || dropEl.value <= pickupEl.value) {
      const pDate = new Date(pickupEl.value);
      if (!isNaN(pDate.getTime())) {
        const dDate = new Date(pDate.getTime() + 24 * 60 * 60 * 1000);
        dropEl.value = formatToLocalDateTime(dDate);
      }
    }
  });

  dropEl.addEventListener("change", () => {
    if (dropEl.value <= pickupEl.value) {
      alert("Drop date and time must be after pickup date and time.");
      const pDate = new Date(pickupEl.value);
      if (!isNaN(pDate.getTime())) {
        const dDate = new Date(pDate.getTime() + 24 * 60 * 60 * 1000);
        dropEl.value = formatToLocalDateTime(dDate);
      }
    }
  });
}

// ============================================================
// FORM INITIALIZATION
// ============================================================

export function initAuthForms() {
  wirePasswordToggles();

  // 1. Google Sign-In Button
  const googleBtn = document.getElementById("googleLoginBtn") || document.getElementById("googleAuthBtn") || document.querySelector(".btn-google") || document.querySelector(".google-btn");
  const googleStatus = document.getElementById("googleAuthStatus");
  if (googleBtn) {
    googleBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (googleStatus) setStatus(googleStatus, "Connecting to Google...", false);
      googleBtn.disabled = true;

      try {
        await loginWithGoogle();
        if (googleStatus) setStatus(googleStatus, "Signed in successfully! Redirecting...", false);
        setTimeout(() => {
          window.location.href = getSafeNextUrl();
        }, 600);
      } catch (err) {
        console.error("Google Auth Error:", err);
        if (googleStatus) setStatus(googleStatus, friendlyAuthError(err), true);
      } finally {
        googleBtn.disabled = false;
      }
    });
  }

  // 2. Login Form
  const loginForm = document.getElementById("loginForm") || document.querySelector(".login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const emailInput = document.getElementById("loginEmail") || loginForm.querySelector('input[type="email"]') || loginForm.querySelector('[name="email"]');
      const passwordInput = document.getElementById("loginPassword") || loginForm.querySelector('input[type="password"]') || loginForm.querySelector('[name="password"]');

      const email = emailInput?.value?.trim();
      const password = passwordInput?.value;

      if (!email || !password) {
        setStatus(loginForm, "Email and password are required.", true);
        return;
      }

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Logging in...";
      }

      try {
        await login(email, password);
        setStatus(loginForm, "Login successful! Redirecting...", false);
        setTimeout(() => {
          window.location.href = getSafeNextUrl();
        }, 600);
      } catch (err) {
        console.error("Login Error:", err);
        setStatus(loginForm, friendlyAuthError(err), true);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Login";
        }
      }
    });
  }

  // 3. Sign Up Form
  const signupForm = document.getElementById("signupForm") || document.querySelector(".signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById("signupName") || signupForm.querySelector('[name="name"]') || signupForm.querySelector('input[type="text"]');
      const emailInput = document.getElementById("signupEmail") || signupForm.querySelector('[name="email"]') || signupForm.querySelector('input[type="email"]');
      const phoneInput = document.getElementById("signupPhone") || signupForm.querySelector('[name="phone"]') || signupForm.querySelector('input[type="tel"]');
      const passwordInput = document.getElementById("signupPassword") || signupForm.querySelector('[name="password"]') || signupForm.querySelector('input[type="password"]');
      const confirmInput = document.getElementById("confirmPassword") || signupForm.querySelector('[name="confirmPassword"]');

      const name = nameInput?.value?.trim();
      const email = emailInput?.value?.trim();
      const phone = phoneInput?.value?.trim() || "";
      const password = passwordInput?.value;
      const confirmPassword = confirmInput?.value;

      if (!name || !email || !password) {
        setStatus(signupForm, "Full name, email, and password are required.", true);
        return;
      }

      if (confirmInput && password !== confirmPassword) {
        setStatus(signupForm, "Passwords do not match.", true);
        return;
      }

      if (password.length < 6) {
        setStatus(signupForm, "Password must be at least 6 characters.", true);
        return;
      }

      const submitBtn = signupForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Creating Account...";
      }

      try {
        await register(email, password, name, phone);
        setStatus(signupForm, "Account created successfully! Redirecting...", false);
        setTimeout(() => {
          window.location.href = getSafeNextUrl();
        }, 600);
      } catch (err) {
        console.error("Signup Error:", err);
        setStatus(signupForm, friendlyAuthError(err), true);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Account";
        }
      }
    });
  }

  // 4. Quick Book & Sign Out on Index
  wireQuickBookingDates();

  const quickLogoutBtn = document.getElementById("quickLogoutBtn");
  if (quickLogoutBtn) {
    quickLogoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });
  }

  const quickBookBtn = document.getElementById("quickBookBtn");
  if (quickBookBtn) {
    quickBookBtn.addEventListener("click", () => {
      const p = document.getElementById("quickPickup")?.value;
      const d = document.getElementById("quickDrop")?.value;
      let url = "fleet.html";
      if (p && d) {
        url += `?pickup=${encodeURIComponent(p)}&drop=${encodeURIComponent(d)}`;
      }
      window.location.href = url;
    });
  }

  // 5. Forgot Password Link
  document.querySelectorAll(".forgot-password").forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById("loginEmail") || document.querySelector('input[type="email"]');
      const email = prompt("Enter your registered email address for password reset:", emailInput?.value || "");

      if (email === null) return;
      if (!email.trim()) {
        alert("Email address is required.");
        return;
      }

      try {
        await resetPassword(email.trim());
        alert(`Password reset link sent to ${email.trim()}. Check your inbox.`);
      } catch (err) {
        alert(friendlyAuthError(err));
      }
    });
  });

  // 6. Global Logout Handlers
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirm("Are you sure you want to log out?")) {
        logout();
      }
    });
  });
}

// Global Auth State Observer
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const isAdmin = ["ayan@kruizly.com", "admin@kruizly.com", "carrentpedatabase@gmail.com"].includes((user.email || "").toLowerCase());
    const initialUser = {
      uid: user.uid,
      id: user.uid,
      email: user.email,
      name: user.displayName || "Driver",
      role: isAdmin ? "admin" : "customer"
    };

    const existing = getStoredUser();
    if (!existing) {
      setStoredUser(initialUser);
    }

    try {
      const syncRes = await api.post("/users/sync", {
        name: user.displayName || "",
        email: user.email || ""
      }).catch(() => null);

      if (syncRes && syncRes.user) {
        setStoredUser(syncRes.user);
      }
    } catch (_) {}

    updateIndexAuthView(user);
  } else {
    clearStoredUser();
    updateIndexAuthView(null);
  }
  initDynamicNav();
});

// Auto-initialize when loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuthForms);
} else {
  initAuthForms();
}

export default {
  login,
  register,
  loginWithGoogle,
  resetPassword,
  logout,
  getCurrentUser,
  getStoredUser,
  setStoredUser,
  isLoggedIn,
  checkAuth,
  requireAuth,
  friendlyAuthError
};
