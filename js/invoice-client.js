export async function getInvoice(invoiceId){
  const r=await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`); if(!r.ok) throw new Error('Invoice could not be loaded'); return r.json();
}
export function invoicePdfUrl(invoiceId){return `/api/invoices/${encodeURIComponent(invoiceId)}/pdf`}
export async function downloadInvoice(invoiceId){window.open(invoicePdfUrl(invoiceId),'_blank','noopener');}
