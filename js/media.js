/* ============================================================
   KRUIZLY — PROFILE "MY MEDIA" TAB
   ------------------------------------------------------------
   Personal photo/video gallery backed by the local Node/Express
   + SQLite media server in /server (NOT Firebase Storage — this
   is the separate local-disk storage feature). Firebase Auth is
   still the identity source: every request here is authorized
   with the same signed-in user's Firebase ID token, which the
   server verifies itself (see server/middleware/auth.js).

   This module only runs on profile.html and only touches the
   new #prof-tab-media panel — it doesn't read or change anything
   the rest of the app (bookings, docs, Firebase Storage) uses.
   ============================================================ */

import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { MEDIA_SERVER_URL } from "./media-config.js";

const CATEGORY = "personal_media";
const MAX_FILE_BYTES = 50 * 1024 * 1024; // matches server/routes/media.js limit

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime"
];

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function authHeader() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/* ------------------------------------------------------------
   Gallery state
   ------------------------------------------------------------ */

// Object URLs we've created for thumbnails, so we can revoke them
// on re-render instead of leaking memory.
let activeObjectUrls = [];

function clearObjectUrls() {
  activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
  activeObjectUrls = [];
}

/* ------------------------------------------------------------
   API calls
   ------------------------------------------------------------ */

async function fetchMediaList() {
  const headers = await authHeader();
  const res = await fetch(
    `${MEDIA_SERVER_URL}/api/media?category=${CATEGORY}`,
    { headers }
  );
  if (!res.ok) {
    throw new Error(`Couldn't load your media (${res.status}).`);
  }
  return res.json();
}

async function fetchMediaBlob(mediaId) {
  const headers = await authHeader();
  const res = await fetch(`${MEDIA_SERVER_URL}/api/media/file/${mediaId}`, {
    headers
  });
  if (!res.ok) throw new Error("Couldn't load file.");
  return res.blob();
}

async function uploadFile(file) {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", CATEGORY);

  const res = await fetch(`${MEDIA_SERVER_URL}/api/media/upload`, {
    method: "POST",
    headers, // do NOT set Content-Type — the browser sets the multipart boundary
    body: formData
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status}).`);
  }
  return data;
}

async function deleteMedia(mediaId) {
  const headers = await authHeader();
  const res = await fetch(`${MEDIA_SERVER_URL}/api/media/${mediaId}`, {
    method: "DELETE",
    headers
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Delete failed (${res.status}).`);
  }
}

/* ------------------------------------------------------------
   Rendering
   ------------------------------------------------------------ */

async function renderGallery() {
  const grid = $("mediaGrid");
  const emptyState = $("mediaEmptyState");
  const errorState = $("mediaErrorState");
  if (!grid) return;

  grid.innerHTML = "";
  errorState.hidden = true;
  clearObjectUrls();

  let items;
  try {
    items = await fetchMediaList();
  } catch (err) {
    errorState.hidden = false;
    errorState.textContent =
      err.message.includes("Failed to fetch")
        ? "Can't reach the media server — make sure it's running (see server/README.md)."
        : err.message;
    emptyState.hidden = true;
    return;
  }

  emptyState.hidden = items.length !== 0;
  if (items.length === 0) return;

  for (const item of items) {
    const card = document.createElement("div");
    card.className = "media-item";
    card.innerHTML = `
      <div class="media-item__preview" data-id="${item.id}">
        <div class="media-item__loading">Loading…</div>
      </div>
      <div class="media-item__meta">
        <span class="media-item__name" title="${escapeHtml(item.originalName)}">
          ${escapeHtml(item.originalName)}
        </span>
        <span class="media-item__size">${formatBytes(item.sizeBytes)}</span>
      </div>
      <button
        type="button"
        class="media-item__delete"
        data-id="${item.id}"
        aria-label="Delete ${escapeHtml(item.originalName)}"
      >
        Delete
      </button>
    `;
    grid.appendChild(card);

    // Lazy-load the actual bytes (auth-gated, so can't just use <img src>).
    fetchMediaBlob(item.id)
      .then(blob => {
        const url = URL.createObjectURL(blob);
        activeObjectUrls.push(url);
        const preview = card.querySelector(".media-item__preview");
        preview.innerHTML = item.mimeType.startsWith("video/")
          ? `<video src="${url}" controls preload="metadata"></video>`
          : `<img src="${url}" alt="${escapeHtml(item.originalName)}" />`;
      })
      .catch(() => {
        const preview = card.querySelector(".media-item__preview");
        preview.innerHTML = `<div class="media-item__loading">Preview unavailable</div>`;
      });
  }

  grid.querySelectorAll(".media-item__delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Deleting…";
      try {
        await deleteMedia(btn.dataset.id);
        await renderGallery();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Delete";
        alert(err.message);
      }
    });
  });
}

