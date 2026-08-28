import { auth } from './firebase-init.js';

const api = '/api/invoices';
const $ = s => document.querySelector(s);

// The invoice API is staff-only and requires a Firebase ID token on every
// request now — grab a fresh one each call so it never goes stale mid-session.
async function authHeaders(){
  const user = auth.currentUser;
  if(!user) throw new Error('You must be signed in as staff to manage invoices.');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function request(url, opts={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(await authHeaders()),...(opts.headers||{})},...opts});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||data.error||'Invoice request failed');return data}
export async function loadInvoiceForEdit(id){return request(`${api}/${encodeURIComponent(id)}`)}
export async function saveInvoiceEdits(id,payload){return request(`${api}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)})}
export async function sendInvoice(id){return request(`${api}/${encodeURIComponent(id)}/send`,{method:'POST'})}
window.KruizlyInvoiceAdmin={loadInvoiceForEdit,saveInvoiceEdits,sendInvoice};
