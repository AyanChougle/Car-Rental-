// server/migrations/migrate_all.js
"use strict";

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const admin = require("../firebaseAdmin");
const db = require("../config/database");

const firestore = admin.firestore();

function toIsoDate(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val.toDate === "function") {
    try { return val.toDate().toISOString().slice(0, 19).replace("T", " "); } catch (_) {}
  }
  if (val._seconds) {
    return new Date(val._seconds * 1000).toISOString().slice(0, 19).replace("T", " ");
  }
  if (typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace("T", " ");
  }
  return fallback;
}

function num(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function jsonStr(val) {
  if (val === undefined || val === null) return null;
  return JSON.stringify(val);
}

async function runSchemaSetup() {
  console.log("\n============================================================");
  console.log("STEP 1: INITIALIZING MYSQL TABLES");
  console.log("============================================================");

  const schemaSql = fs.readFileSync(
    path.join(__dirname, "001_create_tables.sql"),
    "utf8"
  );

  const statements = schemaSql
    .split(/;\s*[\r\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const stmt of statements) {
    await db.query(stmt);
  }

  console.log("✓ All MySQL tables created / verified successfully.");
}

async function migrateUsers() {
  console.log("\n--- Migrating Users ---");
  const snap = await firestore.collection("users").get();
  let count = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const uid = doc.id;
    const email = d.email || `${uid}@kruizly.com`;
    const name = d.name || d.fullName || null;
    const phone = d.phone || null;
    const age = num(d.age, null);
    const role = d.role || "customer";
    const status = d.status || "active";
    const licenseStatus = d.licenseStatus || "not_submitted";
    const aadharStatus = d.aadharStatus || "not_submitted";
    const panStatus = d.panStatus || "not_submitted";
    const ipAddress = d.ipAddress || null;

    const metadata = {
      licenseURL: d.licenseURL || null,
      licenseFrontURL: d.licenseFrontURL || null,
      licenseBackURL: d.licenseBackURL || null,
      aadharURL: d.aadharURL || null,
      aadharFrontURL: d.aadharFrontURL || null,
      aadharBackURL: d.aadharBackURL || null,
      panFrontURL: d.panFrontURL || null,
      panBackURL: d.panBackURL || null
    };

    const createdAt = toIsoDate(d.createdAt, new Date().toISOString().slice(0, 19).replace("T", " "));
    const updatedAt = toIsoDate(d.updatedAt, createdAt);

    await db.query(
      `INSERT INTO users (
        firebase_uid, email, name, phone, age, role, status,
        license_status, aadhar_status, pan_status, ip_address, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        email = VALUES(email),
        name = VALUES(name),
        phone = VALUES(phone),
        age = VALUES(age),
        role = VALUES(role),
        status = VALUES(status),
        license_status = VALUES(license_status),
        aadhar_status = VALUES(aadhar_status),
        pan_status = VALUES(pan_status),
        ip_address = VALUES(ip_address),
        metadata = VALUES(metadata),
        updated_at = VALUES(updated_at)`,
      [
        uid, email, name, phone, age, role, status,
        licenseStatus, aadharStatus, panStatus, ipAddress, jsonStr(metadata), createdAt, updatedAt
      ]
    );

    if (role === "admin" || role === "manager" || role === "executive") {
      await db.query(
        `INSERT INTO admin_users (firebase_uid, email, role)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE email = VALUES(email), role = VALUES(role)`,
        [uid, email, role]
      );
    }

    count++;
  }

  console.log(`✓ Migrated ${count} user(s) into MySQL users & admin_users.`);
}

async function migrateVehicles() {
  console.log("\n--- Migrating Vehicles ---");
  const snap = await firestore.collection("vehicles").get();
  let count = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const regNo = d.regNo || doc.id;
    const brand = d.brand || "KRUIZLY";
    const model = d.model || "Fleet Vehicle";
    const category = (d.category || "sedan").toLowerCase();
    const year = num(d.year, 2022);
    const fuel = d.fuel || "Petrol";
    const transmission = d.transmission || "Automatic";
    const seats = num(d.seats, 5);
    const bags = num(d.bags, 2);
    const priceDay = num(d.priceDay, 0);
    const priceHour = num(d.priceHour, 0);
    const driverPrice = num(d.driverPrice, 0);
    const securityDeposit = num(d.securityDeposit, 0);
    const freeKm = num(d.freeKm, 250);
    const extraKm = num(d.extraKm, 10);
    const location = d.location || "Gavson Business Park, Ghansoli";
    const available = d.available === 0 || d.available === false ? 0 : 1;
    const status = d.status || "available";
    const icon = d.icon || "🚘";
    const commission = num(d.commission, 10);
    const odometer = String(d.odometer || "pending");
    const trackerId = d.trackerId || null;
    const tracking = String(d.tracking || "pending");
    const lastService = String(d.lastService || "pending");
    const gallery = Array.isArray(d.gallery) ? d.gallery : [];
    const updatedBy = d.updatedBy || null;
    const createdAt = toIsoDate(d.createdAt, new Date().toISOString().slice(0, 19).replace("T", " "));
    const updatedAt = toIsoDate(d.updatedAt, createdAt);

    await db.query(
      `INSERT INTO vehicles (
        reg_no, brand, model, category, year, fuel, transmission, seats, bags,
        price_day, price_hour, driver_price, security_deposit, free_km, extra_km,
        location, available, status, icon, commission, odometer, tracker_id,
        tracking, last_service, gallery, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        brand = VALUES(brand),
        model = VALUES(model),
        category = VALUES(category),
        year = VALUES(year),
        fuel = VALUES(fuel),
        transmission = VALUES(transmission),
        seats = VALUES(seats),
        bags = VALUES(bags),
        price_day = VALUES(price_day),
        price_hour = VALUES(price_hour),
        driver_price = VALUES(driver_price),
        security_deposit = VALUES(security_deposit),
        free_km = VALUES(free_km),
        extra_km = VALUES(extra_km),
        location = VALUES(location),
        available = VALUES(available),
        status = VALUES(status),
        icon = VALUES(icon),
        commission = VALUES(commission),
        odometer = VALUES(odometer),
        tracker_id = VALUES(tracker_id),
        tracking = VALUES(tracking),
        last_service = VALUES(last_service),
        gallery = VALUES(gallery),
        updated_by = VALUES(updated_by),
        updated_at = VALUES(updated_at)`,
      [
        regNo, brand, model, category, year, fuel, transmission, seats, bags,
        priceDay, priceHour, driverPrice, securityDeposit, freeKm, extraKm,
        location, available, status, icon, commission, odometer, trackerId,
        tracking, lastService, jsonStr(gallery), updatedBy, createdAt, updatedAt
      ]
    );

    count++;
  }

  console.log(`✓ Migrated ${count} vehicle(s) into MySQL vehicles.`);
}

