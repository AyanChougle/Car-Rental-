// server/routes/vehicles.js
"use strict";

const express = require("express");
const db = require("../config/database");
const { requireAuth, requireRole, optionalAuth } = require("../middleware/auth");

const router = express.Router();

function formatVehicleRow(v) {
  let gallery = [];
  try {
    gallery = typeof v.gallery === "string" ? JSON.parse(v.gallery) : (v.gallery || []);
  } catch (_) {}

  return {
    id: v.reg_no,
    regNo: v.reg_no,
    brand: v.brand,
    model: v.model,
    name: `${v.brand} ${v.model}`.trim(),
    category: v.category,
    year: v.year,
    fuel: v.fuel,
    transmission: v.transmission,
    seats: v.seats,
    bags: v.bags,
    priceDay: Number(v.price_day),
    priceHour: Number(v.price_hour),
    driverPrice: Number(v.driver_price),
    securityDeposit: Number(v.security_deposit),
    freeKm: v.free_km,
    extraKm: Number(v.extra_km),
    location: v.location,
    available: v.available === 1 ? 1 : 0,
    status: v.status,
    icon: v.icon || "🚘",
    commission: Number(v.commission),
    odometer: v.odometer,
    trackerId: v.tracker_id,
    tracking: v.tracking,
    lastService: v.last_service,
    gallery,
    updatedBy: v.updated_by,
    createdAt: v.created_at,
    updatedAt: v.updated_at
  };
}

/**
 * GET /api/vehicles
 * Retrieve all vehicles
 */
router.get("/", optionalAuth, async (req, res) => {
  try {
    const isStaff = req.user && (req.user.role === "admin" || req.user.role === "manager");
    const sql = isStaff
      ? `SELECT * FROM vehicles ORDER BY id ASC`
      : `SELECT * FROM vehicles WHERE status != 'disabled' ORDER BY id ASC`;

    const rows = await db.query(sql);
    const vehicles = rows.map(formatVehicleRow);

    res.json({ success: true, count: vehicles.length, vehicles });
  } catch (err) {
    console.error("[GET /api/vehicles error]", err);
    res.status(500).json({ success: false, error: "Failed to fetch vehicle fleet." });
  }
});

/**
 * GET /api/vehicles/:regNo
 * Get specific vehicle details
 */
router.get("/:regNo", async (req, res) => {
  const regNo = String(req.params.regNo || "").trim();
  try {
    const rows = await db.query("SELECT * FROM vehicles WHERE reg_no = ? LIMIT 1", [regNo]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Vehicle not found." });
    }
    res.json({ success: true, vehicle: formatVehicleRow(rows[0]) });
  } catch (err) {
    console.error("[GET /api/vehicles/:regNo error]", err);
    res.status(500).json({ success: false, error: "Failed to fetch vehicle." });
  }
});

/**
 * POST /api/vehicles
 * Admin: Add new vehicle to fleet
 */
