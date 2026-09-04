// Shared "Process Return & Damage Assessment" modal, used from both the
// Manager console and the Admin panel when a booking's car comes back.
// Staff check off whatever applies (scratch, dent, accident, etc.), edit
// the deduction amount for each checked item, add free-text invoice notes,
// upload return-condition photos, and see the refundable security deposit
// computed live before saving. Saving marks the booking "completed" and
// stores the itemized breakdown on the booking doc as the permanent record.
import { api } from "./kruizly-api.js?v=20260904-v2";
import { MEDIA_SERVER_URL } from "./media-config.js";
import { formatBookingNumber } from "./booking-reference.js";

export const DAMAGE_CHECKLIST = [
  { key: "scratch", label: "Scratch / paint damage", defaultAmount: 1500 },
  { key: "dent", label: "Dent", defaultAmount: 3000 },
  {
    key: "broken_part",
    label: "Broken part (mirror, light, bumper, etc.)",
    defaultAmount: 5000,
  },
  { key: "accident", label: "Accident damage", defaultAmount: 0 },
  { key: "interior", label: "Interior damage / stains", defaultAmount: 1000 },
  {
    key: "fuel",
    label: "Missing fuel / FASTag",
    defaultAmount: 500,
  },
  { key: "late_return", label: "Late return", defaultAmount: 500 },
  { key: "other", label: "Other", defaultAmount: 0 },
];

const RETURN_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const RETURN_PHOTO_MAX_BYTES = 6 * 1024 * 1024;

function formatCurrency(n) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function safeFileName(value) {
  return (
    String(value || "photo")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "photo"
  );
}
// addEventListener.safeFileName(value);{
//   return (
//     String(value || "photo")
//       .toLocaleLowerCase()
//       .replace(/[^a-z0-9._-]+/g, "-")
//       .replace(/-+/g, "-")
//       .replaceAll(/^-|-$/g, "")
//   )
// }
async function uploadReturnPhoto(user, bookingId, file, index) {
  if (!user) {
    throw new Error("Return photo upload requires a signed-in staff account.");
  }

  const token = await user.getIdToken();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", "inspection_photo");
  formData.append("relatedId", bookingId);

  const response = await fetch(`${MEDIA_SERVER_URL}/api/media/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Upload failed (${response.status}).`);
  }

  return {
    mediaId: data.id,
    mediaUrl: data.url,
    name: file.name || `photo-${index + 1}`,
  };
}

function normalizeSavedPhotos(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item) return null;

      if (typeof item === "string") {
        return {
          url: item,
          name: `Return photo ${index + 1}`,
          kind: "saved",
        };
      }

      const url = item.url || item.downloadURL || item.src || "";

      if (!url) {
        return null;
      }

      return {
        url,
        name: item.name || item.fileName || `Return photo ${index + 1}`,
        kind: item.kind || "saved",
      };
    })
    .filter(Boolean);
}

async function fetchProtectedMediaBlob(user, mediaId) {
  const token = await user.getIdToken();
  const response = await fetch(
    `${MEDIA_SERVER_URL}/api/media/file/${encodeURIComponent(mediaId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Could not load photo (${response.status}).`);
  }

  return URL.createObjectURL(await response.blob());
}

function currentItemsState(booking) {
  const saved =
    booking.returnInspection && Array.isArray(booking.returnInspection.items)
      ? booking.returnInspection.items
      : null;

  return DAMAGE_CHECKLIST.map((def) => {
    const existing = saved ? saved.find((i) => i.key === def.key) : null;

    return {
      key: def.key,
      label: def.label,
      checked: existing ? !!existing.checked : false,
      amount: existing ? existing.amount : def.defaultAmount,
    };
  });
}