async function migrateCoupons() {
  console.log("\n--- Migrating Coupons ---");
  const snap = await firestore.collection("coupons").get();
  let count = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const code = (d.code || d.id || doc.id).toUpperCase().trim();
    const type = d.type || d.discountType || "flat";
    const discountType = d.discountType || type;
    const discountValue = num(d.discountValue ?? d.val ?? 0);
    const minOrder = num(d.minOrder ?? d.minimumBookingAmount ?? 0);
    const maxDiscount = num(d.maxDiscount ?? 0);
    const label = d.label || `${code} Offer`;
    const description = d.description || label;
    const usageLimit = num(d.usageLimit, 0);
    const usedCount = num(d.usedCount, 0);
    const active = d.active === false || d.status === "inactive" ? 0 : 1;
    const status = d.status || (active ? "active" : "inactive");
    const createdAt = toIsoDate(d.createdAt, new Date().toISOString().slice(0, 19).replace("T", " "));
    const updatedAt = toIsoDate(d.updatedAt, createdAt);

    await db.query(
      `INSERT INTO coupons (
        code, type, discount_type, discount_value, min_order, max_discount,
        label, description, usage_limit, used_count, active, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        type = VALUES(type),
        discount_type = VALUES(discount_type),
        discount_value = VALUES(discount_value),
        min_order = VALUES(min_order),
        max_discount = VALUES(max_discount),
        label = VALUES(label),
        description = VALUES(description),
        usage_limit = VALUES(usage_limit),
        used_count = VALUES(used_count),
        active = VALUES(active),
        status = VALUES(status),
        updated_at = VALUES(updated_at)`,
      [
        code, type, discountType, discountValue, minOrder, maxDiscount,
        label, description, usageLimit, usedCount, active, status, createdAt, updatedAt
      ]
    );

    count++;
  }

  console.log(`✓ Migrated ${count} coupon(s) into MySQL coupons.`);
}

