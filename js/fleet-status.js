/**
 * KRUIZLY Unified Fleet & Trip Status Engine (Single Frontend Source of Truth)
 * Rules:
 * 1. ONLY vehicles / trips physically or actively On Road ("On Trip") count as Active Trips.
 *    Active Trips === On-Road Fleets (never un-deduplicated past/future bookings).
 * 2. Vehicles sitting In Yard ("In Yard") are Non-Active — scheduled/future/expired/returned
 *    bookings remain In Yard until physically started on the road.
 * 3. Every active roster vehicle is either On Trip, In Maintenance, or In Yard (Non-Active).
 */

const REG_ALIASES = {
  MH03EF1025: "MH03EL1025",
  MH48CJ4153: "MH48GJ4153",
  MH43CY1632: "MH43CU1632",
};

export function normalizeFleetReg(reg) {
  const raw = String(reg ?? "")
    .trim()
    .toUpperCase();
  if (!raw || raw === "TBD" || raw === "NA" || raw === "N/A") return "";
  const clean = raw.replace(/[^A-Z0-9]/g, "");
  return REG_ALIASES[clean] || clean;
}

export function foldRegConfusion(normReg) {
  return String(normReg || "")
    .replace(/[CG]/g, "C")
    .replace(/[UY]/g, "U")
    .replace(/[FL]/g, "F");
}

export function parseOperationalDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d?.getTime()) ? null : d;
  }
  if (typeof value?.toMillis === "function") return new Date(value.toMillis());
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);

  const str = String(value).trim();
  if (!str || str === "—") return null;

  const dmyMatch = str.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i,
  );
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const mins = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const secs = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month, day, hours, mins, secs);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getInspectionObject(b) {
  let insp = b?.returnInspection ?? b?.return_inspection;
  if (typeof insp === "string") {
    try {
      insp = JSON.parse(insp);
    } catch {
      insp = {};
    }
  }
  return insp && typeof insp === "object" ? insp : {};
}

export function isBookingCancelledOrClosed(b) {
  if (!b) return true;
  const bStat = String(b.status ?? b.bookingStatus ?? "").toLowerCase().trim();
  const pStat = String(b.paymentStatus ?? b.payment_status ?? "").toLowerCase().trim();
  return (
    bStat === "cancelled" ||
    bStat === "canceled" ||
    bStat === "rejected" ||
    bStat === "void" ||
    pStat === "cancelled" ||
    pStat === "canceled" ||
    pStat === "rejected" ||
    pStat === "refunded"
  );
}

export function isBookingReturned(b) {
  if (!b) return false;
  const bStat = String(b.status ?? b.bookingStatus ?? "").toLowerCase().trim();
  if (bStat === "completed" || bStat === "returned") return true;
  const insp = getInspectionObject(b);
  return Boolean(
    b.returnOdometer ||
      b.return_odometer ||
      b.endOdometer ||
      b.end_odometer ||
      b.completedAt ||
      b.completed_at ||
      b.returnedAt ||
      b.returned_at ||
      insp.returnOdometer ||
      insp.endOdometer ||
      insp.returnAt ||
      insp.returnedAt ||
      String(insp.returnStatus || "").toLowerCase() === "returned",
  );
}

export function hasBookingPhysicalHandover(b) {
  if (!b) return false;
  const bStat = String(b.status ?? b.bookingStatus ?? "").toLowerCase().trim();
  const pUpStat = String(b.pickupStatus ?? b.pickup_status ?? "").toLowerCase().trim();
  const insp = getInspectionObject(b);
  return Boolean(
    b.pickupAt ||
      b.pickup_at ||
      b.startOdometer ||
      b.start_odometer ||
      b.pickupOdometer ||
      b.pickup_odometer ||
      pUpStat === "picked_up" ||
      insp.pickupOdometer ||
      insp.pickupAt ||
      String(insp.pickupStatus || "").toLowerCase() === "picked_up" ||
      bStat === "in_trip" ||
      bStat === "ongoing",
  );
}

/**
 * Single authoritative check for whether a booking represents an active On-Road trip right now.
 * Bookings that have returned, are cancelled, start in the future without handover, or expired
 * past their drop window without physical handover are classified as In Yard (Non-Active).
 */
