const api = '/api/invoices';
const $ = s => document.querySelector(s);
async function request(url, opts={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||'Invoice request failed');return data}
export async function loadInvoiceForEdit(id){return request(`${api}/${encodeURIComponent(id)}`)}
export async function saveInvoiceEdits(id,payload){return request(`${api}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)})}
export async function sendInvoice(id){return request(`${api}/${encodeURIComponent(id)}/send`,{method:'POST'})}
window.KruizlyInvoiceAdmin={loadInvoiceForEdit,saveInvoiceEdits,sendInvoice};