async function migrateBookings() {
  console.log("\n--- Migrating Bookings ---");
  const snap = await firestore.collection("bookings").get();
  let count = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const bookingId = String(d.bookingId || d.bookingNumber || doc.id);
    const bookingNumber = String(d.bookingNumber || bookingId);
    const firebaseUid = d.userId || d.firebase_uid || "anonymous";

    // Lookup user_id from MySQL users table
    const [userRows] = await db.query(
      "SELECT id FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebaseUid]
    );
    const userId = userRows?.[0]?.id || null;

    const userName = d.userName || d.customerName || null;
    const userEmail = d.userEmail || d.customerEmail || null;
    const userPhone = d.userPhone || d.customerPhone || null;
    const carId = d.carId || null;
    const vehicleName = d.vehicleName || d.carName || null;
    const vehicleReg = d.vehicleReg || null;
    const vehicleCategory = d.vehicleCategory || null;
    const pickupDate = d.pickupDate || new Date().toISOString();
    const dropDate = d.dropDate || new Date().toISOString();
    const pickupLocation = d.pickupLocation || d.location || null;
    const dropLocation = d.dropLocation || d.location || null;
    const duration = d.duration || `${num(d.days, 1)} Day(s)`;
    const days = num(d.days ?? d.durationDays, 1);
    const hours = num(d.hours, 24);
    const withDriver = d.withDriver ? 1 : 0;
    const baseAmount = num(d.baseAmount, 0);
    const dayRate = num(d.dayRate, 0);
    const hourlyRate = num(d.hourlyRate, 0);
    const driverRate = num(d.driverRate, 0);
    const driverHourlyRate = num(d.driverHourlyRate, 0);
    const deliveryFee = num(d.deliveryFee, 0);
    const insuranceFee = num(d.insuranceFee, 0);
    const couponCode = d.couponCode || null;
    const couponDiscount = num(d.couponDiscount, 0);
    const totalAmount = num(d.totalAmount ?? d.rentalTotal, 0);
    const finalAmount = num(d.finalAmount ?? totalAmount, 0);
    const securityDeposit = num(d.securityDeposit, 0);
    const paymentPlan = d.paymentPlan || "full";
    const paymentAmount = num(d.paymentAmount, 0);
    const paymentAmountPaid = num(d.paymentAmountPaid, 0);
    const advanceAmount = num(d.advanceAmount, 0);
    const remainingBalance = num(d.remainingBalance ?? d.remainingAmount, 0);
    const remainingAmount = num(d.remainingAmount ?? remainingBalance, 0);
    const paymentMethod = d.paymentMethod || "upi";
    const paymentMode = d.paymentMode || null;
    const paymentRef = d.paymentRef || null;
    const paymentStatus = d.paymentStatus || "pending_payment";
    const status = d.status || d.bookingStatus || "pending_payment";
    const bookingStatus = d.bookingStatus || status;

    const paymentScreenshotMediaId = d.paymentScreenshotMediaId ? String(d.paymentScreenshotMediaId) : null;
    const paymentScreenshotCategory = d.paymentScreenshotCategory || "payment_screenshot";
    const paymentScreenshotUrl = d.paymentScreenshotDataUrl || d.paymentScreenshotURL || null;

    const paymentSubmittedAt = toIsoDate(d.paymentSubmittedAt, null);
    const paymentSubmittedBy = d.paymentSubmittedBy || null;
    const paymentVerifiedAt = toIsoDate(d.paymentVerifiedAt, null);
    const paymentVerifiedBy = d.paymentVerifiedBy || null;

    const pickupStatus = d.pickupStatus || null;
    const pickupAt = toIsoDate(d.pickupAt, null);
    const pickupHandledBy = d.pickupHandledBy || null;
    const pickupNotes = d.pickupNotes || null;
    const pickupOdometer = d.pickupOdometer ? String(d.pickupOdometer) : null;
    const pickupFuelLevel = d.pickupFuelLevel ? String(d.pickupFuelLevel) : null;
    const pickupFastagBalance = d.pickupFastagBalance ? String(d.pickupFastagBalance) : null;
    const pickupPaymentCollected = num(d.pickupPaymentCollected, 0);
    const pickupPaymentCollectedAt = toIsoDate(d.pickupPaymentCollectedAt, null);
    const pickupPaymentCollectedBy = d.pickupPaymentCollectedBy || null;

    const startOdometer = d.startOdometer || d.odometerStart ? String(d.startOdometer || d.odometerStart) : null;
    const endOdometer = d.endOdometer || d.odometerEnd ? String(d.endOdometer || d.odometerEnd) : null;
    const startFastag = d.startFastag || d.fastagStart ? String(d.startFastag || d.fastagStart) : null;
    const returnFastag = d.returnFastag || d.fastagReturn ? String(d.returnFastag || d.fastagReturn) : null;
    const returnInspection = d.returnInspection || null;

    const createdAt = toIsoDate(d.createdAt, new Date().toISOString().slice(0, 19).replace("T", " "));
    const updatedAt = toIsoDate(d.updatedAt, createdAt);

    await db.query(
      `INSERT INTO bookings (
        booking_id, booking_number, user_id, firebase_uid, user_name, user_email, user_phone,
        car_id, vehicle_name, vehicle_reg, vehicle_category, pickup_date, drop_date,
        pickup_location, drop_location, duration, days, hours, with_driver, base_amount,
        day_rate, hourly_rate, driver_rate, driver_hourly_rate, delivery_fee, insurance_fee,
        coupon_code, coupon_discount, total_amount, final_amount, security_deposit,
        payment_plan, payment_amount, payment_amount_paid, advance_amount, remaining_balance,
        remaining_amount, payment_method, payment_mode, payment_ref, payment_status, status,
        booking_status, payment_screenshot_media_id, payment_screenshot_category,
        payment_screenshot_url, payment_submitted_at, payment_submitted_by,
        payment_verified_at, payment_verified_by, pickup_status, pickup_at,
        pickup_handled_by, pickup_notes, pickup_odometer, pickup_fuel_level,
        pickup_fastag_balance, pickup_payment_collected, pickup_payment_collected_at,
        pickup_payment_collected_by, start_odometer, end_odometer, start_fastag,
        return_fastag, return_inspection, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        user_name = VALUES(user_name),
        user_email = VALUES(user_email),
        user_phone = VALUES(user_phone),
        payment_status = VALUES(payment_status),
        status = VALUES(status),
        booking_status = VALUES(booking_status),
        payment_ref = VALUES(payment_ref),
        payment_screenshot_url = VALUES(payment_screenshot_url),
        updated_at = VALUES(updated_at)`,
      [
        bookingId, bookingNumber, userId, firebaseUid, userName, userEmail, userPhone,
        carId, vehicleName, vehicleReg, vehicleCategory, pickupDate, dropDate,
        pickupLocation, dropLocation, duration, days, hours, withDriver, baseAmount,
        dayRate, hourlyRate, driverRate, driverHourlyRate, deliveryFee, insuranceFee,
        couponCode, couponDiscount, totalAmount, finalAmount, securityDeposit,
        paymentPlan, paymentAmount, paymentAmountPaid, advanceAmount, remainingBalance,
        remainingAmount, paymentMethod, paymentMode, paymentRef, paymentStatus, status,
        bookingStatus, paymentScreenshotMediaId, paymentScreenshotCategory,
        paymentScreenshotUrl, paymentSubmittedAt, paymentSubmittedBy,
        paymentVerifiedAt, paymentVerifiedBy, pickupStatus, pickupAt,
        pickupHandledBy, pickupNotes, pickupOdometer, pickupFuelLevel,
        pickupFastagBalance, pickupPaymentCollected, pickupPaymentCollectedAt,
        pickupPaymentCollectedBy, startOdometer, endOdometer, startFastag,
        returnFastag, jsonStr(returnInspection), createdAt, updatedAt
      ]
    );

    // If payment ref exists, sync to payments table as well
    if (paymentRef) {
      await db.query(
        `INSERT INTO payments (
          booking_id, user_id, firebase_uid, amount, currency, method,
          utr, status, verified_at, verified_by, submitted_at, created_at
        ) VALUES (?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          verified_at = VALUES(verified_at)`,
        [
          bookingId, userId, firebaseUid, paymentAmountPaid || paymentAmount || totalAmount,
          paymentMethod, paymentRef, paymentStatus, paymentVerifiedAt, paymentVerifiedBy,
          paymentSubmittedAt || createdAt, createdAt
        ]
      );
    }

    count++;
  }

  console.log(`✓ Migrated ${count} booking(s) and corresponding payment record(s) into MySQL.`);
}

