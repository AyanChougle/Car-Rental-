export const MEDIA_SERVER_URL = window.__KRUIZLY_API_URL__
  ? window.__KRUIZLY_API_URL__.replace(/\/api$/, "")
  : (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "https://kruizly.com"
      : window.location.origin);
