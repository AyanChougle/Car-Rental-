// ============================================================
// KRUIZLY — CENTRALIZED DATE/TIME DISPLAY FORMATTER
// ============================================================
// Single source of truth for how dates/times are SHOWN across the
// site. Required visible format: DD/MM/YYYY for date-only, and
// DD/MM/YYYY HH:MM:SS (24-hour) wherever a time is shown too.
//
// This only touches DISPLAY strings. It never changes what gets
// written to Firestore, native <input type="date"/"datetime-local">
// values, or any internal date math — those keep using ISO/Date
// objects/Firestore Timestamps exactly as before.
//
// Accepts: Firestore Timestamp (toDate()/toMillis()/{seconds}),
// JS Date, epoch millis (number), ISO strings, "YYYY-MM-DD",
// "YYYY-MM-DDTHH:mm" and already-formatted "DD/MM/YYYY..." strings.

function toJsDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  // Firestore Timestamp
  if (typeof value.toDate === "function") {
    try {
      const d = value.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch (_) {
      return null;
    }
  }
  if (typeof value.toMillis === "function") {
    try {
      const d = new Date(value.toMillis());
      return Number.isNaN(d.getTime()) ? null : d;
    } catch (_) {
      return null;
    }
  }
  if (typeof value.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const str = String(value).trim();
  if (!str) return null;

  // Plain "YYYY-MM-DD" date-only: parse as local midnight, not UTC,
  // so it doesn't shift a day depending on the viewer's timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // Already-formatted "DD/MM/YYYY[ HH:MM[:SS]]" — reparse it.
  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    const [, d, m, y, h, mi, s] = dmy;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      h ? Number(h) : 0,
      mi ? Number(mi) : 0,
      s ? Number(s) : 0
    );
  }

  // ISO datetime / anything else Date can parse (e.g. "YYYY-MM-DDTHH:mm")
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** "DD/MM/YYYY" or "—" */
export function formatKruizlyDate(value) {
  const date = toJsDate(value);
  if (!date) return "—";
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** "DD/MM/YYYY HH:MM:SS" (24-hour) or "—" */
export function formatKruizlyDateTime(value) {
  const date = toJsDate(value);
  if (!date) return "—";
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** "HH:MM:SS" (24-hour) or "—" — for cases that already show the date separately */
export function formatKruizlyTime(value) {
  const date = toJsDate(value);
  if (!date) return "—";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Also expose on window for any non-module script (e.g. kruizly-datepicker.js
// placeholders) that wants it without an import.
if (typeof window !== "undefined") {
  window.formatKruizlyDate = formatKruizlyDate;
  window.formatKruizlyDateTime = formatKruizlyDateTime;
  window.formatKruizlyTime = formatKruizlyTime;
}