async function migrateInvoices() {
  console.log("\n--- Migrating Invoices ---");
  const snap = await firestore.collection("invoices").get();
  let count = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const invoiceId = d.invoiceId || doc.id;
    const invoiceNumber = d.invoiceNumber || `KRZ-INV-${doc.id.slice(0, 8)}`;
    const bookingId = String(d.bookingId || "");
    const rawBookingId = d.rawBookingId || bookingId;
    const firebaseUid = d.userId || "anonymous";

    const [userRows] = await db.query(
      "SELECT id FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebaseUid]
    );
    const userId = userRows?.[0]?.id || null;

    const type = d.type || "BOOKING";
    const status = d.status || "PAID";
    const currency = d.currency || "INR";
    const invoiceDate = toIsoDate(d.invoiceDate, new Date().toISOString().slice(0, 19).replace("T", " "));
    const customer = d.customer || {};
    const vehicle = d.vehicle || {};
    const rental = d.rental || {};
    const charges = d.charges || {};
    const taxRate = num(d.taxRate, 0);
    const subtotal = num(d.subtotal, 0);
    const tax = num(d.tax, 0);
    const total = num(d.total, 0);
    const amountPaid = num(d.amountPaid, total);
    const balanceDue = num(d.balanceDue, 0);
    const paymentPlan = d.paymentPlan || "full";
    const paymentStatus = d.paymentStatus || "paid";
    const paymentMode = d.paymentMode || null;
    const paymentRef = d.paymentRef || null;
    const securityDeposit = d.securityDeposit || null;
    const notes = d.notes || null;

    const pdfFilename = d.pdf?.fileName || `${invoiceNumber}.pdf`;
    const pdfPath = d.pdf?.filePath || `invoices/${invoiceId}/${pdfFilename}`;
    const pdfGeneratedAt = toIsoDate(d.pdf?.generatedAt, null);

    const emailRecipient = d.email?.recipient || null;
    const emailStatus = d.email?.status || "NOT_SENT";
    const emailMessageId = d.email?.messageId || null;
    const emailSentAt = toIsoDate(d.email?.sentAt, null);
    const emailError = d.email?.error || null;

    const createdAt = toIsoDate(d.createdAt, new Date().toISOString().slice(0, 19).replace("T", " "));
    const updatedAt = toIsoDate(d.updatedAt, createdAt);

    const [invResult] = await db.query(
      `INSERT INTO invoices (
        invoice_id, invoice_number, booking_id, raw_booking_id, user_id, firebase_uid,
        type, status, currency, invoice_date, customer, vehicle, rental, charges,
        tax_rate, subtotal, tax, total, amount_paid, balance_due, payment_plan,
        payment_status, payment_mode, payment_ref, security_deposit, notes,
        pdf_filename, pdf_path, pdf_generated_at, email_recipient, email_status,
        email_message_id, email_sent_at, email_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        email_status = VALUES(email_status),
        updated_at = VALUES(updated_at)`,
      [
        invoiceId, invoiceNumber, bookingId, rawBookingId, userId, firebaseUid,
        type, status, currency, invoiceDate, jsonStr(customer), jsonStr(vehicle),
        jsonStr(rental), jsonStr(charges), taxRate, subtotal, tax, total,
        amountPaid, balanceDue, paymentPlan, paymentStatus, paymentMode,
        paymentRef, jsonStr(securityDeposit), notes, pdfFilename, pdfPath,
        pdfGeneratedAt, emailRecipient, emailStatus, emailMessageId,
        emailSentAt, emailError, createdAt, updatedAt
      ]
    );

    count++;
  }

  console.log(`✓ Migrated ${count} invoice(s) into MySQL invoices.`);
}

