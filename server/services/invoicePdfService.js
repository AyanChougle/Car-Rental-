const fs=require('fs/promises'),path=require('path');
const puppeteer=require('puppeteer');
const {buildInvoiceHtml}=require('../templates/invoiceHtml');
const DIR=process.env.INVOICE_UPLOAD_DIR||'D:\\CarRentPeData\\uploads\\invoices';
let browser;
async function getBrowser(){if(!browser)browser=puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox']});return browser}
async function generateInvoicePdf(invoice){await fs.mkdir(DIR,{recursive:true});const b=await getBrowser(),p=await b.newPage();const fileName=`${String(invoice.invoiceNumber||invoice.invoiceId).replace(/[^a-z0-9._-]/gi,'-')}.pdf`;const filePath=path.join(DIR,fileName);try{await p.setContent(buildInvoiceHtml(invoice),{waitUntil:'networkidle0'});await p.pdf({path:filePath,format:'A4',printBackground:true,margin:{top:'14mm',right:'12mm',bottom:'16mm',left:'12mm'}})}finally{await p.close()}return{fileName,filePath}}
async function readInvoicePdf(filePath){return fs.readFile(filePath)}
module.exports={generateInvoicePdf,readInvoicePdf};
