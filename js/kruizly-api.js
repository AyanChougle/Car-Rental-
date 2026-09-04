/**
 * js/kruizly-api.js
 * 
 * Unified HTTP API client for KRUIZLY backend.
 * Maps clean REST paths to Hostinger PHP scripts, attaches Firebase Auth ID tokens,
 * and handles development / production environments smoothly.
 */

import { auth } from "./firebase-init.js";

// Determine API Base URL:
// 1. window.__KRUIZLY_API_URL__ if explicitly defined
// 2. localStorage.getItem("kruizly_api_url") if overridden
// 3. Same-origin /api
export const API_BASE_URL = 
  window.__KRUIZLY_API_URL__ || 
  localStorage.getItem("kruizly_api_url") || 
  `${window.location.origin}/api`;

/**
 * Resolves a logical REST endpoint to the actual PHP file and extracts path parameters
 * Example: "/users/me" -> { path: "/users/me.php", params: {} }
 * Example: "/payments/123/verify" -> { path: "/payments/verify.php", params: { id: "123" } }
 * Example: "/bookings/BK-456" -> { path: "/bookings/detail.php", params: { id: "BK-456" } }
 */
export function resolveEndpoint(endpoint, params = {}) {
  let clean = endpoint.trim();
  if (clean.startsWith("/")) clean = clean.substring(1);
  if (clean.endsWith("/")) clean = clean.substring(0, clean.length - 1);

  const queryParams = { ...params };

  // Already a .php endpoint
  if (clean.endsWith(".php")) {
    return { path: `/${clean}`, params: queryParams };
  }

  // Handle parameterized routes
  // /payments/:id/verify
  const paymentVerifyMatch = clean.match(/^payments\/([^/]+)\/verify$/);
  if (paymentVerifyMatch) {
    queryParams.id = paymentVerifyMatch[1];
    return { path: "/payments/verify.php", params: queryParams };
  }

  // /bookings/:id (GET or PUT)
  const bookingDetailMatch = clean.match(/^bookings\/([^/]+)$/);
  if (bookingDetailMatch && bookingDetailMatch[1] !== "index" && bookingDetailMatch[1] !== "my-bookings" && bookingDetailMatch[1] !== "create" && bookingDetailMatch[1] !== "cancel") {
    queryParams.id = bookingDetailMatch[1];
    return { path: "/bookings/detail.php", params: queryParams };
  }

  // /vehicles/:id
  const vehicleDetailMatch = clean.match(/^vehicles\/([^/]+)$/);
  if (vehicleDetailMatch && vehicleDetailMatch[1] !== "index") {
    queryParams.id = vehicleDetailMatch[1];
    return { path: "/vehicles/detail.php", params: queryParams };
  }

  // /coupons/:code
  const couponDetailMatch = clean.match(/^coupons\/([^/]+)$/);
  if (couponDetailMatch && couponDetailMatch[1] !== "index" && couponDetailMatch[1] !== "validate") {
    queryParams.code = couponDetailMatch[1];
    return { path: "/coupons/detail.php", params: queryParams };
  }

  // Route map for standard endpoints
  const routeMap = {
    "health": "/health.php",
    "users/me": "/users/me.php",
    "users/sync": "/users/sync.php",
    "users/partner-cars": "/users/partner-cars.php",
    "users/role": "/users/role.php",
    "users": "/users/index.php",
    "bookings/my-bookings": "/bookings/my-bookings.php",
    "bookings/create": "/bookings/create.php",
    "bookings/cancel": "/bookings/cancel.php",
    "bookings/detail": "/bookings/detail.php",
    "bookings": "/bookings/index.php",
    "vehicles/detail": "/vehicles/detail.php",
    "vehicles": "/vehicles/index.php",
    "payments/submit": "/payments/submit.php",
    "payments/verify": "/payments/verify.php",
    "payments": "/payments/index.php",
    "coupons/validate": "/coupons/validate.php",
    "coupons/detail": "/coupons/detail.php",
    "coupons": "/coupons/index.php",
    "verification/submit": "/verification/submit.php",
    "verification/me": "/verification/me.php",
    "verification/user-status": "/verification/user-status.php",
    "verification": "/verification/index.php",
    "media/upload": "/media/upload.php",
    "media/my-media": "/media/my-media.php",
    "media/file": "/media/file.php",
    "media/delete": "/media/delete.php",
    "invoices/get": "/invoices/get.php",
    "invoices/pdf": "/invoices/pdf.php",
    "invoices/send": "/invoices/send.php",
    "admin/export": "/admin/export.php"
  };

  if (routeMap[clean]) {
    return { path: routeMap[clean], params: queryParams };
  }

  // Default: if it's a directory or module, check if it has a slash
  if (clean.includes("/")) {
    return { path: `/${clean}.php`, params: queryParams };
  }

  return { path: `/${clean}/index.php`, params: queryParams };
}

async function getAuthHeader() {
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    } catch (err) {
      console.warn("Could not get Firebase ID token:", err);
    }
  }

  // If currentUser is not yet loaded, wait up to 600ms for Firebase Auth hydration
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({}), 600);
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      clearTimeout(timeout);
      unsubscribe();
      if (user) {
        try {
          const token = await user.getIdToken();
          resolve(token ? { Authorization: `Bearer ${token}` } : {});
        } catch {
          resolve({});
        }
      } else {
        resolve({});
      }
    });
  });
}

function buildUrl(resolved) {
  const url = new URL(`${API_BASE_URL}${resolved.path}`, window.location.origin);
  Object.entries(resolved.params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      url.searchParams.append(key, val);
    }
  });
  return url.toString();
}

export const api = {
  async get(endpoint, params = {}) {
    const authHeaders = await getAuthHeader();
    const resolved = resolveEndpoint(endpoint, params);
    const url = buildUrl(resolved);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...authHeaders
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }
    return data;
  },

  async post(endpoint, body = {}, params = {}) {
    const authHeaders = await getAuthHeader();
    const resolved = resolveEndpoint(endpoint, params);
    const url = buildUrl(resolved);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }
    return data;
  },

  async put(endpoint, body = {}, params = {}) {
    const authHeaders = await getAuthHeader();
    const resolved = resolveEndpoint(endpoint, params);
    const url = buildUrl(resolved);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }
    return data;
  },

  async delete(endpoint, params = {}) {
    const authHeaders = await getAuthHeader();
    const resolved = resolveEndpoint(endpoint, params);
    const url = buildUrl(resolved);

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        ...authHeaders
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }
    return data;
  },

  async upload(endpoint, formData, params = {}) {
    const authHeaders = await getAuthHeader();
    const resolved = resolveEndpoint(endpoint, params);
    const url = buildUrl(resolved);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...authHeaders
      },
      body: formData
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Upload failed with status ${response.status}`);
    }
    return data;
  }
};

export default api;