async function migrateSqliteMedia() {
  console.log("\n--- Migrating SQLite Media Records ---");
  const sqliteDbPath = path.join(__dirname, "..", "db", "media.sqlite");
  if (!fs.existsSync(sqliteDbPath)) {
    console.log("No SQLite media database found. Skipping SQLite media migration.");
    return;
  }

  try {
    const Database = require("better-sqlite3");
    const sqlite = new Database(sqliteDbPath);
    const rows = sqlite.prepare("SELECT * FROM media").all();
    let count = 0;

    for (const r of rows) {
      const [userRows] = await db.query(
        "SELECT id FROM users WHERE firebase_uid = ? LIMIT 1",
        [r.user_id]
      );
      const userId = userRows?.[0]?.id || null;

      const storedName = r.stored_name;
      const storagePath = r.storage_path || `uploads/${storedName}`;

      await db.query(
        `INSERT INTO media (
          user_id, firebase_uid, booking_id, category, doc_type, doc_side,
          original_name, stored_name, storage_path, mime_type, size_bytes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          storage_path = VALUES(storage_path)`,
        [
          userId, r.user_id, r.related_id, r.category, r.doc_type || null, r.doc_side || null,
          r.original_name, storedName, storagePath, r.mime_type, r.size_bytes,
          r.uploaded_at || new Date().toISOString().slice(0, 19).replace("T", " ")
        ]
      );
      count++;
    }
    sqlite.close();
    console.log(`✓ Migrated ${count} SQLite media record(s) into MySQL media.`);
  } catch (err) {
    console.warn("SQLite media migration notice:", err.message);
  }
}

async function printSummary() {
  console.log("\n============================================================");
  console.log("MIGRATION VERIFICATION SUMMARY");
  console.log("============================================================");

  const tables = [
    "users", "vehicles", "bookings", "payments",
    "coupons", "invoices", "media", "admin_users"
  ];

  for (const t of tables) {
    const [rows] = await db.query(`SELECT COUNT(*) AS total FROM ${t}`);
    console.log(`  Table [${t.padEnd(12)}]: ${rows[0].total} record(s)`);
  }

  console.log("============================================================\n");
}

async function main() {
  try {
    const test = await db.testConnection();
    if (!test.connected) {
      console.error("[Migration Aborted] Could not connect to MySQL server:", test.error);
      console.log("Please ensure MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD are set correctly in .env.");
      process.exit(1);
    }
    console.log("✓ Connected to MySQL database at:", process.env.MYSQL_HOST || "localhost");

    await runSchemaSetup();
    await migrateUsers();
    await migrateVehicles();
    await migrateCoupons();
    await migrateBookings();
    await migrateInvoices();
    await migrateSqliteMedia();
    await printSummary();

    console.log("🎉 ALL MIGRATIONS COMPLETED SUCCESSFULLY WITH 0 ERRORS.\n");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

main();