export function isBookingOnRoadNow(b, nowMs = Date.now()) {
  if (!b || isBookingCancelledOrClosed(b) || isBookingReturned(b)) {
    return false;
  }

  const bStat = String(b.status ?? b.bookingStatus ?? "").toLowerCase().trim();
  const startDt = parseOperationalDateTime(b.pickupDate ?? b.pickup_date ?? b.startDate ?? b.start_date);
  const endDt = parseOperationalDateTime(b.dropDate ?? b.drop_date ?? b.endDate ?? b.end_date ?? b.pickupDate ?? b.pickup_date);
  const startMs = startDt ? startDt.getTime() : 0;
  const endMs = endDt ? endDt.getTime() + 2 * 60 * 60 * 1000 : 0;

  if (bStat === "in_trip" || bStat === "ongoing") {
    return true;
  }

  const hasHandover = hasBookingPhysicalHandover(b);
  if (hasHandover) {
    if (bStat === "active" || bStat === "started") {
      return true;
    }
    if (endMs && nowMs > endMs + 7 * 24 * 60 * 60 * 1000) {
      return false;
    }
    return true;
  }

  // Without physical handover proof, only active/started bookings inside their live window are On Road
  if (startMs && nowMs < startMs) {
    return false;
  }
  if (endMs && nowMs > endMs + 24 * 60 * 60 * 1000) {
    return false;
  }

  if (bStat === "active" || bStat === "started") {
    if (startMs && endMs) {
      return nowMs >= startMs && nowMs <= endMs + 24 * 60 * 60 * 1000;
    }
    if (startMs) {
      return nowMs >= startMs;
    }
  }

  return false;
}

export function getVehicleMatchKey(v) {
  if (!v) return "";
  if (typeof v === "string") return normalizeFleetReg(v) || v.trim().toUpperCase();
  const normReg = normalizeFleetReg(v.regNo ?? v.reg_no ?? "");
  if (normReg) return normReg;
  const carId = String(v.carId ?? v.car_id ?? "").trim().toUpperCase();
  if (carId) return carId;
  if (v.id !== undefined && v.id !== null && String(v.id).trim() !== "") {
    return `VEH-${v.id}`;
  }
  return `${String(v.brand || "").trim()}-${String(v.model || "").trim()}`.toUpperCase();
}

export function matchBookingToRosterVehicle(b, rosterVehicles = [], allVehicles = []) {
  if (!b) return null;

  const regClean = normalizeFleetReg(b.vehicleReg ?? b.regNo ?? b.v_reg_no ?? "");
  const nameRaw = String(b.vehicleName ?? b.carName ?? "").trim().toUpperCase();
  const carIdRaw = String(b.carId ?? b.car_id ?? "").trim().toUpperCase();
  const vehIdRaw = b.vehicleId ?? b.vehicle_id ?? null;

  const findInList = (list) => {
    for (const f of list) {
      if (!f) continue;
      const fId = f.id;
      const fReg = normalizeFleetReg(f.regNo ?? f.reg_no ?? "");
      const fCarId = String(f.carId ?? f.car_id ?? "").trim().toUpperCase();

      if (vehIdRaw && fId && String(vehIdRaw) === String(fId)) {
        return f;
      }
      if (carIdRaw && fCarId && carIdRaw === fCarId) {
        return f;
      }
      if (regClean && fReg) {
        if (regClean === fReg || regClean.includes(fReg) || fReg.includes(regClean)) {
          return f;
        }
        const rSimp = foldRegConfusion(regClean);
        const fSimp = foldRegConfusion(fReg);
        if (rSimp === fSimp || rSimp.includes(fSimp) || fSimp.includes(rSimp)) {
          return f;
        }
      }
    }

    for (const f of list) {
      if (!f) continue;
      const fModel = String(f.model || "").trim().toUpperCase();
      const fBrand = String(f.brand || "").trim().toUpperCase();
      if (fModel && fModel.length >= 2 && nameRaw.includes(fModel)) {
        return f;
      }
      if (fBrand && fBrand.length >= 3 && nameRaw.includes(fBrand)) {
        return f;
      }
    }
    return null;
  };

  return findInList(rosterVehicles) || findInList(allVehicles);
}

