# CARRENTPE — Premium Self-Drive Car Rental Platform

CARRENTPE is a self-drive car rental web app built with plain HTML5, CSS3, and JavaScript (ES Modules) — no build step, no framework — backed by real Firebase Authentication, Cloud Firestore, and Cloud Storage.

It features a 35-car fleet, a single-car 360° scroll gallery, a booking + reservation flow, profile document uploads (license/Aadhar), client-IP logging, an Admin Control Panel, a Manager Operations Console, and a Host/Partner car-listing workflow.

---

## What changed in this pass (read this first)

This codebase had several bugs that made core pages non-functional, plus one serious security hole. Everything below is fixed in this copy. If you're comparing against an older copy of the repo, this section tells you what to look for.

**Site-breaking bugs (fixed):**
- `js/ip-fetcher.js` had invalid, Node-style import paths (`"firebase/firestore"`, `"./firebase"`) and a stray line calling an undefined variable. Because `js/auth.js` and `js/profile.js` both depend on it, **this broke login, signup, and the entire profile page** on every browser. Rewritten with correct browser-compatible imports.
- `js/profile.js` imported named exports (`vehicles`, `fleetImagePath`) from `js/vehicles.js` that don't exist there (it's a classic script, not a module with exports) — this threw immediately and stopped the whole file from running. Fixed to use `window.fleetVehicles` / `window.fleetImagePath` instead, which is what `js/vehicles.js` actually sets.
- `profile.js` called `renderFleetGallery()` for the profile page's "Fleet Showcase" tab, but the function was entirely commented out. Restored.
- `vehicle.html` was missing from the source archive (corrupted on export) — rebuilt from scratch to match the DOM structure `js/vehicle-gallery.js` expects (verified by cross-checking every `getElementById` call).
- Toyota Rumion's fleet entry had its `transmission` field overwritten with its fuel type (`"Petrol + CNG"`) by a copy-paste error. Fixed to `"Manual"`.
- `about.html`, `terms.html`, `privacy.html`, and `refund.html` loaded **no scripts at all**, so the header nav never reflected login state or highlighted the active page on those four pages. Added `js/nav-helper.js` to all four.

**Security fixes (important — read this one):**
- `firestore.rules` let any signed-in user write anything to their own `users/{uid}` document, **including the `role` field**. Combined with a "Grant Admin Role to My Account" button that used to sit on `admin.html`/`manager.html`, any registered customer could make themselves an admin with one click. Rules now block a user from changing their own `role`, `licenseStatus`, or `aadharStatus` — those can only be changed by an admin (role) or manager/admin (verification status). The self-service grant buttons and the "Enable Demo Mode" buttons/backdoors have been removed entirely from `admin.html`, `manager.html`, `admin.js`, and `manager.js`.
- `storage.rules` let **any signed-in user read any other user's uploaded license or Aadhar photo** by guessing their UID — it only checked "is someone logged in," not "is this their own file or a staff member's." Fixed so only the file's owner, or a manager/admin, can read it.
- `admin.js` and `manager.js` showed fabricated sample data (fake customers "Rahul Sharma," "Priya Patel," fake bookings and fake host cars) whenever a Firestore query came back empty or failed — meaning a real admin could easily mistake fake data for real records, or a broken connection for an empty database. Removed; the dashboards now show a genuine "couldn't load — check your connection" message on failure and a real empty state when there's simply no data yet.

**Honesty fix (no backend exists for this yet):**
- `payment.html` was an explicit, self-labeled demo checkout — UPI/Card fields that accepted any input and always "succeeded," writing a fake `DEMO-xxxxx` reference. There is no real payment gateway wired up. This was fixed in two stages: first to an honest "Reserve Now, Pay at Pickup" flow, then upgraded again to a **UPI manual-verification checkout** — see below.
- `js/contact.js` only opened `mailto:`, which does nothing visible on many phones and browsers with no mail app configured — meaning a real customer's message could vanish silently. It now saves every submission to a `contact_messages` collection in Firestore first (so it's never lost), then opens `mailto:` as a bonus for visitors who do have one configured. There's no inbox UI for these yet — read them in **Firebase Console → Firestore → contact_messages** for now, or add one to `admin.html` later.