router.post("/", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const body = req.body || {};
  const regNo = String(body.regNo || body.id || "").trim().toUpperCase();

  if (!regNo) {
    return res.status(400).json({ success: false, error: "Vehicle registration number is required." });
  }

  try {
    await db.query(
      `INSERT INTO vehicles (
        reg_no, brand, model, category, year, fuel, transmission, seats, bags,
        price_day, price_hour, driver_price, security_deposit, free_km, extra_km,
        location, available, status, icon, commission, odometer, tracker_id,
        tracking, last_service, gallery, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        regNo,
        body.brand || "KRUIZLY",
        body.model || "Vehicle",
        body.category || "sedan",
        Number(body.year || 2022),
        body.fuel || "Petrol",
        body.transmission || "Automatic",
        Number(body.seats || 5),
        Number(body.bags || 2),
        Number(body.priceDay || 0),
        Number(body.priceHour || 0),
        Number(body.driverPrice || 0),
        Number(body.securityDeposit || 0),
        Number(body.freeKm || 250),
        Number(body.extraKm || 10),
        body.location || "Gavson Business Park, Ghansoli",
        body.available === 0 || body.available === false ? 0 : 1,
        body.status || "available",
        body.icon || "🚘",
        Number(body.commission || 10),
        String(body.odometer || "pending"),
        body.trackerId || null,
        String(body.tracking || "pending"),
        String(body.lastService || "pending"),
        JSON.stringify(Array.isArray(body.gallery) ? body.gallery : []),
        req.user.firebaseUid
      ]
    );

    res.status(201).json({ success: true, message: "Vehicle added successfully.", regNo });
  } catch (err) {
    console.error("[POST /api/vehicles error]", err);
    res.status(500).json({ success: false, error: err.code === "ER_DUP_ENTRY" ? "Vehicle registration already exists." : "Failed to add vehicle." });
  }
});

/**
 * PUT /api/vehicles/:regNo
 * Admin: Update vehicle details
 */
router.put("/:regNo", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const regNo = String(req.params.regNo || "").trim();
  const body = req.body || {};

  try {
    const [existing] = await db.query("SELECT * FROM vehicles WHERE reg_no = ? LIMIT 1", [regNo]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: "Vehicle not found." });
    }

    const current = existing[0];
    const newRegNo = body.regNo ? String(body.regNo).trim().toUpperCase() : current.reg_no;

    await db.query(
      `UPDATE vehicles SET
        reg_no = ?,
        brand = ?,
        model = ?,
        category = ?,
        year = ?,
        fuel = ?,
        transmission = ?,
        seats = ?,
        bags = ?,
        price_day = ?,
        price_hour = ?,
        driver_price = ?,
        security_deposit = ?,
        free_km = ?,
        extra_km = ?,
        location = ?,
        available = ?,
        status = ?,
        icon = ?,
        commission = ?,
        odometer = ?,
        tracker_id = ?,
        tracking = ?,
        last_service = ?,
        gallery = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE reg_no = ?`,
      [
        newRegNo,
        body.brand ?? current.brand,
        body.model ?? current.model,
        body.category ?? current.category,
        body.year !== undefined ? Number(body.year) : current.year,
        body.fuel ?? current.fuel,
        body.transmission ?? current.transmission,
        body.seats !== undefined ? Number(body.seats) : current.seats,
        body.bags !== undefined ? Number(body.bags) : current.bags,
        body.priceDay !== undefined ? Number(body.priceDay) : current.price_day,
        body.priceHour !== undefined ? Number(body.priceHour) : current.price_hour,
        body.driverPrice !== undefined ? Number(body.driverPrice) : current.driver_price,
        body.securityDeposit !== undefined ? Number(body.securityDeposit) : current.security_deposit,
        body.freeKm !== undefined ? Number(body.freeKm) : current.free_km,
        body.extraKm !== undefined ? Number(body.extraKm) : current.extra_km,
        body.location ?? current.location,
        body.available !== undefined ? (body.available === 1 || body.available === true ? 1 : 0) : current.available,
        body.status ?? current.status,
        body.icon ?? current.icon,
        body.commission !== undefined ? Number(body.commission) : current.commission,
        body.odometer !== undefined ? String(body.odometer) : current.odometer,
        body.trackerId !== undefined ? body.trackerId : current.tracker_id,
        body.tracking !== undefined ? String(body.tracking) : current.tracking,
        body.lastService !== undefined ? String(body.lastService) : current.last_service,
        body.gallery !== undefined ? JSON.stringify(Array.isArray(body.gallery) ? body.gallery : []) : current.gallery,
        req.user.firebaseUid,
        regNo
      ]
    );

    res.json({ success: true, message: "Vehicle updated successfully." });
  } catch (err) {
    console.error("[PUT /api/vehicles/:regNo error]", err);
    res.status(500).json({ success: false, error: "Failed to update vehicle." });
  }
});

/**
 * DELETE /api/vehicles/:regNo
 * Admin: Delete / Disable vehicle
 */
router.delete("/:regNo", requireAuth, requireRole("admin"), async (req, res) => {
  const regNo = String(req.params.regNo || "").trim();
  try {
    await db.query("DELETE FROM vehicles WHERE reg_no = ?", [regNo]);
    res.json({ success: true, message: "Vehicle deleted successfully." });
  } catch (err) {
    console.error("[DELETE /api/vehicles/:regNo error]", err);
    res.status(500).json({ success: false, error: "Failed to delete vehicle." });
  }
});

module.exports = router;
