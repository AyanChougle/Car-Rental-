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

  // Separate any query string embedded in endpoint
  if (clean.includes("?")) {
    const [pathPart, qs] = clean.split("?", 2);
    clean = pathPart;
    const searchParams = new URLSearchParams(qs);
    for (const [k, v] of searchParams.entries()) {
      queryParams[k] = v;
    }
  }

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

  // /verification/user/:uid/status
  const verUserStatusMatch = clean.match(/^verification\/user\/([^/]+)\/status$/);
  if (verUserStatusMatch) {
    queryParams.uid = verUserStatusMatch[1];
    return { path: "/verification/user-status.php", params: queryParams };
  }

  // /users/:uid/role
  const userRoleMatch = clean.match(/^users\/([^/]+)\/role$/);
  if (userRoleMatch) {
    queryParams.uid = userRoleMatch[1];
    return { path: "/users/role.php", params: queryParams };
  }

  // /users/partner-cars/:id/status
  const partnerCarStatusMatch = clean.match(/^users\/partner-cars\/([^/]+)\/status$/);
  if (partnerCarStatusMatch) {
    queryParams.id = partnerCarStatusMatch[1];
    return { path: "/users/partner-cars.php", params: queryParams };
  }

  // /users/partner-cars/:id
  const partnerCarDetailMatch = clean.match(/^users\/partner-cars\/([^/]+)$/);
  if (partnerCarDetailMatch) {
    queryParams.id = partnerCarDetailMatch[1];
    return { path: "/users/partner-cars.php", params: queryParams };
  }

  // /media/:id
  const mediaDeleteMatch = clean.match(/^media\/([^/]+)$/);
  if (mediaDeleteMatch && !["upload", "my-media", "file", "delete"].includes(mediaDeleteMatch[1])) {
    queryParams.id = mediaDeleteMatch[1];
    return { path: "/media/delete.php", params: queryParams };
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
    "invoices/update": "/invoices/update.php",
    "invoices/pdf": "/invoices/pdf.php",
    "invoices/send": "/invoices/send.php",
    "admin/export": "/admin/export.php",
    "admin/stats": "/admin/stats.php"
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

async function getAuthToken(forceRefresh = false) {
  let token = "";
  if (auth?.currentUser) {
    try {
      token = await auth.currentUser.getIdToken(forceRefresh);
    } catch (err) {
      console.warn("Could not get Firebase ID token:", err);
    }
  }

  if (!token) {
    // Check if token was saved locally
    token = localStorage.getItem("kruizly_token") || sessionStorage.getItem("kruizly_token") || "";
  }

  if (!token && auth) {
    // Wait up to 1000ms for Firebase Auth hydration
    token = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(""), 1000);
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        clearTimeout(timeout);
        unsubscribe();
        if (user) {
          try {
            const t = await user.getIdToken(forceRefresh);
            resolve(t || "");
          } catch {
            resolve("");
          }
        } else {
          resolve("");
        }
      });
    });
  }

  return token || "";
}

async function getAuthHeader(forceRefresh = false) {
  const token = await getAuthToken(forceRefresh);
  if (token) {
    return {
      token,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Authorization": `Bearer ${token}`,
        "X-Firebase-Token": token
      }
    };
  }
  return { token: "", headers: {} };
}

function buildUrl(resolved, token = "") {
  const url = new URL(`${API_BASE_URL}${resolved.path}`, window.location.origin);
  Object.entries(resolved.params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      url.searchParams.append(key, val);
    }
  });
  if (token && !url.searchParams.has("token")) {
    url.searchParams.append("token", token);
  }
  return url.toString();
}