**Added in this pass:**
- **Google Sign-In** on `index.html`, alongside the existing email/password login — see **Homepage login/quick-book swap** below for exactly how it behaves.
- Fixed a real UI bug: `.fleet-card__image img` had two contradicting CSS rules (`object-fit: cover` vs `object-fit: contain` with padding) defined in different parts of `css/style.css`, silently fighting each other in the cascade. Consolidated into one rule so fleet card images render consistently.
- **UPI manual-verification checkout** replacing the old "Pay at Pickup" flow — see **UPI Checkout & Payment Verification** below. Also caught and fixed a real gap while wiring this up: `firestore.rules` let a customer update *any* field on their own booking, including `paymentStatus` — meaning under the old model a customer could have opened devtools and set `paymentStatus: "paid"` on their own booking directly. Now field-restricted: an owner can only ever move their own booking to `paymentStatus: "pending_verification"` or `status: "cancelled"`; only staff can mark a payment `"paid"`/`"rejected"` or a booking `"confirmed"`.
- Admin **Revenue & Sales KPIs** and a **Payments** review tab on `admin.html` — see below.
- Also fixed, while in `admin.js`: `loadHostCars()` still had a fake fallback listing ("Vikram Malhotra" / Tata Safari) shown whenever Firestore had no host-car submissions yet — missed in the earlier demo-data cleanup pass. Removed; it now shows a real empty state.

---

## UPI Checkout & Payment Verification

`payment.html` is a **manual-verification** UPI checkout, not a live payment gateway — there's no webhook or automatic confirmation, the same trust model as any small business collecting UPI payments by hand today:

1. The customer sees a QR code (generated client-side via the `qrcodejs` library, loaded from cdnjs) encoding a standard `upi://pay?...` deep link with the exact amount and their booking reference, plus an "Open UPI App to Pay" button and four provider shortcuts (Google Pay/PhonePe/Paytm/BHIM) that all open the same deep link — there's no way for a website to force one specific UPI app to open, that decision belongs to the phone's OS.
2. A **Bank transfer / offline** tab offers the same flow with account details instead of a QR code.
3. The customer enters their UPI transaction ID / reference (required) and optionally uploads a screenshot, which uploads to Firebase Storage at `payment_screenshots/{bookingId}/`. This sets `paymentStatus: "pending_verification"` — never `"paid"`, which only staff can set.
4. A staff member reviews it from **Admin → Payments tab**, sees the reference and screenshot (if any), and clicks **Approve** (sets `paymentStatus: "paid"`, `status: "confirmed"`) or **Reject** (prompts for a reason shown back to the customer on `bookings.html`, who can then resubmit).

**Your own UPI ID** lives in `js/payment-config.js` (`PAYMENT_CONFIG.upi.id`) — a plain, un-authenticated config file, since a UPI ID is meant to be given out to customers so they can pay you; it's not a secret the way an API key is. The bank-transfer account details in the same file still have `TODO` placeholders — fill those in before relying on that tab.

To later upgrade to a real, automatic payment gateway (Razorpay/Cashfree/PayU with webhook confirmation instead of manual review), you'll need a small backend — Firebase Cloud Functions is the natural fit since you're already on Firebase. `js/payment.js` isolates the whole checkout behind one file, so that's the only frontend file you'd need to touch.

---

## Quick Start (Local Preview)

This app uses native ES modules (`type="module"`), so you must serve it over HTTP — opening the HTML files directly (`file://`) will not work.

```bash
# Option 1: Node's serve package
npx serve .

# Option 2: Python's built-in server
python -m http.server 8000
```

Then open the printed `localhost` URL in your browser.

---

## Connecting Your Own Firebase Project

