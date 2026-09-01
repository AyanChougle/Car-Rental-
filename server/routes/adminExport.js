// server/routes/adminExport.js
"use strict";

const express = require("express");
const XLSX = require("xlsx");
const db = require("../config/database");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

function safeCell(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val);
  return val;
}

/**
 * GET /api/admin/export/excel
 * Export all MySQL data as an Excel workbook
 */
router.get("/export/excel", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const workbook = XLSX.utils.book_new();

    // 1. Users Sheet (sanitize sensitive fields)
    const [users] = await db.query(
      `SELECT id, firebase_uid, email, name, phone, age, role, status,
              license_status, aadhar_status, pan_status, ip_address, created_at, updated_at
       FROM users ORDER BY id ASC`
    );
    const usersSheet = XLSX.utils.json_to_sheet(users.map((u) => ({
      ID: u.id,
      "Firebase UID": u.firebase_uid,
      Email: u.email,
      Name: u.name || "",
      Phone: u.phone || "",
      Age: u.age || "",
      Role: u.role,
      Status: u.status,
      "License Status": u.license_status,
      "Aadhaar Status": u.aadhar_status,
      "PAN Status": u.pan_status,
      "Created At": u.created_at
    })));
    XLSX.utils.book_append_sheet(workbook, usersSheet, "Users");

    // 2. Bookings Sheet
    const [bookings] = await db.query(
      `SELECT * FROM bookings ORDER BY id DESC`
    );
    const bookingsSheet = XLSX.utils.json_to_sheet(bookings.map((b) => ({
      "Booking ID": b.booking_id,
      "Booking Number": b.booking_number,
      "Customer Name": b.user_name || "",
      "Customer Email": b.user_email || "",
      "Customer Phone": b.user_phone || "",
      Vehicle: b.vehicle_name || "",
      Registration: b.vehicle_reg || "",
      Category: b.vehicle_category || "",
      "Pickup Date": b.pickup_date,
      "Drop Date": b.drop_date,
      Location: b.pickup_location || "",
      Duration: b.duration || "",
      "Total Amount (INR)": Number(b.total_amount),
      "Paid Amount (INR)": Number(b.payment_amount_paid),
      "Remaining Balance (INR)": Number(b.remaining_balance),
      "Payment Plan": b.payment_plan,
      "Payment Status": b.payment_status,
      "Booking Status": b.status,
      "Payment Reference / UTR": b.payment_ref || "",
      "Created At": b.created_at
    })));
    XLSX.utils.book_append_sheet(workbook, bookingsSheet, "Bookings");

    // 3. Vehicles Fleet Sheet
    const [vehicles] = await db.query(
      `SELECT * FROM vehicles ORDER BY id ASC`
    );
    const vehiclesSheet = XLSX.utils.json_to_sheet(vehicles.map((v) => ({
      Registration: v.reg_no,
      Brand: v.brand,
      Model: v.model,
      Category: v.category,
      Year: v.year,
      Fuel: v.fuel,
      Transmission: v.transmission,
      Seats: v.seats,
      "Daily Rate (INR)": Number(v.price_day),
      "Hourly Rate (INR)": Number(v.price_hour),
      "Driver Rate (INR)": Number(v.driver_price),
      "Security Deposit (INR)": Number(v.security_deposit),
      "Free KM": v.free_km,
      "Extra KM Rate (INR)": Number(v.extra_km),
      Available: v.available === 1 ? "Yes" : "No",
      Status: v.status,
      Location: v.location || ""
    })));
    XLSX.utils.book_append_sheet(workbook, vehiclesSheet, "Fleet");

    // 4. Payments Sheet
    const [payments] = await db.query(
      `SELECT * FROM payments ORDER BY id DESC`
    );
    const paymentsSheet = XLSX.utils.json_to_sheet(payments.map((p) => ({
      ID: p.id,
      "Booking ID": p.booking_id,
      "Firebase UID": p.firebase_uid,
      "Amount (INR)": Number(p.amount),
      Method: p.method,
      UTR: p.utr || "",
      Status: p.status,
      "Verified At": p.verified_at || "",
      "Verified By": p.verified_by || "",
      "Rejection Reason": p.rejection_reason || "",
      "Submitted At": p.submitted_at
    })));
    XLSX.utils.book_append_sheet(workbook, paymentsSheet, "Payments");

    // 5. Coupons Sheet
    const [coupons] = await db.query(
      `SELECT * FROM coupons ORDER BY id ASC`
    );
    const couponsSheet = XLSX.utils.json_to_sheet(coupons.map((c) => ({
      Code: c.code,
      Type: c.type,
      "Discount Value": Number(c.discount_value),
      "Min Order (INR)": Number(c.min_order),
      "Max Discount (INR)": Number(c.max_discount),
      "Used Count": c.used_count,
      "Usage Limit": c.usage_limit,
      Active: c.active === 1 ? "Yes" : "No",
      Status: c.status
    })));
    XLSX.utils.book_append_sheet(workbook, couponsSheet, "Coupons");

    // 6. Invoices Sheet
    const [invoices] = await db.query(
      `SELECT * FROM invoices ORDER BY id DESC`
    );
    const invoicesSheet = XLSX.utils.json_to_sheet(invoices.map((inv) => ({
      "Invoice Number": inv.invoice_number,
      "Booking ID": inv.booking_id,
      "Invoice Date": inv.invoice_date,
      "Subtotal (INR)": Number(inv.subtotal),
      "Tax (INR)": Number(inv.tax),
      "Total Amount (INR)": Number(inv.total),
      "Amount Paid (INR)": Number(inv.amount_paid),
      "Balance Due (INR)": Number(inv.balance_due),
      Status: inv.status,
      "Payment Status": inv.payment_status,
      "Payment Mode": inv.payment_mode || "",
      "Payment Ref": inv.payment_ref || "",
      "Email Recipient": inv.email_recipient || "",
      "Email Status": inv.email_status
    })));
    XLSX.utils.book_append_sheet(workbook, invoicesSheet, "Invoices");

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `KRUIZLY_Production_Database_Export_${timestamp}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(excelBuffer);
  } catch (err) {
    console.error("[GET /api/admin/export/excel error]", err);
    res.status(500).json({ success: false, error: "Failed to generate Excel export." });
  }
});

module.exports = router;