export const api = {
  async get(endpoint, params = {}, retry = true) {
    const { token, headers: authHeaders } = await getAuthHeader();
    const resolved = resolveEndpoint(endpoint, params);
    const url = buildUrl(resolved, token);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...authHeaders
      }
    });

    if (response.status === 401 && retry && auth?.currentUser) {
      const { token: freshToken, headers: freshHeaders } = await getAuthHeader(true);
      if (freshToken) {
        const retryUrl = buildUrl(resolveEndpoint(endpoint, params), freshToken);
        const retryRes = await fetch(retryUrl, {
          method: "GET",
          headers: { Accept: "application/json", ...freshHeaders }
        });
        const retryData = await retryRes.json().catch(() => ({}));
        if (!retryRes.ok) {
          throw new Error(retryData.error || retryData.message || `Request failed with status ${retryRes.status}`);
        }
        return retryData;
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }
    return data;
  },

  async post(endpoint, body = {}, params = {}, retry = true) {
    const { token, headers: authHeaders } = await getAuthHeader();
    const resolved = resolveEndpoint(endpoint, params);
    const url = buildUrl(resolved, token);

    const payload = typeof body === "object" && body !== null ? { ...body } : body;
    if (token && typeof payload === "object" && !payload.idToken && !payload.token) {
      payload.idToken = token;
      payload.token = token;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401 && retry && auth?.currentUser) {
      const { token: freshToken, headers: freshHeaders } = await getAuthHeader(true);
      if (freshToken) {
        const retryUrl = buildUrl(resolveEndpoint(endpoint, params), freshToken);
        if (typeof payload === "object") {
          payload.idToken = freshToken;
          payload.token = freshToken;
        }
        const retryRes = await fetch(retryUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", ...freshHeaders },
          body: JSON.stringify(payload)
        });
        const retryData = await retryRes.json().catch(() => ({}));
        if (!retryRes.ok) {
          throw new Error(retryData.error || retryData.message || `Request failed with status ${retryRes.status}`);
        }
        return retryData;
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }
    return data;
  },

  async put(endpoint, body = {}, params = {}, retry = true) {
    const { token, headers: authHeaders } = await getAuthHeader();
    const resolved = resolveEndpoint(endpoint, params);
    const url = buildUrl(resolved, token);

    const payload = typeof body === "object" && body !== null ? { ...body } : body;
    if (token && typeof payload === "object" && !payload.idToken && !payload.token) {
      payload.idToken = token;
      payload.token = token;
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401 && retry && auth?.currentUser) {
      const { token: freshToken, headers: freshHeaders } = await getAuthHeader(true);
      if (freshToken) {
        const retryUrl = buildUrl(resolveEndpoint(endpoint, params), freshToken);
        if (typeof payload === "object") {
          payload.idToken = freshToken;
          payload.token = freshToken;
        }
        const retryRes = await fetch(retryUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json", ...freshHeaders },
          body: JSON.stringify(payload)
        });
        const retryData = await retryRes.json().catch(() => ({}));
        if (!retryRes.ok) {
          throw new Error(retryData.error || retryData.message || `Request failed with status ${retryRes.status}`);
        }
        return retryData;
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }
    return data;
  },

  async delete(endpoint, params = {}, retry = true) {
    const { token, headers: authHeaders } = await getAuthHeader();
    const resolved = resolveEndpoint(endpoint, params);
    const url = buildUrl(resolved, token);

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        ...authHeaders
      }
    });

    if (response.status === 401 && retry && auth?.currentUser) {
      const { token: freshToken, headers: freshHeaders } = await getAuthHeader(true);
      if (freshToken) {
        const retryUrl = buildUrl(resolveEndpoint(endpoint, params), freshToken);
        const retryRes = await fetch(retryUrl, {
          method: "DELETE",
          headers: { Accept: "application/json", ...freshHeaders }
        });
        const retryData = await retryRes.json().catch(() => ({}));
        if (!retryRes.ok) {
          throw new Error(retryData.error || retryData.message || `Request failed with status ${retryRes.status}`);
        }
        return retryData;
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }
    return data;
  },

  async upload(endpoint, formData, params = {}, retry = true) {
    const { token, headers: authHeaders } = await getAuthHeader();
    const resolved = resolveEndpoint(endpoint, params);
    const url = buildUrl(resolved, token);

    if (token && formData instanceof FormData && !formData.has("token") && !formData.has("idToken")) {
      formData.append("token", token);
      formData.append("idToken", token);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...authHeaders
      },
      body: formData
    });

    if (response.status === 401 && retry && auth?.currentUser) {
      const { token: freshToken, headers: freshHeaders } = await getAuthHeader(true);
      if (freshToken) {
        const retryUrl = buildUrl(resolveEndpoint(endpoint, params), freshToken);
        if (formData instanceof FormData) {
          formData.set("token", freshToken);
          formData.set("idToken", freshToken);
        }
        const retryRes = await fetch(retryUrl, {
          method: "POST",
          headers: { Accept: "application/json", ...freshHeaders },
          body: formData
        });
        const retryData = await retryRes.json().catch(() => ({}));
        if (!retryRes.ok) {
          throw new Error(retryData.error || retryData.message || `Upload failed with status ${retryRes.status}`);
        }
        return retryData;
      }
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Upload failed with status ${response.status}`);
    }
    return data;
  }
};

export default api;
