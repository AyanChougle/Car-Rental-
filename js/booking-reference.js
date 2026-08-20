const BOOKING_NUMBER_LENGTH = 8;

export function generateNumericBookingId() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);

  const minimum = 10 ** (BOOKING_NUMBER_LENGTH - 1);
  const range = 9 * minimum;

  return String(minimum + (values[0] % range));
}

export function formatBookingNumber(bookingOrId) {
  const booking =
    bookingOrId && typeof bookingOrId === "object"
      ? bookingOrId
      : { id: bookingOrId };

  const preferred = [
    booking.bookingNumber,
    booking.bookingRef,
    booking.reference,
    booking.id,
  ].find((value) => /^\d+$/.test(String(value || "").trim()));

  if (preferred) {
    return String(preferred).trim();
  }

  const source = String(
    booking.id ||
      booking.bookingRef ||
      booking.reference ||
      "0"
  );

  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const minimum = 10 ** (BOOKING_NUMBER_LENGTH - 1);
  const range = 9 * minimum;

  return String(minimum + ((hash >>> 0) % range));
}