function recalc(itemsList, booking) {
  let total = 0;

  itemsList.querySelectorAll(".return-item-row").forEach((row) => {
    const checkbox = row.querySelector(".return-item-check");
    const amountInput = row.querySelector(".return-item-amount");

    amountInput.disabled = !checkbox.checked;

    if (checkbox.checked) {
      total += Math.max(0, Number(amountInput.value) || 0);
    }
  });

  const deposit = Math.max(0, Number(booking.securityDeposit) || 0);
  const refund = Math.max(0, deposit - total);

  const deductionEl = document.getElementById("returnDeductionTotal");
  const depositEl = document.getElementById("returnDepositOriginal");
  const refundEl = document.getElementById("returnDepositRefund");

  if (deductionEl) deductionEl.textContent = formatCurrency(total);
  if (depositEl) depositEl.textContent = formatCurrency(deposit);
  if (refundEl) refundEl.textContent = formatCurrency(refund);

  return { total, refund };
}

function renderPhotoGrid(container, photos) {
  if (!container) return;

  if (!photos.length) {
    container.innerHTML = `
      <div class="return-upload__empty">
        No return photos yet. Upload clear shots after inspection.
      </div>
    `;
    return;
  }
  // if (!photos.length){
  //   container.innerHTML = `
  //     <div class="return-upload__empty">
  //     No return photos yet. Upload clear shots after inspection.
  //     </div>
  //   `; return;
  // }
  container.innerHTML = photos
    .map(
      (photo, index) => `
        <figure class="return-upload__thumb ${photo.kind === "new" ? "is-new" : ""}">
          <img src="${photo.url}" alt="${photo.name || `Return photo ${index + 1}`}" />
          <figcaption>${photo.kind === "new" ? "New" : "Saved"} photo</figcaption>
        </figure>
      `,
    )
    .join("");
}

