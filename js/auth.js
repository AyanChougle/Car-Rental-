/**
 * js/auth.js (UPDATED)
 * 
 * Authentication using JWT tokens via /api/auth endpoints.
 * NO Firebase dependency. Works with database-backed auth.
 */

import "./nav-helper.js";

// ============================================================
// TOKEN STORAGE & RETRIEVAL
// ============================================================

function getStoredTokens() {
  const stored = localStorage.getItem("kruizly_tokens");
  return stored ? JSON.parse(stored) : null;
}

function setStoredTokens(tokens) {
  localStorage.setItem("kruizly_tokens", JSON.stringify(tokens));
}

function clearStoredTokens() {
  localStorage.removeItem("kruizly_tokens");
  localStorage.removeItem("kruizly_user");
}

function getStoredUser() {
  const stored = localStorage.getItem("kruizly_user");
  return stored ? JSON.parse(stored) : null;
}

function setStoredUser(user) {
  localStorage.setItem("kruizly_user", JSON.stringify(user));
}

function getAccessToken() {
  const tokens = getStoredTokens();
  return tokens?.accessToken || null;
}

function getRefreshToken() {
  const tokens = getStoredTokens();
  return tokens?.refreshToken || null;
}

// ============================================================
// API CALLS
// ============================================================

async function apiCall(method, endpoint, body = null) {
  const url = `/api${endpoint}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const token = getAccessToken();
  if (token) {
    options.headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    throw error;
  }
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearStoredTokens();
    return false;
  }

  try {
    const data = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).then((r) => r.json());

    if (data.success && data.tokens?.accessToken) {
      const currentTokens = getStoredTokens();
      setStoredTokens({
        ...currentTokens,
        accessToken: data.tokens.accessToken,
      });
      return true;
    }

    clearStoredTokens();
    return false;
  } catch {
    clearStoredTokens();
    return false;
  }
}

// ============================================================
// AUTHENTICATION FUNCTIONS
// ============================================================

export async function register(email, password, name) {
  const data = await apiCall("POST", "/auth/register", {
    email,
    password,
    name,
  });

  if (data.success) {
    setStoredTokens(data.tokens);
    setStoredUser(data.user);
  }

  return data;
}

export async function login(email, password) {
  const data = await apiCall("POST", "/auth/login", {
    email,
    password,
  });

  if (data.success) {
    setStoredTokens(data.tokens);
    setStoredUser(data.user);
  }

  return data;
}

export async function logout() {
  try {
    await apiCall("POST", "/auth/logout");
  } catch {
    // Ignore errors, just clear local state
  }

  clearStoredTokens();
  window.location.href = "/";
}

export function getCurrentUser() {
  return getStoredUser();
}

export function isLoggedIn() {
  return !!getAccessToken() && !!getStoredUser();
}

export async function checkAuth() {
  if (!getAccessToken()) {
    return false;
  }

  try {
    // Try to call a protected endpoint to verify token
    const data = await apiCall("GET", "/auth/me");
    if (data.success) {
      setStoredUser(data.user);
      return true;
    }
  } catch {
    // Token might be expired, try refresh
    if (await refreshAccessToken()) {
      return checkAuth(); // Retry with new token
    }
  }

  clearStoredTokens();
  return false;
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
// UI HELPER FUNCTIONS
// ============================================================

function friendlyAuthError(error) {
  const map = {
    "Invalid email or password.": "Email or password is incorrect.",
    "Invalid email address.": "That email address doesn't look right.",
    "Password must be at least 6 characters.": "Password needs to be at least 6 characters.",
    "Email already registered. Try logging in instead.":
      "That email already has an account — try logging in instead.",
    "Your account has been disabled. Contact support.":
      "Your account has been disabled.",
    "Your account is suspended. Contact support.": "Your account is suspended.",
  };

  return (
    map[error?.message] ||
    error?.message ||
    error ||
    "Something went wrong. Please try again."
  );
}

function setStatus(form, message, isError) {
  const el = form?.querySelector(".form-status");
  if (!el) return;

  el.textContent = message;
  el.setAttribute("aria-live", "polite");

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

    btn.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        btn.click();
      }
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

// ============================================================
// FORM HANDLING
// ============================================================

export function initAuthForms() {
  wirePasswordToggles();

  // Signup form
  const signupForm = document.querySelector(".signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const nameInput = signupForm.querySelector('[name="name"]');
      const emailInput = signupForm.querySelector('[name="email"]');
      const passwordInput = signupForm.querySelector('[name="password"]');

      const name = nameInput?.value.trim();
      const email = emailInput?.value.trim();
      const password = passwordInput?.value;

      if (!name || !email || !password) {
        setStatus(signupForm, "All fields are required.", true);
        return;
      }

      try {
        const result = await register(email, password, name);
        if (result.success) {
          setStatus(signupForm, "Registration successful! Redirecting...", false);
          setTimeout(() => {
            window.location.href = getSafeNextUrl();
          }, 1500);
        } else {
          setStatus(signupForm, friendlyAuthError(result.error), true);
        }
      } catch (error) {
        setStatus(signupForm, friendlyAuthError(error), true);
      }
    });
  }

  // Login form
  const loginForm = document.querySelector(".login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const emailInput = loginForm.querySelector('[name="email"]');
      const passwordInput = loginForm.querySelector('[name="password"]');

      const email = emailInput?.value.trim();
      const password = passwordInput?.value;

      if (!email || !password) {
        setStatus(loginForm, "Email and password are required.", true);
        return;
      }

      try {
        const result = await login(email, password);
        if (result.success) {
          setStatus(loginForm, "Login successful! Redirecting...", false);
          setTimeout(() => {
            window.location.href = getSafeNextUrl();
          }, 1500);
        } else {
          setStatus(loginForm, friendlyAuthError(result.error), true);
        }
      } catch (error) {
        setStatus(loginForm, friendlyAuthError(error), true);
      }
    });
  }

  // Logout button
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirm("Are you sure you want to log out?")) {
        logout();
      }
    });
  });

  // Guard protected pages
  const isProtectedPage = document.body.classList.contains("protected");
  if (isProtectedPage && !isLoggedIn()) {
    const nextUrl = encodeURIComponent(window.location.href);
    window.location.href = `index.html?next=${nextUrl}`;
  }
}

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuthForms);
} else {
  initAuthForms();
}

export default {
  register,
  login,
  logout,
  getCurrentUser,
  isLoggedIn,
  checkAuth,
  requireAuth,
  getAccessToken,
  refreshAccessToken,
};