/* ------------------------------------------------------------
   Upload widget wiring
   ------------------------------------------------------------ */

function initUploadWidget() {
  const fileInput = $("mediaFile");
  const uploadBtn = $("mediaUploadBtn");
  const status = $("mediaUploadStatus");
  const selectionPreview = $("mediaSelectionPreview");
  const selectionFrame = $("mediaSelectionFrame");
  const selectionName = $("mediaSelectionName");
  const selectionSize = $("mediaSelectionSize");
  const selectionRemove = $("mediaSelectionRemove");
  let selectionObjectUrl = null;

  if (!fileInput || !uploadBtn) return;

  function clearSelectionPreview({ clearInput = true } = {}) {
    if (selectionObjectUrl) {
      URL.revokeObjectURL(selectionObjectUrl);
      selectionObjectUrl = null;
    }

    if (selectionFrame) selectionFrame.innerHTML = "";
    if (selectionName) selectionName.textContent = "";
    if (selectionSize) selectionSize.textContent = "";
    if (selectionPreview) selectionPreview.hidden = true;
    if (clearInput) fileInput.value = "";

    uploadBtn.disabled = true;
  }

  function showSelectionPreview(file) {
    if (!selectionPreview || !selectionFrame) return;

    selectionObjectUrl = URL.createObjectURL(file);
    selectionFrame.innerHTML = file.type.startsWith("video/")
      ? `<video src="${selectionObjectUrl}" controls preload="metadata"></video>`
      : `<img src="${selectionObjectUrl}" alt="Preview of ${escapeHtml(file.name)}" />`;

    if (selectionName) selectionName.textContent = file.name;
    if (selectionSize) selectionSize.textContent = formatBytes(file.size);
    selectionPreview.hidden = false;
  }

  fileInput.addEventListener("change", () => {
    clearSelectionPreview({ clearInput: false });
    const file = fileInput.files[0];
    status.textContent = "";

    if (!file) {
      uploadBtn.disabled = true;
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      status.textContent = "Unsupported file type. Use JPG, PNG, WEBP, GIF, MP4, WEBM, or MOV.";
      clearSelectionPreview();
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      status.textContent = "File is too large — 50MB max.";
      clearSelectionPreview();
      return;
    }
    showSelectionPreview(file);
    uploadBtn.disabled = false;
  });

  selectionRemove?.addEventListener("click", () => {
    clearSelectionPreview();
    status.textContent = "";
  });

  uploadBtn.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading…";
    status.textContent = "";

    try {
      await uploadFile(file);
      status.textContent = "Uploaded.";
      clearSelectionPreview();
      uploadBtn.textContent = "Upload";
      await renderGallery();
    } catch (err) {
      status.textContent = err.message.includes("Failed to fetch")
        ? "Can't reach the media server — make sure it's running (see server/README.md)."
        : err.message;
      uploadBtn.textContent = "Upload";
      uploadBtn.disabled = false;
    }
  });

  window.addEventListener("beforeunload", () => {
    if (selectionObjectUrl) URL.revokeObjectURL(selectionObjectUrl);
  }, { once: true });
}

/* ------------------------------------------------------------
   Init — only load once we know who's signed in, same pattern
   every other profile.js sub-feature uses.
   ------------------------------------------------------------ */

onAuthStateChanged(auth, user => {
  if (!user) return;
  initUploadWidget();
  renderGallery();
});
