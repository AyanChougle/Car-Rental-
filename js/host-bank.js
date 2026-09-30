// Host bank details (profile page, host role only)
import { checkAuth, getCurrentUser } from "./auth.js?v=20260917-v1";
import { api } from "./kruizly-api.js?v=20260930-bank";

const $ = (id) => document.getElementById(id);
let passbookMediaId = "";
let loaded = false;

function setStatus(msg, kind = "") {
  const el = $("bankFormStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "form-status" + (kind ? " " + kind : "");
}

function setPill(status) {
  const pill = $("bankStatusPill");
  if (!pill) return;
  if (!status) { pill.hidden = true; return; }
  const map = { pending: "Pending verification", verified: "Verified", rejected: "Needs attention" };
  pill.textContent = map[status] || status;
  pill.className = "fleet-status " + (status === "verified" ? "approved" : status === "rejected" ? "rejected" : "pending");
  pill.hidden = false;
}

async function loadBankDetails() {
  if (loaded) return;
  try {
    const res = await api.get("/users/bank-details");
    const d = res?.bankDetails;
    loaded = true;
    if (!d) return;
    $("bankHolderName").value = d.accountHolderName || "";
    $("bankAccountNumber").value = d.accountNumberMasked || d.accountNumber || "";
    $("bankIfsc").value = d.ifscCode || "";
    passbookMediaId = d.passbookMediaId || "";
    if (passbookMediaId) {
      $("bankPassbookNote").textContent = "Passbook photo uploaded. Choose a new file only to replace it.";
      if (d.passbookUrl) {
        const img = $("bankPassbookPreview");
        if (img) {
          img.src = d.passbookUrl;
          img.hidden = false;
        }
      }
    }
    setPill(d.status);
    if (d.status === "rejected" && d.rejectionReason) setStatus("Rejected: " + d.rejectionReason, "error");
  } catch (e) {
    setStatus(e.message || "Could not load bank details.", "error");
  }
}

async function init() {
  const ok = await checkAuth();
  const user = getCurrentUser();
  if (!ok || !user) return;
  const role = String(user.role || "").toLowerCase();
  const isHost = role === "host" || role === "admin";

  const btn = $("bankTabBtn");
  if (btn) btn.hidden = !isHost;
  if (!isHost) {
    if ($("bankForm")) $("bankForm").hidden = true;
    if ($("bankNotHost")) $("bankNotHost").hidden = false;
    return;
  }

  const panel = $("prof-tab-bank");
  const tryLoad = () => { if (panel && !panel.hidden) loadBankDetails(); };
  btn?.addEventListener("click", () => setTimeout(tryLoad, 0));
  tryLoad();

  $("bankIfsc")?.addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  $("bankAccountNumber")?.addEventListener("focus", (e) => { if (e.target.value.includes("•")) e.target.value = ""; });

  $("bankPassbookFile")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    const img = $("bankPassbookPreview");
    if (!f) return;
    passbookMediaId = ""; // new file must be uploaded on save
    if (f.type.startsWith("image/") && img) { img.src = URL.createObjectURL(f); img.hidden = false; }
    else if (img) img.hidden = true;
    $("bankPassbookNote").textContent = f.name;
  });

  $("bankForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = $("bankSaveBtn");
    const name = $("bankHolderName").value.trim();
    const acct = $("bankAccountNumber").value.replace(/\s+/g, "");
    const ifsc = $("bankIfsc").value.trim().toUpperCase();
  const branch = $("bankBranch").value.trim();
    const file = $("bankPassbookFile").files?.[0];

    if (name.length < 3) return setStatus("Enter your full name as on the passbook.", "error");
    if (!acct.includes("•") && !/^\d{9,18}$/.test(acct)) return setStatus("Account number must be 9 to 18 digits.", "error");
    if (!/^[A-Z0-9]{11}$/.test(ifsc)) return setStatus("Enter a valid 11-character IFSC code.", "error");
    if (!file && !passbookMediaId) return setStatus("Upload a photo of your passbook front page.", "error");

    saveBtn.disabled = true;
    setStatus("Saving…");
    try {
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "bank_passbook");
        const up = await api.upload("/media/upload", fd);
        passbookMediaId = up?.mediaId || up?.id || "";
        if (!passbookMediaId) throw new Error("Passbook upload failed. Please try again.");
      }
      const res = await api.post("/users/bank-details", {
        accountHolderName: name,
        accountNumber: acct,
        ifscCode: ifsc,
      branchName: branch,
        passbookMediaId,
      });
      const d = res?.bankDetails;
      if (d) {
        $("bankAccountNumber").value = d.accountNumberMasked || "";
        setPill(d.status);
      }
      $("bankPassbookFile").value = "";
      setStatus("Bank details submitted. Waiting for verification.", "success");
    } catch (err) {
      setStatus(err.message || "Could not save bank details.", "error");
    } finally {
      saveBtn.disabled = false;
    }
  });
}

init();
