/**
 * js/image-lightbox.js
 * Kruizly High-Resolution Image & Document Lightbox Viewer
 * Features:
 * - Fullscreen dark blurred overlay with close button & ESC key support
 * - Document details title / subtitle (e.g. "Driving License — Front Side · Vikas Bacche")
 * - 2x Zoom toggle (plus click / double-click to zoom in/out for images)
 * - 90-degree Rotation toggle (in case ID cards are uploaded sideways)
 * - Native interactive PDF embedding with zoom/page controls
 * - Open Original Raw Document/Image in New Tab
 */

let currentLightboxZoom = 1;
let currentLightboxRotate = 0;

export function isPdfDocument(url) {
  if (!url) return false;
  try {
    const decoded = decodeURIComponent(String(url).toLowerCase());
    return decoded.includes(".pdf") || decoded.includes("application/pdf") || decoded.includes("mime=pdf") || decoded.includes("type=pdf") || decoded.includes("ext=pdf");
  } catch (e) {
    const raw = String(url).toLowerCase();
    return raw.includes(".pdf") || raw.includes("application/pdf");
  }
}

export function openImageLightbox(src, title = "Document Preview", subtitle = "") {
  if (!src) return;

  let modal = document.getElementById("kruizlyImageLightbox");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "kruizlyImageLightbox";
    modal.className = "kruizly-lightbox-modal";
    modal.innerHTML = `
      <div class="kruizly-lightbox-backdrop"></div>
      <div class="kruizly-lightbox-container">
        <!-- Header Bar -->
        <div class="kruizly-lightbox-header">
          <div class="kruizly-lightbox-info">
            <h4 id="kruizlyLightboxTitle" class="kruizly-lightbox-title">Document Preview</h4>
            <span id="kruizlyLightboxSubtitle" class="kruizly-lightbox-subtitle"></span>
          </div>
          <div class="kruizly-lightbox-controls">
            <button type="button" id="kruizlyLightboxZoomBtn" class="kruizly-lightbox-btn" title="Toggle Zoom (1x / 2x)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
              <span id="kruizlyLightboxZoomLabel">2x Zoom</span>
            </button>
            <button type="button" id="kruizlyLightboxRotateBtn" class="kruizly-lightbox-btn" title="Rotate (90°)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              <span>Rotate</span>
            </button>
            <a id="kruizlyLightboxNewTabBtn" href="#" target="_blank" rel="noopener" class="kruizly-lightbox-btn" title="Open Original in New Tab">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              <span>Open Tab</span>
            </a>
            <button type="button" id="kruizlyLightboxCloseBtn" class="kruizly-lightbox-close" aria-label="Close" title="Close (Esc)">&times;</button>
          </div>
        </div>

        <!-- Stage Body -->
        <div class="kruizly-lightbox-body" id="kruizlyLightboxBody">
          <div class="kruizly-lightbox-stage" id="kruizlyLightboxStage">
            <img id="kruizlyLightboxImg" src="" alt="Enlarged Document" class="kruizly-lightbox-img" />
            <iframe id="kruizlyLightboxPdf" src="" class="kruizly-lightbox-pdf" style="display:none; width: 100%; height: 100%; min-height: 520px; border: none; border-radius: 8px; background: #ffffff;" title="PDF Preview"></iframe>
          </div>
        </div>

        <!-- Bottom Hint -->
        <div class="kruizly-lightbox-hint" id="kruizlyLightboxHint">
          Click image or double-click to toggle 2x zoom · Click outside or press ESC to close
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = document.getElementById("kruizlyLightboxCloseBtn");
    const backdrop = modal.querySelector(".kruizly-lightbox-backdrop");
    const body = document.getElementById("kruizlyLightboxBody");
    const imgEl = document.getElementById("kruizlyLightboxImg");
    const pdfEl = document.getElementById("kruizlyLightboxPdf");
    const zoomBtn = document.getElementById("kruizlyLightboxZoomBtn");
    const rotateBtn = document.getElementById("kruizlyLightboxRotateBtn");

    const closeLightbox = () => {
      modal.classList.remove("active");
      currentLightboxZoom = 1;
      currentLightboxRotate = 0;
      if (imgEl) {
        imgEl.style.transform = "";
        imgEl.classList.remove("zoomed");
        imgEl.src = "";
      }
      if (pdfEl) {
        pdfEl.src = "";
        pdfEl.style.display = "none";
      }
    };

    closeBtn?.addEventListener("click", closeLightbox);
    backdrop?.addEventListener("click", closeLightbox);
    body?.addEventListener("click", (e) => {
      if (e.target === body || e.target.classList.contains("kruizly-lightbox-stage")) {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("active")) {
        closeLightbox();
      }
    });

    const updateTransform = () => {
      if (!imgEl) return;
      imgEl.style.transform = `scale(${currentLightboxZoom}) rotate(${currentLightboxRotate}deg)`;
      const label = document.getElementById("kruizlyLightboxZoomLabel");
      if (label) {
        label.textContent = currentLightboxZoom === 1 ? "2x Zoom" : "1x Reset";
      }
      imgEl.classList.toggle("zoomed", currentLightboxZoom > 1);
    };

    zoomBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      currentLightboxZoom = currentLightboxZoom === 1 ? 2 : 1;
      updateTransform();
    });

    imgEl?.addEventListener("click", (e) => {
      e.stopPropagation();
      currentLightboxZoom = currentLightboxZoom === 1 ? 2 : 1;
      updateTransform();
    });

    rotateBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      currentLightboxRotate = (currentLightboxRotate + 90) % 360;
      updateTransform();
    });

    // Auto-fallback: if browser cannot render image (e.g. PDF or non-image document served in <img>), switch to iframe viewer
    imgEl?.addEventListener("error", () => {
      if (imgEl.src && imgEl.style.display !== "none") {
        const failedSrc = imgEl.src;
        imgEl.style.display = "none";
        if (pdfEl) {
          pdfEl.style.display = "block";
          pdfEl.src = failedSrc;
        }
        if (zoomBtn) zoomBtn.style.display = "none";
        if (rotateBtn) rotateBtn.style.display = "none";
        const hint = document.getElementById("kruizlyLightboxHint");
        if (hint) {
          hint.textContent = "Document Viewer · Use toolbar or click Open Tab for full view · Press ESC to close";
        }
      }
    });
  }

  // Populate data
  const titleEl = document.getElementById("kruizlyLightboxTitle");
  const subEl = document.getElementById("kruizlyLightboxSubtitle");
  const imgEl = document.getElementById("kruizlyLightboxImg");
  const pdfEl = document.getElementById("kruizlyLightboxPdf");
  const newTabBtn = document.getElementById("kruizlyLightboxNewTabBtn");
  const zoomBtn = document.getElementById("kruizlyLightboxZoomBtn");
  const rotateBtn = document.getElementById("kruizlyLightboxRotateBtn");
  const zoomLabel = document.getElementById("kruizlyLightboxZoomLabel");
  const hintEl = document.getElementById("kruizlyLightboxHint");

  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = subtitle;
  if (newTabBtn) newTabBtn.href = src;
  if (zoomLabel) zoomLabel.textContent = "2x Zoom";
  currentLightboxZoom = 1;
  currentLightboxRotate = 0;

  const isPdf = isPdfDocument(src);

  if (isPdf) {
    if (imgEl) {
      imgEl.src = "";
      imgEl.style.display = "none";
      imgEl.style.transform = "";
      imgEl.classList.remove("zoomed");
    }
    if (pdfEl) {
      pdfEl.style.display = "block";
      pdfEl.src = src;
    }
    if (zoomBtn) zoomBtn.style.display = "none";
    if (rotateBtn) rotateBtn.style.display = "none";
    if (hintEl) {
      hintEl.textContent = "Interactive PDF document · Use controls inside preview to zoom / navigate, or click Open Tab for full page · Press ESC to close";
    }
  } else {
    if (pdfEl) {
      pdfEl.src = "";
      pdfEl.style.display = "none";
    }
    if (imgEl) {
      imgEl.style.display = "block";
      imgEl.src = src;
      imgEl.style.transform = "";
      imgEl.classList.remove("zoomed");
    }
    if (zoomBtn) zoomBtn.style.display = "inline-flex";
    if (rotateBtn) rotateBtn.style.display = "inline-flex";
    if (hintEl) {
      hintEl.textContent = "Click image or double-click to toggle 2x zoom · Click outside or press ESC to close";
    }
  }

  modal.classList.add("active");
}

if (typeof window !== "undefined") {
  window.openImageLightbox = openImageLightbox;
  window.isPdfDocument = isPdfDocument;
}
