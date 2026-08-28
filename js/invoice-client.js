import { auth } from "./firebase-init.js";

// The invoice API only allows the invoice's own customer (or staff) to read
// it, and requires a Firebase ID token on every request — attach one here.
async function authHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to view this invoice.");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function getInvoice(invoiceId) {
  const r = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || d.error || "Invoice could not be loaded");
  }
  return r.json();
}

// A plain <a href> or window.open() can't attach an Authorization header,
// and the PDF route requires one — fetch it as a blob with the token, then
// hand back a temporary local URL the caller can open or link to.
export async function fetchInvoicePdfObjectUrl(invoiceId) {
  const r = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
    headers: await authHeaders(),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || d.error || "Invoice PDF could not be loaded");
  }
  const blob = await r.blob();
  return URL.createObjectURL(blob);
}

export async function downloadInvoice(invoiceId) {
  const objectUrl = await fetchInvoicePdfObjectUrl(invoiceId);
  window.open(objectUrl, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
