const MONTH_CODES = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
];

export function generateNumericBookingId(date = new Date()) {
  const mCode = MONTH_CODES[date.getMonth()] || "SEP";
  // Generates client-side KRZ placeholder which backend finalizes sequentially
  const randNum = Math.floor(10 + Math.random() * 90);
  return `KRZ-${mCode}-0${randNum}`;
}

export function formatBookingNumber(bookingOrId) {
  if (!bookingOrId) return "";
  if (typeof bookingOrId === "string") {
    return bookingOrId.trim();
  }
  const raw = String(
    bookingOrId.bookingNumber ||
    bookingOrId.bookingId ||
    bookingOrId.id ||
    ""
  ).trim();
  return raw;
}
