const fs=require('fs/promises'),path=require('path');
const puppeteer=require('puppeteer');
const {buildInvoiceHtml}=require('../templates/invoiceHtml');
const DIR=process.env.INVOICE_UPLOAD_DIR||'D:\\CarRentPeData\\uploads\\invoices';
const syncFs = require('fs');
let browser;

function findChromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null
  ].filter(Boolean);

  for (const p of candidates) {
    if (syncFs.existsSync(p)) return p;
  }
  return undefined;
}

async function getBrowser() {
  if (!browser) {
    const executablePath = findChromePath();
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    if (executablePath) launchOptions.executablePath = executablePath;
    browser = await puppeteer.launch(launchOptions);
  }
  return browser;
}
async function generateInvoicePdf(invoice){await fs.mkdir(DIR,{recursive:true});const b=await getBrowser(),p=await b.newPage();const fileName=`${String(invoice.invoiceNumber||invoice.invoiceId).replace(/[^a-z0-9._-]/gi,'-')}.pdf`;const filePath=path.join(DIR,fileName);try{await p.setContent(buildInvoiceHtml(invoice),{waitUntil:'networkidle0'});await p.pdf({path:filePath,format:'A4',printBackground:true,margin:{top:'14mm',right:'12mm',bottom:'16mm',left:'12mm'}})}finally{await p.close()}return{fileName,filePath}}
async function readInvoicePdf(filePath){return fs.readFile(filePath)}
module.exports={generateInvoicePdf,readInvoicePdf};
