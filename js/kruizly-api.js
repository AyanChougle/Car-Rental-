/**
 * js/kruizly-api.js
 * 
 * Unified HTTP API client for KRUIZLY backend.
 * Automatically attaches Firebase Auth ID tokens and manages standard response handling.
 */

export const API_BASE_URL = window.__KRUIZLY_API_URL__ || `${window.location.origin}/api`;

async function getAuthHeader() {
  const tokens = localStorage.getItem("kruizly_tokens");
  if (tokens) {
    try {
      const parsed = JSON.parse(tokens);
      if (parsed.accessToken) {
        return { Authorization: `Bearer ${parsed.accessToken}` };
      }
    } catch (_) {}
  }
  return {};
}

export const api = {
  async get(endpoint, params = {}) {
    const authHeaders = await getAuthHeader();
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = new URL(`${API_BASE_URL}${cleanEndpoint}`, window.location.origin);

    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") {
        url.searchParams.append(key, val);
      }
    });

    const response = await fetch(url.toString(), {
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

  async post(endpoint, body = {}) {
    const authHeaders = await getAuthHeader();
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    const response = await fetch(`${API_BASE_URL}${cleanEndpoint}`, {
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

  async put(endpoint, body = {}) {
    const authHeaders = await getAuthHeader();
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    const response = await fetch(`${API_BASE_URL}${cleanEndpoint}`, {
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

  async delete(endpoint) {
    const authHeaders = await getAuthHeader();
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    const response = await fetch(`${API_BASE_URL}${cleanEndpoint}`, {
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

  async upload(endpoint, formData) {
    const authHeaders = await getAuthHeader();
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    const response = await fetch(`${API_BASE_URL}${cleanEndpoint}`, {
      method: "POST",
      headers: {
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