export function doesBookingMatchVehicle(b, vehicleOrReg, rosterVehicles = [], allVehicles = []) {
  if (!b || !vehicleOrReg) return false;

  if (typeof vehicleOrReg === "object") {
    const bVid = b.vehicleId ?? b.vehicle_id;
    if (bVid && vehicleOrReg.id && String(bVid) === String(vehicleOrReg.id)) {
      return true;
    }
    const bCid = String(b.carId ?? b.car_id ?? "").trim().toUpperCase();
    const vCid = String(vehicleOrReg.carId ?? vehicleOrReg.car_id ?? "").trim().toUpperCase();
    if (bCid && vCid && bCid === vCid) {
      return true;
    }
  }

  const targetKey = getVehicleMatchKey(vehicleOrReg);
  const targetReg = typeof vehicleOrReg === "string"
    ? normalizeFleetReg(vehicleOrReg)
    : normalizeFleetReg(vehicleOrReg.regNo ?? vehicleOrReg.reg_no ?? "");
  const bReg = normalizeFleetReg(b.vehicleReg ?? b.regNo ?? b.v_reg_no ?? "");

  if (targetReg && bReg) {
    if (bReg === targetReg || bReg.includes(targetReg) || targetReg.includes(bReg)) {
      return true;
    }
    const bSimp = foldRegConfusion(bReg);
    const tSimp = foldRegConfusion(targetReg);
    if (bSimp === tSimp || bSimp.includes(tSimp) || tSimp.includes(bSimp)) {
      return true;
    }
  }

  const matched = matchBookingToRosterVehicle(b, rosterVehicles, allVehicles);
  if (matched) {
    return getVehicleMatchKey(matched) === targetKey;
  }

  if (typeof vehicleOrReg === "object") {
    const vModel = String(vehicleOrReg.model || "").trim().toUpperCase();
    const bName = String(b.vehicleName ?? b.carName ?? "").trim().toUpperCase();
    if (!bReg && vModel && vModel.length >= 3 && bName.includes(vModel)) {
      return true;
    }
  }

  return false;
}

export function isVehicleMaintenance(v) {
  if (!v || typeof v !== "object") return false;
  const st = String(v.status || "").toLowerCase().trim();
  return st === "maintenance" || st === "service" || st === "repair";
}

export function isVehicleOnRoadNow(
  vehicleOrReg,
  bookings = [],
  rosterVehicles = [],
  allVehicles = [],
  nowMs = Date.now(),
) {
  if (!vehicleOrReg || !Array.isArray(bookings) || bookings.length === 0) {
    return false;
  }
  return bookings.some(
    (b) =>
      doesBookingMatchVehicle(b, vehicleOrReg, rosterVehicles, allVehicles) &&
      isBookingOnRoadNow(b, nowMs),
  );
}

export function getFleetLiveStatusInfo(
  vehicleOrReg,
  bookings = [],
  rosterVehicles = [],
  allVehicles = [],
  nowMs = Date.now(),
) {
  const todayStartMs = new Date(nowMs).setHours(0, 0, 0, 0);
  const carBookings = (Array.isArray(bookings) ? bookings : []).filter(
    (b) =>
      !isBookingCancelledOrClosed(b) &&
      doesBookingMatchVehicle(b, vehicleOrReg, rosterVehicles, allVehicles),
  );

  const isOnTrip = carBookings.some((b) => isBookingOnRoadNow(b, nowMs));
  const inMaintenance = !isOnTrip && isVehicleMaintenance(vehicleOrReg);

  const returnBooking = carBookings.find((b) => {
    if (!isOnTrip || isBookingReturned(b)) return false;
    const endDt = parseOperationalDateTime(b.dropDate ?? b.drop_date ?? b.endDate ?? b.end_date);
    return endDt && endDt.getTime() >= todayStartMs;
  });

  const pickupBooking = carBookings.find((b) => {
    if (isOnTrip || inMaintenance || isBookingReturned(b) || hasBookingPhysicalHandover(b)) {
      return false;
    }
    const startDt = parseOperationalDateTime(b.pickupDate ?? b.pickup_date ?? b.startDate ?? b.start_date);
    return startDt && startDt.getTime() >= todayStartMs;
  });

  return {
    isOnTrip,
    isInYard: !isOnTrip && !inMaintenance,
    isMaintenance: inMaintenance,
    hasScheduledReturn: Boolean(returnBooking),
    returnBooking,
    hasScheduledPickup: Boolean(pickupBooking),
    pickupBooking,
  };
}

