# DATABASE_SCHEMA.md — Phase 0 (as-built)

## Firestore (source of truth for structured data)

### users/{uid}
Fields observed in rules/JS: `role` ("customer" | "admin" | "manager" |
"executive"), `licenseStatus`, `aadharStatus`, `panStatus`
("not_submitted"|"pending"|...), profile fields (name, phone, age, upload
URLs). Client can create its own doc only with `role: "customer"`; client
can update its own profile fields but never `role`/`*Status` (staff-only).

### bookings/{bookingId}
Fields observed: `userId`, `status`, `paymentStatus`, `paymentId`,
`paymentMethod`, `paymentAmount`, `paymentReference` (UTR),
`paymentScreenshotMediaId`, `paymentSubmittedAt/VerifiedAt/RejectedAt`,
`paymentVerifiedBy/RejectedBy`, `paymentRejectionReason`,
`returnInspection`, `totalAmount`, `securityDeposit`, `pickupStatus`,
`pickupAt/HandledBy/Notes/PhotoMediaIds`, `odometerStart/End/UpdatedAt`,
`fastagStart/Return/UpdatedAt/By`, `updatedAt`. Vehicle/customer fields are
looked up defensively by `server/routes/payments.js` under several possible
key names (`vehicleName`/`carName`/`vehicle.name`, `totalAmount`/`total`/
`amountToPay`/etc.) — i.e. the schema is not yet fully standardized field
names across the codebase.

### partner_cars/{carId}
`userId`, `status`, `photos`, `photoMediaIds`. Owner can edit their own
listing but not self-approve or touch photos (staff-controlled).

### contact_messages/{id}
Public create, staff-only read.

### vehicles/{regNo}
Currently an **override** document, not the full record — merged at read
time over `js/vehicles.js`. Confirmed fields in use: `regNo`, `brand`,
`model`, `category`, `available`, `status`, `removed`, `imageUrl`,
`isCustomFleet`, `updatedAt`, `updatedBy`, `createdAt`, `createdBy`, plus
full pricing fields (`priceDay`, `priceHour`, `driverPrice`,
`securityDeposit`, `freeKm`, `extraKm`, `seats`, `bags`, `year`,
`transmission`, `fuel`, `location`) when an admin adds a fully custom
vehicle.

## SQLite (server/db/media.sqlite) — to be migrated off per Section 28

### media
`id, user_id, category, related_id, original_name, stored_name, mime_type,
size_bytes, uploaded_at, deleted_at`. Categories:
`profile_photo, license_doc, aadhar_doc, pan_doc, partner_car_photo,
partner_car_video, payment_screenshot, inspection_photo, personal_media`.

### payments
`id, booking_id, user_id, amount, currency, method, utr,
screenshot_media_id, status, submitted_at, verified_at, verified_by,
rejection_reason`. Unique index on `utr` (case-insensitive) already prevents
duplicate submissions — this constraint needs an equivalent when the table
moves to Firestore (Section 12: "Prevent duplicate UTRs").

## Local filesystem — to be migrated off per Section 5/28

`server/uploads/` — actual file bytes for every `media` row above, referenced
by `stored_name`. No Firebase Storage equivalent exists yet for these
categories; this is the concrete Phase 3 migration target.

## Target Firestore schema not yet created (Phase 5+, out of scope this pass)

`vehicleMaintenance`, `coupons`, `couponUsages`, `payments` (Firestore
version), `transactions`, `refunds`, `damageCharges`, `invoices`,
`auditLogs` — see Master Plan Sections 7, 11, 14, 15, 17, 18, 25.
