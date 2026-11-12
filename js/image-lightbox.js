/**
 * KRUIZLY Shared Media Preview & Lightbox Utilities
 * Handles authenticated protected media fetching (using same-origin blob: URLs
 * so X-Frame-Options: SAMEORIGIN never blocks PDF/image previews), format
 * detection across all supported image & document extensions, SVG fallback
 * badges, and the full-screen interactive image/PDF lightbox.
 */

import { auth } from "./firebase-init.js";
import { MEDIA_SERVER_URL } from "./media-config.js";

export const ALLOWED_MEDIA_IMAGE_EXTENSIONS = Object.freeze([
  "jpg",
  "jpeg",
  "jpe",
  "jfif",
  "jfi",
  "png",
  "gif",
  "webp",
  "avif",
  "avis",
  "bmp",
  "dib",
  "tif",
  "tiff",
  "svg",
  "heic",
  "heif",
  "hif",
  "hvic",
  "ico",
]);

export const ALLOWED_MEDIA_DOC_EXTENSIONS = Object.freeze([
  "pdf",
  "doc",
  "docx",
  "zip",
  "7z",
  "rar",
]);

const INLINE_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "jpe",
  "jfif",
  "jfi",
  "png",
  "gif",
  "webp",
  "avif",
  "avis",
  "bmp",
  "dib",
  "svg",
  "ico",
]);

const INLINE_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Extract lowercase file extension (without leading dot) from a filename or URL.
 * Checks both the path and common query parameters like `ext` or `id`.
 */