// currentUser: the Firebase Auth user object for the staff member using
// the modal (used only to record who processed the return).
export function openReturnModal({ booking, currentUser, onSaved }) {
  const modal = document.getElementById("returnModal");
  const title = document.getElementById("returnModalTitle");
  const itemsList = document.getElementById("returnItemsList");
  const notesInput = document.getElementById("returnInvoiceNotes");
  const saveBtn = document.getElementById("saveReturnBtn");
  const closeBtn = document.getElementById("closeReturnModal");
  const photosInput = document.getElementById("returnInspectionPhotos");
  const photosPreview = document.getElementById("returnInspectionPreview");
  const photosStatus = document.getElementById("returnInspectionStatus");

  if (!modal || !title || !itemsList || !notesInput || !saveBtn || !closeBtn) {
    console.error("The return inspection modal is incomplete.");
    alert("The return form could not be opened. Please refresh and try again.");
    return;
  }

  title.textContent = `Process Return - ${booking.vehicleName || "Car"} (Booking #${formatBookingNumber(booking)})`;

  const subtitle = document.getElementById("returnModalSubtitle");
  if (subtitle) {
    if (booking.returnInspection && booking.returnInspection.processedByName) {
      const when =
        booking.returnInspection.processedAt &&
        typeof booking.returnInspection.processedAt.toDate === "function"
          ? booking.returnInspection.processedAt
              .toDate()
              .toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
          : "";
      subtitle.textContent = `Processed by ${booking.returnInspection.processedByName}${when ? ` on ${when}` : ""}. Adjust and save to update the record.`;
    } else {
      subtitle.textContent =
        "Check anything found on inspection, adjust the deduction amount if needed, upload return photos, then save.";
    }
  }

  const savedPhotos = Array.isArray(booking.returnInspection?.photos)
    ? booking.returnInspection.photos
    : Array.isArray(booking.returnInspection?.returnPhotoMediaIds)
      ? booking.returnInspection.returnPhotoMediaIds.map((mediaId) => ({
          mediaId,
        }))
      : Array.isArray(booking.returnInspection?.returnPhotos)
        ? booking.returnInspection.returnPhotos
        : [];

  let selectedPhotoFiles = [];
  let selectedPhotoUrls = [];

  const items = currentItemsState(booking);
  itemsList.innerHTML = items
    .map(
      (item) => `
        <label class="return-item-row ${item.checked ? "is-checked" : ""}">
          <div class="return-item-main">
            <input type="checkbox" class="return-item-check" data-key="${item.key}" ${item.checked ? "checked" : ""} />
            <span class="return-item-label">${item.label}</span>
          </div>
          <div class="return-item-input-wrap">
            <span class="return-item-currency">₹</span>
            <input type="number" class="return-item-amount" min="0" step="50" value="${item.amount}" ${item.checked ? "" : "disabled"} />
          </div>
        </label>
      `,
    )
    .join("");

  notesInput.value =
    (booking.returnInspection && booking.returnInspection.notes) || "";

  // Odometer + FASTag prefill
  const returnOdoInput = document.getElementById("returnOdometer");
  const returnFastagInput = document.getElementById("returnFastag");
  const ri = booking.returnInspection || {};
  if (returnOdoInput) returnOdoInput.value = ri.returnOdometer != null ? ri.returnOdometer : "";
  if (returnFastagInput) returnFastagInput.value = ri.returnFastagBalance != null ? ri.returnFastagBalance : "";

  async function refreshPhotoPreview() {
    selectedPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
    selectedPhotoUrls = [];

    const previewPhotos = [];

    if (photosPreview) {
      photosPreview.innerHTML = `
        <div class="return-upload__empty">
          Loading existing photos...
        </div>
      `;
    }

    for (let index = 0; index < savedPhotos.length; index += 1) {
      const photo = savedPhotos[index];
      let url = photo.url || photo.mediaUrl || photo.downloadURL || "";

      if (photo.mediaId && currentUser) {
        try {
          url = await fetchProtectedMediaBlob(currentUser, photo.mediaId);
          selectedPhotoUrls.push(url);
        } catch {
          continue;
        }
      }

      if (!url || url.startsWith("/api/media/file/")) {
        continue;
      }

      previewPhotos.push({
        url,
        name: photo.name || `Return photo ${index + 1}`,
        kind: "saved",
      });
    }

    selectedPhotoFiles.forEach((file) => {
      const url = URL.createObjectURL(file);
      selectedPhotoUrls.push(url);
      previewPhotos.push({
        url,
        name: file.name,
        kind: "new",
      });
    });

    renderPhotoGrid(photosPreview, previewPhotos);
  }

  if (photosInput) {
    photosInput.value = "";
    photosInput.onchange = () => {
      const files = Array.from(photosInput.files || []);

      if (!files.length) {
        selectedPhotoFiles = [];
        if (photosStatus) {
          photosStatus.textContent = "No new photos selected.";
        }
        void refreshPhotoPreview();
        return;
      }

      for (const file of files) {
        if (!RETURN_PHOTO_TYPES.includes(file.type)) {
          if (photosStatus) {
            photosStatus.textContent =
              "Only JPG, PNG, and WebP photos are allowed.";
            photosStatus.className = "return-upload__status error";
          }
          photosInput.value = "";
          return;
        }

        if (file.size > RETURN_PHOTO_MAX_BYTES) {
          if (photosStatus) {
            photosStatus.textContent = "Each photo must be 6MB or smaller.";
            photosStatus.className = "return-upload__status error";
          }
          photosInput.value = "";
          return;
        }
      }

      selectedPhotoFiles = files;
      if (photosStatus) {
        photosStatus.textContent = `${files.length} photo${files.length === 1 ? "" : "s"} ready to upload.`;
        photosStatus.className = "return-upload__status";
      }
      void refreshPhotoPreview();
    };
  }

  void refreshPhotoPreview();

  itemsList
    .querySelectorAll(".return-item-check, .return-item-amount")
    .forEach((el) => {
      el.addEventListener("input", () => recalc(itemsList, booking));
    });
  recalc(itemsList, booking);

  function close() {
    selectedPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
    selectedPhotoUrls = [];
    modal.style.display = "none";
    modal.hidden = true;
  }

  closeBtn.onclick = close;
  modal.onclick = (event) => {
    if (event.target === modal) close();
  };

  saveBtn.onclick = async () => {
    const savedItems = [];

    itemsList.querySelectorAll(".return-item-row").forEach((row) => {
      const checkbox = row.querySelector(".return-item-check");
      const amountInput = row.querySelector(".return-item-amount");
      const label = row.querySelector(".return-item-label");

      const isChecked = !!checkbox.checked;
      const amountVal = Math.max(0, Number(amountInput.value) || 0);

      savedItems.push({
        key: checkbox.dataset.key,
        label: label ? label.textContent : "",
        checked: isChecked,
        amount: isChecked ? amountVal : 0,
      });
    });

    const { total, refund } = recalc(itemsList, booking);
    const existingPhotos = savedPhotos.map((photo) => ({
      url: photo.url,
      name: photo.name,
      kind: "saved",
    }));

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    if (photosStatus) {
      photosStatus.textContent = "Uploading return photos...";
      photosStatus.className = "return-upload__status";
    }

    try {
      const uploadedPhotos = [];

      for (let index = 0; index < selectedPhotoFiles.length; index += 1) {
        const file = selectedPhotoFiles[index];
        uploadedPhotos.push({
          ...(await uploadReturnPhoto(currentUser, booking.id, file, index)),
          kind: "new",
        });
      }

      // Collect return odometer + fastag
      const returnOdoRaw = returnOdoInput?.value?.trim();
      const returnFastagRaw = returnFastagInput?.value?.trim();
      const returnOdometer = returnOdoRaw !== "" && !isNaN(Number(returnOdoRaw)) ? Number(returnOdoRaw) : null;
      const returnFastagBalance = returnFastagRaw !== "" && !isNaN(Number(returnFastagRaw)) ? Number(returnFastagRaw) : null;

      const inspectionPayload = {
          items: savedItems,
          deductionTotal: total,
          depositRefund: refund,
          notes: notesInput.value.trim(),
          photos: [
            ...existingPhotos,
            ...uploadedPhotos.map((photo) => ({
              mediaId: photo.mediaId,
              url: photo.mediaUrl,
              name: photo.name,
              kind: "new",
            })),
          ],
          returnPhotoMediaIds: [
            ...(Array.isArray(booking.returnInspection?.returnPhotoMediaIds)
              ? booking.returnInspection.returnPhotoMediaIds
              : []),
            ...uploadedPhotos.map((photo) => photo.mediaId),
          ],
          photoCount:
            (Array.isArray(booking.returnInspection?.returnPhotoMediaIds)
              ? booking.returnInspection.returnPhotoMediaIds.length
              : 0) + uploadedPhotos.length,
          processedAt: new Date().toISOString(),
          processedByUid: currentUser?.id || currentUser?.uid || null,
          processedByName:
            currentUser?.name || currentUser?.email || "Staff",
      };

      if (returnOdometer !== null) inspectionPayload.returnOdometer = returnOdometer;
      if (returnFastagBalance !== null) inspectionPayload.returnFastagBalance = returnFastagBalance;

      await api.put(`/bookings/${booking.id}`, {
        status: "completed",
        returnInspection: inspectionPayload,
      }).catch(() => {});

      close();
      if (onSaved) await onSaved({ total, refund });
    } catch (err) {
      console.error("Failed to save return inspection:", err);
      if (photosStatus) {
        photosStatus.textContent =
          "Could not save the return assessment. Check your connection and try again.";
        photosStatus.className = "return-upload__status error";
      }
      alert(
        "Could not save the return assessment - check your connection and try again.",
      );
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save & Mark Completed";
    }
  };

  modal.hidden = false;
  modal.removeAttribute("hidden");
  modal.style.display = "flex";
}