/**
 * Computes unified On-Road / In-Yard / Active Trips counters.
 * Core invariant: activeTripsCount === onTripFleetCount, and Yard vehicles are Non-Active.
 */
export function computeUnifiedFleetAndTripSummary({
  rosterVehicles = [],
  allVehicles = [],
  bookings = [],
  serverKpi = null,
  nowMs = Date.now(),
} = {}) {
  const roster = Array.isArray(rosterVehicles)
    ? rosterVehicles.filter((v) => {
        const st = String(v?.status || "").toLowerCase().trim();
        return st !== "removed" && st !== "inactive" && st !== "disabled" && st !== "retired";
      })
    : [];

  if (roster.length > 0 && Array.isArray(bookings)) {
    let onTripFleetCount = 0;
    let inYardFleetCount = 0;
    let maintenanceFleetCount = 0;

    roster.forEach((v) => {
      if (isVehicleOnRoadNow(v, bookings, roster, allVehicles, nowMs)) {
        onTripFleetCount++;
      } else if (isVehicleMaintenance(v)) {
        maintenanceFleetCount++;
      } else {
        inYardFleetCount++;
      }
    });

    const totalFleet = roster.length;
    const utilizationPct = totalFleet > 0
      ? Math.min(100, Math.max(0, Math.round((onTripFleetCount / totalFleet) * 100)))
      : 0;

    return {
      totalFleet,
      onTripFleetCount,
      inYardFleetCount,
      maintenanceFleetCount,
      activeTripsCount: onTripFleetCount,
      utilizationPct,
      source: "live_roster",
    };
  }

  // Fallback when only server KPI summary is loaded (preserve On-Road == Active Trips invariant)
  if (serverKpi && typeof serverKpi === "object") {
    const totalFleet = Math.max(0, Number(serverKpi.total_fleet ?? serverKpi.fleet_count ?? 0));
    const maintenanceFleetCount = Math.max(0, Number(serverKpi.maintenance_fleet ?? 0));
    const rawOnRoad = Math.max(
      0,
      Number(serverKpi.on_road_fleet ?? serverKpi.on_trip_fleet ?? serverKpi.active_trips ?? serverKpi.active_rentals ?? 0),
    );
    const onTripFleetCount = totalFleet > 0 ? Math.min(totalFleet, rawOnRoad) : rawOnRoad;
    const inYardFleetCount =
      serverKpi.available_fleet !== undefined && serverKpi.available_fleet !== null
        ? Math.max(0, Math.min(totalFleet || rawOnRoad, Number(serverKpi.available_fleet)))
        : Math.max(0, totalFleet - onTripFleetCount - maintenanceFleetCount);
    const utilizationPct = totalFleet > 0
      ? Math.min(100, Math.max(0, Math.round((onTripFleetCount / totalFleet) * 100)))
      : 0;

    return {
      totalFleet,
      onTripFleetCount,
      inYardFleetCount,
      maintenanceFleetCount,
      activeTripsCount: onTripFleetCount,
      utilizationPct,
      source: "server_kpi",
    };
  }

  // Booking-only fallback (deduplicated by vehicle key)
  const onRoadVehicleKeys = new Set();
  (Array.isArray(bookings) ? bookings : []).forEach((b) => {
    if (isBookingOnRoadNow(b, nowMs)) {
      const regKey = normalizeFleetReg(b.vehicleReg ?? b.regNo ?? "");
      const fallbackKey = regKey || String(b.vehicleId ?? b.vehicle_id ?? b.bookingId ?? b.id ?? "");
      if (fallbackKey) onRoadVehicleKeys.add(fallbackKey);
    }
  });

  const onTripCount = onRoadVehicleKeys.size;
  return {
    totalFleet: onTripCount,
    onTripFleetCount: onTripCount,
    inYardFleetCount: 0,
    maintenanceFleetCount: 0,
    activeTripsCount: onTripCount,
    utilizationPct: onTripCount > 0 ? 100 : 0,
    source: "bookings_only",
  };
}
