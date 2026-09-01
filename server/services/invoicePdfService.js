// server/services/invoicePdfService.js
"use strict";

const fs = require("fs/promises");
const syncFs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { buildInvoiceHtml } = require("../templates/invoiceHtml");

const UPLOAD_ROOT =
  process.env.MEDIA_UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const INVOICE_DIR = path.join(UPLOAD_ROOT, "invoices");

let browser;

function findChromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH)
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome-stable",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
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
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
      ],
    };
    if (executablePath) launchOptions.executablePath = executablePath;
    browser = await puppeteer.launch(launchOptions);
  }
  return browser;
}

async function generateInvoicePdf(invoice) {
  const invFolder = path.join(
    INVOICE_DIR,
    String(invoice.invoiceId || invoice.invoiceNumber),
  );
  await fs.mkdir(invFolder, { recursive: true });

  const b = await getBrowser();
  const p = await b.newPage();
  const fileName = `${String(invoice.invoiceNumber || invoice.invoiceId).replace(/[^a-z0-9._-]/gi, "-")}.pdf`;
  const filePath = path.join(invFolder, fileName);

  try {
    await p.setContent(buildInvoiceHtml(invoice), {
      waitUntil: "networkidle0",
    });
    await p.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
    });
  } finally {
    await p.close();
  }

  return { fileName, filePath };
}

async function readInvoicePdf(filePath) {
  return fs.readFile(filePath);
}

module.exports = { generateInvoicePdf, readInvoicePdf };