### Step 1 — Create the Firebase project
1. Go to the [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. Add a Web app (`</>`) to it, and copy the `firebaseConfig` object it gives you.
3. Paste those values into `js/firebase-init.js`, replacing the existing config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### Step 2 — Enable Authentication
Firebase Console → **Build → Authentication → Get Started → Sign-in method → Email/Password → Enable → Save**.

Also enable Google sign-in, since it's the primary login method on the homepage:
1. Same **Sign-in method** tab → **Google → Enable**.
2. Set a support email (required by Google) → **Save**.
3. No extra config needed in code — `js/auth.js` already calls `signInWithPopup` with `GoogleAuthProvider`, and `authDomain` in `js/firebase-init.js` is already correct for popup sign-in to work once this is turned on.

### Step 3 — Enable Firestore and deploy its rules
1. Firebase Console → **Build → Firestore Database → Create database** (Native mode; pick a region close to your users, e.g. `asia-south1` for India).
2. Deploy the rules in this repo — **do this before you go live**, the app is not safe to run on default/open rules:
   ```bash
   npx -y firebase-tools@latest login
   npx -y firebase-tools@latest use --add
   npx -y firebase-tools@latest deploy --only firestore:rules
   ```

### Step 4 — Enable Storage and deploy its rules
1. Firebase Console → **Build → Storage → Get Started** (default options).
2. Deploy:
   ```bash
   npx -y firebase-tools@latest deploy --only storage:rules
   ```

### Step 5 — Create your first admin account
Self-service role granting was removed for security (see above), so the first admin has to be set manually, once:
1. Open your site, sign up a normal account (e.g. `admin@yourcompany.com`).
2. Firebase Console → **Firestore Database → `users` collection** → find the document with your account's UID.
3. Edit the `role` field (string) from `customer` to `admin`.
4. Refresh the site — the **Admin** link appears in the nav and `admin.html` unlocks. From there, use the Users tab to promote other accounts to `manager` or `admin` without touching the console again.

### Step 6 — Deploy hosting
```bash
npx -y firebase-tools@latest deploy --only hosting
```
(Requires `firebase init hosting` once, pointed at this folder as the public directory — or deploy this static folder to any static host: Netlify, Vercel, Cloudflare Pages, GitHub Pages, etc. There's no server/build step required anywhere in this app.)

---

## Page & Function Guide

| Page | What it does | Key script |
|---|---|---|
| `index.html` | Landing page with hero video. Signed-out visitors see Google sign-in + login/signup forms; signed-in visitors see a pickup/drop date-time quick-book widget in the same spot instead. | `js/auth.js` — `wireLoginForm()`, `wireSignupForm()`, `wireForgotPassword()`, `wirePasswordToggles()`, `wireGoogleAuth()`, `wireHomepageAuthSwap()`. Handles Firebase Auth sign-in/sign-up (email/password and Google), creates the initial Firestore `users/{uid}` doc on first sign-in, and redirects back to wherever the user was headed (`?next=`) after login. |
| `fleet.html` | Full 35-car catalog with search, category filter, chips, and sorting. | `js/fleet.js` — reads the static catalog from `js/vehicles.js`, filters/sorts it client-side, and renders the grid. |
| `vehicle.html` | Single-car detail page with a scroll-driven 360° gallery. | `js/vehicle-gallery.js` — reads the car by `?reg=` from the fleet catalog, renders specs, and drives the sticky-scroll image sequence. |
| `booking.html` | Pickup/drop date picker, optional driver, live price breakdown, creates the booking. | `js/booking.js` — validates dates, computes total (day rate × days + optional driver rate + deposit), writes a `bookings/{id}` doc with `status: "pending_payment"`, then sends the user to `payment.html`. |
| `payment.html` | UPI/bank-transfer checkout — see **UPI Checkout & Payment Verification** above. | `js/payment.js` + `js/payment-config.js` — loads the pending booking, generates the UPI QR/deep link, and on submit sets `paymentStatus: "pending_verification"` (never `"paid"` — only staff can set that). |
| `bookings.html` | "My Bookings" — a customer's full booking history and live status. | `js/bookings.js` |
| `partner.html` | "Host Your Car" — vehicle owners submit a car for the fleet via a full brand→model cascading dropdown (`js/carModels.js`), registration number, and insurance validity dates alongside category, transmission, fuel, seats, and rate. | `js/partner.js` — writes a `partner_cars/{id}` doc with `status: "pending_approval"` for admin review. |
| `profile.html` | User dashboard, exactly 3 tabs: Profile Details, My Bookings, ID Verification (license/Aadhar upload + status). | `js/profile.js` |
| `contact.html` | Contact form. | `js/contact.js` — saves the message to Firestore `contact_messages`, then opens `mailto:` as a bonus. |
| `admin.html` | Admin Control Panel — Revenue & Sales KPIs, a Payments tab to approve/reject submitted UPI/bank-transfer references, manage users and roles, approve/reject license & Aadhar submissions, manage all bookings, approve/reject partner-listed host cars. | `js/admin.js` — restricted to accounts with `role: "admin"` in Firestore. |
| `manager.html` | Operations console — active trips, today's pickups, pending document verifications. | `js/manager.js` — restricted to `role: "manager"` or `"admin"`. |
| `about.html`, `terms.html`, `privacy.html`, `refund.html` | Static informational pages. | `js/nav-helper.js` only (keeps the header nav in sync). |

**Shared scripts (not tied to one page):**
- `js/firebase-init.js` — initializes the Firebase app, exports `auth`, `db`, `storage`. Every other module imports from here; this is the only file with your project's config in it.
- `js/vehicles.js` — the static 35-car fleet catalog (brand, model, year, category, transmission, fuel, seats, pricing, image filename mapping). Loaded as a classic script (not a module) and exposes `window.fleetVehicles` and `window.fleetImagePath()` for every other page to use.
- `js/nav-helper.js` — runs on every page; shows/hides the Admin/Manager nav links and the Login/Logout state based on the current Firebase Auth user and their Firestore role.
- `js/ip-fetcher.js` — best-effort: records the signed-in user's public IP against their profile after login/signup, for basic fraud visibility. Never blocks login if it fails.

---

## Homepage login/quick-book swap

`index.html`'s auth-card is two mutually exclusive views, toggled by `wireHomepageAuthSwap()` in `js/auth.js` via `onAuthStateChanged`:

- **Signed out** (`#authGuestView`): "Continue with Google" button, a divider, then the existing Login/Sign Up tabbed forms — unchanged apart from Google being added above them.
- **Signed in** (`#authUserView`): a welcome line, a pickup/drop date-time picker, a **Find Available Cars** button, and a Logout button. The dates aren't decorative — clicking through carries them via URL params (and a sessionStorage fallback) through `fleet.html` into `booking.html`, prefilling the pickup/drop fields there.

Google sign-in creates the `users/{uid}` doc (role `customer`) only the first time an account signs in; on every later sign-in it deliberately doesn't touch `role`/`licenseStatus`/`aadharStatus` — `firestore.rules` blocks an owner from changing those on an update by design, so re-sending them would just fail. Logging out (from `profile.html` or the quick-book card) always returns to `index.html`, which flips back to the Google/login view automatically.

---

## Firestore Schema

- **`users/{uid}`** — `name`, `email`, `phone`, `age`, `role` (`customer` / `manager` / `admin`), `licenseURL`, `licenseStatus` (`not_submitted` / `pending` / `verified` / `rejected`), `aadharURL`, `aadharStatus`, `ipAddress`, `ipUpdatedAt`, `createdAt`.
- **`bookings/{id}`** — `userId`, `userName`, `userEmail`, `userPhone`, `vehicleReg`, `vehicleName`, `vehicleCategory`, `vehicleIcon`, `pickupDate`, `dropDate`, `days`, `withDriver`, `dayRate`, `driverRate`, `securityDeposit`, `totalAmount`, `status` (`pending_payment` / `confirmed` / `completed` / `cancelled`), `paymentStatus` (`unpaid` / `pending_verification` / `paid` / `rejected` / legacy `pay_at_pickup`), `paymentMethod` (`upi` / `bank_transfer`), `paymentRef`, `paymentScreenshotURL`, `paymentSubmittedAt`, `paymentVerifiedAt`, `paymentVerifiedBy`, `paymentRejectionReason`, `odometerKm`, `odometerUpdatedAt`, `returnInspection` (see below), `createdAt`.
- **`bookings/{id}.returnInspection`** — set once, when staff process the car's return via **Manager → Process Return** or **Admin → Bookings → Process Return**: `items` (array of `{ key, label, checked, amount }` — one entry per damage checklist item, e.g. scratch/dent/broken part/accident/interior/fuel/late return/other), `deductionTotal`, `depositRefund` (`securityDeposit - deductionTotal`, floored at 0), `notes` (free-text, shown to the customer on `bookings.html`), `processedAt`, `processedByUid`, `processedByName`. Saving this always sets `status: "completed"` at the same time — there's no separate "just mark completed" action anymore, so every completed booking has a return record. Whoever processes it (admin or manager), both panels show the same **View Return Report** action afterward — it's read from the booking doc, not scoped to whichever role wrote it — and reopening it shows who processed it and when.
- **`partner_cars/{id}`** — `userId`, `userEmail`, `brand`, `model`, `year`, `category`, `transmission`, `fuel`, `seats`, `priceDay`, `regNumber`, `insuranceStart`, `insuranceEnd`, `location`, `imageUrl`, `photos` (array of URLs, staff-uploaded — see below), `ownerName`, `ownerPhone`, `status` (`pending_approval` / `approved` / `rejected`), `createdAt`. The Admin Host Car Listings tab flags an expired `insuranceEnd` in red so it's caught before approval.
- **`contact_messages/{id}`** — `name`, `email`, `phone`, `subject`, `message`, `resolved`, `createdAt`. No UI to browse these yet — read them in the Firebase Console for now.

---

## Odometer Tracking

Admin's Bookings tab has an **Odometer (km)** field in each booking's expandable details panel — enter a reading and hit Save to record it on `bookings/{id}.odometerKm` / `odometerUpdatedAt`. This is separate from the static `odometer` spec shown on a vehicle's own detail page (`vehicle.html`, sourced from `js/vehicles.js`) — that one describes the car in general; this one is a per-booking reading staff record (e.g. at pickup or return) for mileage/usage tracking.

---

## Host Car Photos

Once a host's submitted car is **approved**, Admin's Host Car Listings tab shows an **Upload Photos** button (in place of the pending Approve/Reject buttons). Photos upload to Firebase Storage at `host_car_photos/{hostCarId}/` and are stored as a URL array on `partner_cars/{id}.photos`. The host sees them reflected back on their own `partner.html` under a **Your Car Listings** section (auto-shown once they have at least one submission), alongside their listing's live status. Only staff can write to this photos array or the storage path — a host can edit their own listing's other details but not upload here directly or self-approve their own listing (see the `firestore.rules` note on `partner_cars` for why that specific restriction exists).

---

## Return & Security Deposit Deductions

When a customer returns a car, staff (manager or admin) click **Process Return** on that booking, which opens a shared checklist (`js/return-inspection.js`, used identically from both `manager.html` and `admin.html`):

- Checkboxes for common damage types (scratch, dent, broken part, accident, interior damage/stains, missing fuel, late return, other), each with an editable ₹ deduction amount that only counts toward the total while its checkbox is checked.
- A live-computed summary: original deposit, total deductions, and refundable amount.
- An editable free-text "invoice notes" field, shown back to the customer.

Saving marks the booking `completed` and stores the whole breakdown on `bookings/{id}.returnInspection` — this is the permanent record of what was deducted and why. The customer sees the same itemized breakdown, notes, and refund amount on their `bookings.html`. Re-opening **Process Return** / **View Return Report** on an already-completed booking loads the saved state so staff can review or correct it.

This deliberately isn't wired to actually refund money automatically — like the UPI checkout, it's a record staff use to process the real-world refund (cash, UPI, bank transfer) themselves, not a payment gateway integration. `firestore.rules` blocks a customer from ever writing to their own `returnInspection`, `totalAmount`, or `securityDeposit` fields directly.

---

## Known limitations (be aware of these before you launch)

- **UPI payment verification is manual, not a live gateway.** See "UPI Checkout & Payment Verification" above — a staff member must approve every payment from the Admin Payments tab. Check that tab regularly (the badge on the Payments button shows how many are waiting).
- **No date-conflict checking on bookings.** `booking.js` checks a vehicle's static `available` flag, not whether it's already booked for overlapping dates. For a 35-car fleet with light traffic this is a manageable manual process (check `admin.html`'s bookings tab before confirming pickup), but if booking volume grows, add a Firestore query in `booking.js` that checks for overlapping `pending_payment`/`confirmed` bookings on the same `vehicleReg` before allowing a new one.
- **No inbox UI for contact messages.** They're saved reliably to Firestore (`contact_messages`) but there's no admin-panel tab to browse them yet — check Firebase Console, or add a tab to `admin.js`/`admin.html` following the same pattern as the Users/Bookings tabs.
- **New staff accounts** (manager/admin) can only be created by an existing admin from the Admin panel's Users tab, or by directly editing Firestore — there's intentionally no self-service path anymore.

---

## Theme & Styling

The visual theme (dark, `--bg`/`--card`/`--accent`/`--line`/`--radius`/`--shadow` CSS variables) lives entirely in `css/style.css`, with `css/animations.css` and `css/manager-dashboard.css` for page-specific pieces. No inline `<style>` blocks were added by this pass — everything reuses the existing design tokens.

---

## Pre-launch checklist

1. `js/firebase-init.js` points at your real Firebase project (not a placeholder).
2. Firestore rules deployed: `npx -y firebase-tools@latest deploy --only firestore:rules`.
3. Storage rules deployed: `npx -y firebase-tools@latest deploy --only storage:rules`.
4. Email/Password **and** Google sign-in both enabled in Firebase Console → Authentication (Google needs a support email set).
5. One admin account created (Step 5 above).
6. Hosting deployed: `npx -y firebase-tools@latest deploy --only hosting` (or your static host of choice).
7. `js/payment-config.js` has your real UPI ID (already set to `svcmerc00314092@svcbank`) and your real bank account details filled in (still `TODO` placeholders by default — fill these in if you want the Bank Transfer tab to be usable).
8. Check the Admin → Payments tab regularly to approve/reject incoming UPI/bank-transfer submissions — nothing confirms itself automatically.