export function extractFileExtension(fileOrUrl = "") {
  const raw = String(fileOrUrl || "").trim();
  if (!raw) return "";

  const extParamMatch = raw.match(/[?&]ext=\.?([a-z0-9]+)/i);
  if (extParamMatch && extParamMatch[1]) {
    return extParamMatch[1].toLowerCase();
  }

  const idParamMatch = raw.match(/[?&]id=([^&]+)/i);
  if (idParamMatch && idParamMatch[1]) {
    try {
      const decodedId = decodeURIComponent(idParamMatch[1]);
      const idExtMatch = decodedId.match(/\.([a-z0-9]{1,8})(?:[?#].*)?$/i);
      if (idExtMatch && idExtMatch[1]) {
        return idExtMatch[1].toLowerCase();
      }
    } catch {
      // Ignore malformed encoding
    }
  }

  const clean = raw.split("#")[0].split("?")[0];
  const dotMatch = clean.match(/\.([a-z0-9]{1,8})$/i);
  return dotMatch && dotMatch[1] ? dotMatch[1].toLowerCase() : "";
}

/**
 * Validate whether a File object or filename uses a supported image/document extension.
 */
export function isAllowedMediaFile(fileOrName, includeDocs = true) {
  const name =
    typeof fileOrName === "string"
      ? fileOrName
      : fileOrName?.name || fileOrName?.filename || "";
  const mime =
    typeof fileOrName === "object" && fileOrName?.type
      ? String(fileOrName.type).toLowerCase()
      : "";

  const ext = extractFileExtension(name);
  if (ext) {
    if (ALLOWED_MEDIA_IMAGE_EXTENSIONS.includes(ext)) return true;
    if (includeDocs && ALLOWED_MEDIA_DOC_EXTENSIONS.includes(ext)) return true;
    return false;
  }

  if (mime.startsWith("image/")) return true;
  if (includeDocs && mime === "application/pdf") return true;
  return false;
}

/**
 * Determine if a URL, filename, or MIME type refers to a PDF document.
 */
export function isPdfDocument(urlOrName = "", mimeType = "") {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("application/pdf")) return true;

  const raw = String(urlOrName || "").toLowerCase();
  if (!raw) return false;
  if (raw.startsWith("data:application/pdf")) return true;

  return extractFileExtension(raw) === "pdf";
}

/**
 * Determine whether a MIME type (and optional filename/URL) can render directly inside <img>.
 * Excludes HEIC/HEIF/TIFF/DOC/PDF/JSON/HTML/SVG error placeholders.
 */
export function isBrowserRenderableImageMime(mimeType = "", urlOrName = "") {
  const mime = String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (mime) {
    if (mime === "application/pdf") return false;
    if (
      mime.includes("heic") ||
      mime.includes("heif") ||
      mime.includes("tiff")
    ) {
      return false;
    }
    if (INLINE_IMAGE_MIMES.has(mime)) return true;
    if (mime.startsWith("image/")) {
      const ext = extractFileExtension(urlOrName);
      if (ext && ["heic", "heif", "hif", "hvic", "tif", "tiff"].includes(ext)) {
        return false;
      }
      return true;
    }
    return false;
  }

  const ext = extractFileExtension(urlOrName);
  return ext ? INLINE_IMAGE_EXTENSIONS.has(ext) : false;
}

/**
 * Safely revoke a blob: object URL if applicable.
 */
export function revokeObjectUrlSafely(url) {
  if (typeof url === "string" && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore cleanup failures
    }
  }
}

/**
 * Generate a crisp data-URI SVG badge for PDF, HEIC, TIFF, or generic document thumbnails.
 */
export function createDocPreviewSvg(label = "PDF", subtitle = "Document File") {
  const safeLabel = String(label || "DOC")
    .toUpperCase()
    .slice(0, 8)
    .replace(/[<>&"']/g, "");
  const safeSub = String(subtitle || "Preview Ready")
    .slice(0, 28)
    .replace(/[<>&"']/g, "");

  const isPdf = safeLabel === "PDF";
  const accent = isPdf ? "#ef4444" : "#38bdf8";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="190" viewBox="0 0 320 190">
    <rect width="320" height="190" rx="14" fill="#0b1322"/>
    <rect x="6" y="6" width="308" height="178" rx="11" fill="none" stroke="rgba(56,189,248,0.28)" stroke-width="1.5"/>
    <rect x="122" y="28" width="76" height="42" rx="10" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-width="1.5"/>
    <text x="160" y="55" text-anchor="middle" fill="${accent}" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="800">${safeLabel}</text>
    <text x="160" y="106" text-anchor="middle" fill="#e2e8f0" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700">${safeSub}</text>
    <text x="160" y="136" text-anchor="middle" fill="#94a3b8" font-family="Inter,Arial,sans-serif" font-size="12">Click to inspect or download</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Normalize a media ID, relative API path, or full URL into a fetchable URL.
 */
export function resolveMediaUrl(source = "", options = {}) {
  const raw = String(source || "").trim();
  if (!raw) return "";

  if (/^(blob:|data:|https?:\/\/)/i.test(raw)) {
    return raw;
  }

  const base = String(options.baseUrl || MEDIA_SERVER_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (raw.startsWith("/")) {
    return base ? `${base}${raw}` : raw;
  }

  if (raw.startsWith("api/")) {
    return base ? `${base}/${raw}` : `/${raw}`;
  }

  // Raw media ID (e.g., MED-xxx or storage relative path)
  const cleanId = encodeURIComponent(raw);
  const extHint = options.ext ? `&ext=.${String(options.ext).replace(/^\./, "")}` : "";
  return base
    ? `${base}/api/media/file.php?id=${cleanId}${extHint}`
    : `/api/media/file.php?id=${cleanId}${extHint}`;
}

async function getActiveAuthToken() {
  try {
    if (auth && auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
  } catch {
    // Ignore Firebase token retrieval errors
  }
  return "";
}

function isProtectedPlaceholderSvg(text = "") {
  return (
    text.includes("KRUIZLY Protected Storage") ||
    text.includes("Document Preview") && text.includes("Ref:")
  );
}

/**
 * Fetch protected or public media via authenticated fetch() and return a same-origin blob: URL
 * plus resolved format flags so images, PDFs (via <iframe>), and non-inline formats
 * (HEIC, TIFF, DOCX) can preview reliably across localhost & production origins.
 *
 * Returns:
 * {
 *   url: string,           // Same-origin blob: URL or data: URL
 *   originalUrl: string,   // Resolved source URL
 *   mimeType: string,      // Normalized MIME type
 *   ext: string,           // Lowercase extension hint
 *   isBlob: boolean,
 *   isPdf: boolean,
 *   isImage: boolean,      // True only when browser <img> can render the payload directly
 *   isNonInline: boolean,  // True for HEIC/TIFF/DOCX/ZIP etc.
 *   isPlaceholder: boolean // True when backend returned protected-storage placeholder SVG
 * }
 */
export async function fetchProtectedMediaPreview(source, options = {}) {
  const resolvedUrl = resolveMediaUrl(source, options);
  if (!resolvedUrl) {
    throw new Error("No media URL or ID provided.");
  }

  if (/^(blob:|data:)/i.test(resolvedUrl)) {
    const ext = extractFileExtension(options.filename || resolvedUrl);
    const isPdf = isPdfDocument(resolvedUrl, options.mimeType);
    const isImage = !isPdf && isBrowserRenderableImageMime(options.mimeType, options.filename || resolvedUrl);
    return {
      url: resolvedUrl,
      originalUrl: resolvedUrl,
      mimeType: options.mimeType || (isPdf ? "application/pdf" : ""),
      ext,
      isBlob: resolvedUrl.startsWith("blob:"),
      isPdf,
      isImage,
      isNonInline: !isPdf && !isImage,
      isPlaceholder: false,
    };
  }

  const token = options.token || (await getActiveAuthToken());
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["X-Firebase-Token"] = token;
  }

  const response = await fetch(resolvedUrl, {
    method: "GET",
    headers,
    credentials: options.credentials || "same-origin",
  });

  if (!response.ok) {
    let errDetail = `Media server returned HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.error || parsed?.message) {
            errDetail = parsed.error || parsed.message;
          }
        } catch {
          // Non-JSON error body
        }
      }
    } catch {
      // Ignore body read error
    }
    throw new Error(errDetail);
  }

  const rawContentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  // Reject accidental JSON/HTML error pages served with 200 OK
  if (
    rawContentType === "application/json" ||
    rawContentType === "text/html" ||
    rawContentType === "application/xhtml+xml"
  ) {
    const bodyText = await response.text();
    let msg = "Invalid media response received from server.";
    try {
      const parsed = JSON.parse(bodyText);
      msg = parsed?.error || parsed?.message || msg;
    } catch {
      // Leave default message
    }
    throw new Error(msg);
  }

  const blob = await response.blob();
  const mimeType = (blob.type || rawContentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const ext = extractFileExtension(options.filename || resolvedUrl);

  let isPlaceholder = false;
  if (mimeType === "image/svg+xml") {
    try {
      const svgText = await blob.text();
      if (isProtectedPlaceholderSvg(svgText)) {
        isPlaceholder = true;
      }
    } catch {
      // Ignore SVG text inspection failure
    }
  }

  const isPdf = !isPlaceholder && isPdfDocument(options.filename || resolvedUrl, mimeType);
  const isImage =
    !isPdf &&
    !isPlaceholder &&
    isBrowserRenderableImageMime(mimeType, options.filename || resolvedUrl);
  const isNonInline = !isPdf && !isImage && !isPlaceholder;

  const objectUrl = URL.createObjectURL(blob);

  return {
    url: objectUrl,
    originalUrl: resolvedUrl,
    mimeType,
    ext,
    isBlob: true,
    isPdf,
    isImage,
    isNonInline,
    isPlaceholder,
  };
}

// ==========================================
// GLOBAL INTERACTIVE LIGHTBOX (IMAGES + PDF)
// ==========================================

let lightboxEl = null;
let lightboxState = {
  zoom: 1,
  rotation: 0,
  src: "",
  title: "",
  subtitle: "",
  isPdf: false,
  isNonInline: false,
  objectUrlToRevoke: "",
};

function ensureLightboxDom() {
  if (lightboxEl && document.body.contains(lightboxEl)) {
    return lightboxEl;
  }

  const wrapper = document.createElement("div");
  wrapper.id = "kruizlyGlobalLightbox";
  wrapper.setAttribute("role", "dialog");
  wrapper.setAttribute("aria-modal", "true");
  wrapper.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:99999",
    "display:none",
    "flex-direction:column",
    "background:rgba(4,8,16,0.94)",
    "backdrop-filter:blur(10px)",
    "color:#e2e8f0",
    "font-family:Inter,system-ui,-apple-system,sans-serif",
  ].join(";");

  wrapper.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,0.1);background:rgba(10,16,28,0.85);">
      <div style="min-width:0;">
        <div id="klbTitle" style="font-size:15px;font-weight:700;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Document Viewer</div>
        <div id="klbSubtitle" style="font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <button type="button" id="klbZoomOut" title="Zoom out" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);color:#e2e8f0;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">− Zoom</button>
        <button type="button" id="klbZoomIn" title="Zoom in" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);color:#e2e8f0;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">+ Zoom</button>
        <button type="button" id="klbRotate" title="Rotate 90°" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);color:#e2e8f0;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">↻ Rotate</button>
        <a id="klbDownload" download style="background:rgba(56,189,248,0.16);border:1px solid rgba(56,189,248,0.4);color:#38bdf8;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;">⬇ Download</a>
        <a id="klbOpenTab" target="_blank" rel="noopener noreferrer" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);color:#e2e8f0;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;">↗ Open Tab</a>
        <button type="button" id="klbClose" title="Close (ESC)" style="background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;padding:6px 12px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">✕</button>
      </div>
    </div>
    <div id="klbStage" style="flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:18px;position:relative;"></div>
    <div style="padding:8px 16px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid rgba(255,255,255,0.08);background:rgba(10,16,28,0.85);">
      Document Viewer · Supports PDF &amp; all Image Formats · Click Download or Open Tab if needed · Press ESC to close
    </div>
  `;

  document.body.appendChild(wrapper);
  lightboxEl = wrapper;

  const updateImageTransform = () => {
    const img = wrapper.querySelector("#klbImage");
    if (!img) return;
    img.style.transform = `scale(${lightboxState.zoom}) rotate(${lightboxState.rotation}deg)`;
  };

  wrapper.querySelector("#klbZoomIn").addEventListener("click", () => {
    lightboxState.zoom = Math.min(4, Number((lightboxState.zoom + 0.25).toFixed(2)));
    updateImageTransform();
  });

  wrapper.querySelector("#klbZoomOut").addEventListener("click", () => {
    lightboxState.zoom = Math.max(0.4, Number((lightboxState.zoom - 0.25).toFixed(2)));
    updateImageTransform();
  });

  wrapper.querySelector("#klbRotate").addEventListener("click", () => {
    lightboxState.rotation = (lightboxState.rotation + 90) % 360;
    updateImageTransform();
  });

  wrapper.querySelector("#klbClose").addEventListener("click", closeImageLightbox);
  wrapper.addEventListener("click", (ev) => {
    if (ev.target === wrapper || ev.target.id === "klbStage") {
      closeImageLightbox();
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && wrapper.style.display === "flex") {
      closeImageLightbox();
    }
  });

  return wrapper;
}

export function closeImageLightbox() {
  if (!lightboxEl) return;
  lightboxEl.style.display = "none";
  const stage = lightboxEl.querySelector("#klbStage");
  if (stage) stage.innerHTML = "";
  if (lightboxState.objectUrlToRevoke) {
    revokeObjectUrlSafely(lightboxState.objectUrlToRevoke);
    lightboxState.objectUrlToRevoke = "";
  }
}

function renderNonInlineOrErrorCard(stage, title, message, downloadHref, badgeLabel = "DOC") {
  stage.innerHTML = `
    <div style="max-width:460px;width:100%;background:#0b1322;border:1px solid rgba(56,189,248,0.28);border-radius:14px;padding:28px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.45);">
      <div style="display:inline-flex;align-items:center;justify-content:center;padding:8px 18px;border-radius:999px;background:rgba(56,189,248,0.14);border:1px solid rgba(56,189,248,0.35);color:#38bdf8;font-weight:800;font-size:13px;letter-spacing:0.06em;margin-bottom:14px;">${escapeHtml(badgeLabel)}</div>
      <div style="font-size:16px;font-weight:700;color:#f8fafc;margin-bottom:8px;">${escapeHtml(title)}</div>
      <div style="font-size:13px;color:#94a3b8;line-height:1.5;margin-bottom:18px;">${escapeHtml(message)}</div>
      ${
        downloadHref
          ? `<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
              <a href="${escapeHtml(downloadHref)}" download style="background:#38bdf8;color:#06121f;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">⬇ Download File</a>
              <a href="${escapeHtml(downloadHref)}" target="_blank" rel="noopener noreferrer" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#e2e8f0;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">↗ Open in New Tab</a>
            </div>`
          : ""
      }
    </div>
  `;
}

/**
 * Open any image, PDF, or media file in the global KRUIZLY lightbox.
 * Protected URLs & PDFs are fetched via fetchProtectedMediaPreview() into a
 * same-origin blob: URL so Bearer tokens work and X-Frame-Options: SAMEORIGIN
 * never produces a blank white frame.
 */
export async function openImageLightbox(
  srcOrConfig,
  title = "Document Viewer",
  subtitle = ""
) {
  const cfg =
    typeof srcOrConfig === "object" && srcOrConfig !== null
      ? srcOrConfig
      : { src: srcOrConfig, title, subtitle };

  const rawSrc = cfg.src || cfg.url || "";
  if (!rawSrc) return;

  const modalTitle = cfg.title || title || "Document Viewer";
  const modalSubtitle = cfg.subtitle || subtitle || "";

  const wrapper = ensureLightboxDom();
  if (lightboxState.objectUrlToRevoke) {
    revokeObjectUrlSafely(lightboxState.objectUrlToRevoke);
    lightboxState.objectUrlToRevoke = "";
  }

  lightboxState = {
    zoom: 1,
    rotation: 0,
    src: rawSrc,
    title: modalTitle,
    subtitle: modalSubtitle,
    isPdf: isPdfDocument(rawSrc, cfg.mimeType),
    isNonInline: false,
    objectUrlToRevoke: "",
  };

  wrapper.querySelector("#klbTitle").textContent = modalTitle;
  wrapper.querySelector("#klbSubtitle").textContent = modalSubtitle;

  const stage = wrapper.querySelector("#klbStage");
  const zoomInBtn = wrapper.querySelector("#klbZoomIn");
  const zoomOutBtn = wrapper.querySelector("#klbZoomOut");
  const rotateBtn = wrapper.querySelector("#klbRotate");
  const downloadBtn = wrapper.querySelector("#klbDownload");
  const openTabBtn = wrapper.querySelector("#klbOpenTab");

  stage.innerHTML =
    '<div style="color:#94a3b8;font-size:14px;font-weight:600;">Loading secure media preview…</div>';
  wrapper.style.display = "flex";

  try {
    const preview = /^(blob:|data:)/i.test(rawSrc)
      ? {
          url: rawSrc,
          originalUrl: rawSrc,
          ext: extractFileExtension(cfg.filename || rawSrc),
          isBlob: false,
          isPdf: isPdfDocument(rawSrc, cfg.mimeType),
          isImage:
            !isPdfDocument(rawSrc, cfg.mimeType) &&
            isBrowserRenderableImageMime(cfg.mimeType, cfg.filename || rawSrc),
          isNonInline: false,
          isPlaceholder: false,
        }
      : await fetchProtectedMediaPreview(rawSrc, {
          filename: cfg.filename || "",
          ext: cfg.ext || "",
          mimeType: cfg.mimeType || "",
        });

    if (wrapper.style.display !== "flex") {
      if (preview.isBlob) revokeObjectUrlSafely(preview.url);
      return;
    }

    if (preview.isBlob) {
      lightboxState.objectUrlToRevoke = preview.url;
    }

    const activeHref = preview.url || preview.originalUrl || rawSrc;
    downloadBtn.href = activeHref;
    openTabBtn.href = activeHref;

    const showImageControls = preview.isImage && !preview.isPdf;
    zoomInBtn.style.display = showImageControls ? "inline-flex" : "none";
    zoomOutBtn.style.display = showImageControls ? "inline-flex" : "none";
    rotateBtn.style.display = showImageControls ? "inline-flex" : "none";

    if (preview.isPdf) {
      stage.innerHTML = `<iframe src="${escapeHtml(
        activeHref
      )}#toolbar=1" title="${escapeHtml(
        modalTitle
      )}" style="width:min(1080px,94vw);height:calc(100vh - 130px);border:none;border-radius:10px;background:#0f172a;box-shadow:0 20px 50px rgba(0,0,0,0.5);"></iframe>`;
      return;
    }

    if (preview.isNonInline) {
      const extLabel = (preview.ext || "FILE").toUpperCase();
      renderNonInlineOrErrorCard(
        stage,
        `${extLabel} Preview Requires Download`,
        "Your browser cannot render this file format inline inside the page, but the file is verified and ready to download or open.",
        activeHref,
        extLabel
      );
      return;
    }

    const img = document.createElement("img");
    img.id = "klbImage";
    img.src = activeHref;
    img.alt = modalTitle;
    img.style.cssText = [
      "max-width:92vw",
      "max-height:calc(100vh - 130px)",
      "object-fit:contain",
      "border-radius:10px",
      "transition:transform 180ms ease",
      "box-shadow:0 20px 50px rgba(0,0,0,0.55)",
    ].join(";");
    img.onerror = () => {
      renderNonInlineOrErrorCard(
        stage,
        "Preview Unavailable",
        "The file could not be rendered inline. Try downloading or opening it in a new tab.",
        activeHref,
        (preview.ext || "FILE").toUpperCase()
      );
    };

    stage.innerHTML = "";
    stage.appendChild(img);
  } catch (err) {
    if (wrapper.style.display !== "flex") return;
    zoomInBtn.style.display = "none";
    zoomOutBtn.style.display = "none";
    rotateBtn.style.display = "none";
    const fallbackHref = resolveMediaUrl(rawSrc);
    downloadBtn.href = fallbackHref;
    openTabBtn.href = fallbackHref;
    renderNonInlineOrErrorCard(
      stage,
      "Unable to Load Media Preview",
      err?.message ||
        "The media server could not load this file right now. Ensure the file exists on Hostinger and database connection is healthy.",
      fallbackHref,
      (extractFileExtension(rawSrc) || "ERROR").toUpperCase()
    );
  }
}

if (typeof window !== "undefined") {
  window.openImageLightbox = openImageLightbox;
  window.closeImageLightbox = closeImageLightbox;
}
