import { auth } from './firebase-init.js';

const $=id=>document.getElementById(id);let current=null;
const setStatus=t=>{const el=$('invoiceAdminStatus');if(el)el.textContent=t||''};

// Invoice routes are staff-only now and need a fresh Bearer token on every call.
async function authHeaders(){
  const user = auth.currentUser;
  if(!user) throw new Error('You must be signed in as staff to manage invoices.');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(await authHeaders())},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||'Invoice operation failed');return d}

// window.open() can't attach an Authorization header, and the PDF route now
// requires one — fetch it as a blob with the token, then open that instead.
async function openInvoicePdf(invoiceId){
  const headers = await authHeaders();
  const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`, { headers });
  if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d.message||d.error||'Could not load invoice PDF.'); }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener');
  setTimeout(()=>URL.revokeObjectURL(objectUrl), 60_000);
}
function fill(i){current=i;$('invoiceAdminEditor').hidden=false;$('invoiceCustomerName').value=i.customer?.name||'';$('invoiceCustomerEmail').value=i.customer?.email||'';$('invoiceVehicleName').value=i.vehicle?.name||'';$('invoiceVehicleReg').value=i.vehicle?.registration||'';$('invoiceRental').value=i.charges?.rental||0;$('invoiceExtraKm').value=i.charges?.extraKm||0;$('invoiceLateFee').value=i.charges?.lateFee||0;$('invoiceFuel').value=i.charges?.fuel||0;$('invoiceDamage').value=(Number(i.charges?.damage||0)+Number(i.charges?.cleaning||0));$('invoiceTaxRate').value=i.taxRate??0;$('invoiceNotes').value=i.notes||''}
function payload(){return{customer:{...current.customer,name:$('invoiceCustomerName').value,email:$('invoiceCustomerEmail').value},vehicle:{...current.vehicle,name:$('invoiceVehicleName').value,registration:$('invoiceVehicleReg').value},charges:{...current.charges,rental:Number($('invoiceRental').value||0),extraKm:Number($('invoiceExtraKm').value||0),lateFee:Number($('invoiceLateFee').value||0),fuel:Number($('invoiceFuel').value||0),damage:Number($('invoiceDamage').value||0)},taxRate:Number($('invoiceTaxRate').value||0),notes:$('invoiceNotes').value}}
$('invoiceLoadBtn')?.addEventListener('click',async()=>{try{setStatus('Loading invoice…');const d=await api(`/api/invoices/${encodeURIComponent($('invoiceAdminId').value.trim())}`);fill(d.invoice);setStatus(`Loaded ${d.invoice.invoiceNumber}`)}catch(e){setStatus(e.message)}});
$('invoicePreviewBtn')?.addEventListener('click',async()=>{if(!current)return;try{await openInvoicePdf(current.invoiceId)}catch(e){setStatus(e.message)}});
$('invoiceSaveBtn')?.addEventListener('click',async()=>{if(!current)return;try{setStatus('Saving and regenerating PDF…');const d=await api(`/api/invoices/${encodeURIComponent(current.invoiceId)}`,{method:'PUT',body:JSON.stringify(payload())});fill(d.invoice);setStatus('Saved. PDF regenerated successfully.')}catch(e){setStatus(e.message)}});
$('invoiceSendBtn')?.addEventListener('click',async()=>{if(!current)return;try{setStatus('Saving latest version…');const d=await api(`/api/invoices/${encodeURIComponent(current.invoiceId)}`,{method:'PUT',body:JSON.stringify(payload())});current=d.invoice;setStatus('Sending latest invoice…');await api(`/api/invoices/${encodeURIComponent(current.invoiceId)}/send`,{method:'POST'});setStatus(`Invoice ${current.invoiceNumber} saved and sent.`)}catch(e){setStatus(e.message)}});
