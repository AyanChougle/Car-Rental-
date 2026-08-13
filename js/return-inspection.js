// Shared "Process Return & Damage Assessment" modal, used from both the
// Manager console and the Admin panel when a booking's car comes back.
// Staff check off whatever applies (scratch, dent, accident, etc.), edit
// the deduction amount for each checked item, add free-text invoice
// notes, and see the refundable security deposit computed live before
// saving. Saving marks the booking "completed" and stores the itemized
// breakdown on the booking doc as the permanent record — nothing here is
// an automatic charge, it's a record of what staff decided to deduct.
import {
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { db } from "./firebase-init.js";

export const DAMAGE_CHECKLIST = [
  { key: "scratch", label: "Scratch / paint damage", defaultAmount: 1500 },
  { key: "dent", label: "Dent", defaultAmount: 3000 },
  { key: "broken_part", label: "Broken part (mirror, light, bumper, etc.)", defaultAmount: 5000 },
  { key: "accident", label: "Accident damage", defaultAmount: 0 },
  { key: "interior", label: "Interior damage / stains", defaultAmount: 1000 },
  { key: "fuel", label: "Missing fuel (below pickup level)", defaultAmount: 500 },
  { key: "late_return", label: "Late return", defaultAmount: 500 },
  { key: "other", label: "Other", defaultAmount: 0 },
];

function formatCurrency(n) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
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
      total += Number(amountInput.value) || 0;
    }
  });
  const deposit = booking.securityDeposit || 0;
  const refund = Math.max(0, deposit - total);

  document.getElementById("returnDeductionTotal").textContent = formatCurrency(total);
  document.getElementById("returnDepositOriginal").textContent = formatCurrency(deposit);
  document.getElementById("returnDepositRefund").textContent = formatCurrency(refund);
  return { total, refund };
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

  title.textContent = `Process Return — ${booking.vehicleName || "Car"} (Booking #${booking.id.slice(-6).toUpperCase()})`;

  const subtitle = document.getElementById("returnModalSubtitle");
  if (subtitle) {
    if (booking.returnInspection && booking.returnInspection.processedByName) {
      const when =
        booking.returnInspection.processedAt && typeof booking.returnInspection.processedAt.toDate === "function"
          ? booking.returnInspection.processedAt.toDate().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
          : "";
      subtitle.textContent = `Processed by ${booking.returnInspection.processedByName}${when ? ` on ${when}` : ""}. Adjust and save to update the record.`;
    } else {
      subtitle.textContent = "Check anything found on inspection, adjust the deduction amount if needed, then save.";
    }
  }

  const items = currentItemsState(booking);
  itemsList.innerHTML = items
    .map(
      (item) => `
    <label class="return-item-row" style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px dashed var(--line);">
      <input type="checkbox" class="return-item-check" data-key="${item.key}" ${item.checked ? "checked" : ""} style="accent-color: var(--accent); width: 18px; height: 18px; flex-shrink: 0;" />
      <span style="flex: 1;">${item.label}</span>
      <span style="color: var(--sub); font-size: 0.85rem;">₹</span>
      <input type="number" class="return-item-amount" min="0" step="50" value="${item.amount}" ${item.checked ? "" : "disabled"} style="width: 100px; padding: 6px 8px; background: rgba(0,0,0,0.4); color: var(--text); border: 1px solid var(--line); border-radius: 6px;" />
    </label>
  `
    )
    .join("");

  notesInput.value = (booking.returnInspection && booking.returnInspection.notes) || "";

  itemsList.querySelectorAll(".return-item-check, .return-item-amount").forEach((el) => {
    el.addEventListener("input", () => recalc(itemsList, booking));
  });
  recalc(itemsList, booking);

  function close() {
    modal.style.display = "none";
  }
  closeBtn.onclick = close;

  saveBtn.onclick = async () => {
    const savedItems = [];
    itemsList.querySelectorAll(".return-item-row").forEach((row) => {
      const checkbox = row.querySelector(".return-item-check");
      const amountInput = row.querySelector(".return-item-amount");
      savedItems.push({
        key: checkbox.dataset.key,
        label: row.querySelector("span").textContent,
        checked: checkbox.checked,
        amount: Number(amountInput.value) || 0,
      });
    });
    const { total, refund } = recalc(itemsList, booking);

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      await updateDoc(doc(db, "bookings", booking.id), {
        status: "completed",
        returnInspection: {
          items: savedItems,
          deductionTotal: total,
          depositRefund: refund,
          notes: notesInput.value.trim(),
          processedAt: serverTimestamp(),
          processedByUid: currentUser.uid,
          processedByName: currentUser.displayName || currentUser.email || "Staff",
        },
      });
      close();
      if (onSaved) onSaved({ total, refund });
    } catch (err) {
      console.error("Failed to save return inspection:", err);
      alert("Could not save the return assessment — check your connection and try again.");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save & Mark Completed";
    }
  };

  modal.style.display = "flex";
}
