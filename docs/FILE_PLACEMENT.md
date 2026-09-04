# File Placement Guide

Copy files from `build/` directory to your Car-Rental project in this structure:

```
Car-Rental-main/
├── api/
│   ├── config/
│   │   ├── config.php                    ← REPLACE with build/config.php
│   │   └── database.php                  (no changes, keep as-is)
│   │
│   ├── middleware/
│   │   ├── auth.php                      ← REPLACE with build/auth.php
│   │   └── cors.php                      (no changes, keep as-is)
│   │
│   ├── services/
│   │   ├── JwtService.php                ← NEW from build/JwtService.php
│   │   ├── FirebaseJwtService.php        ← DELETE THIS FILE
│   │   ├── MailService.php               (keep as-is)
│   │   ├── FileStorageService.php        (keep as-is)
│   │   └── InvoicePdfService.php         (keep as-is)
│   │
│   ├── auth/
│   │   ├── register.php                  ← NEW from build/register.php
│   │   ├── login.php                     ← NEW from build/login.php
│   │   ├── refresh.php                   ← NEW from build/refresh.php
│   │   ├── logout.php                    ← NEW from build/logout.php
│   │   └── me.php                        ← REPLACE with build/me.php
│   │
│   ├── users/                            (all keep as-is, they use Auth::requireAuth())
│   ├── bookings/                         (all keep as-is)
│   ├── vehicles/                         (all keep as-is)
│   ├── admin/                            (all keep as-is)
│   └── ...other endpoints...
│
├── js/
│   ├── auth.js                           ← REPLACE with build/auth.js
│   ├── firebase-init.js                  ← DELETE or DISABLE
│   ├── admin.js                          (REVIEW & UPDATE - remove Firebase auth calls)
│   ├── manager.js                        (REVIEW & UPDATE - remove Firebase auth calls)
│   ├── partner.js                        (REVIEW & UPDATE - remove Firebase auth calls)
│   ├── profile.js                        (REVIEW & UPDATE - remove Firebase auth calls)
│   └── ...other files...                 (keep as-is)
│
├── database/
│   ├── schema.sql                        (keep as-is, schema is complete)
│   ├── seed_production.sql               (keep as-is)
│   └── migrate_from_json.php             (keep as-is)
│
├── api-migrations/                       ← NEW FOLDER (optional, for version tracking)
│   └── 2025-09-03-jwt-auth-migration.sql ← build/migration_add_jwt_auth.sql
│
├── docs/
│   ├── IMPLEMENTATION_GUIDE.md           ← NEW from build/IMPLEMENTATION_GUIDE.md
│   ├── MIGRATION_SUMMARY.md              ← NEW from build/MIGRATION_SUMMARY.md
│   └── ...existing docs...               (keep as-is)
│
├── index.html                            (EDIT: remove <script src="/js/firebase-init.js">)
├── profile.html                          (EDIT: remove <script src="/js/firebase-init.js">)
├── booking.html                          (EDIT: remove <script src="/js/firebase-init.js">)
├── bookings.html                         (EDIT: remove <script src="/js/firebase-init.js">)
├── admin.html                            (EDIT: remove <script src="/js/firebase-init.js">)
├── manager.html                          (EDIT: remove <script src="/js/firebase-init.js">)
├── executive.html                        (EDIT: remove <script src="/js/firebase-init.js">)
├── partner.html                          (EDIT: remove <script src="/js/firebase-init.js">)
└── ...other HTML files...                (EDIT: remove firebase-init.js if present)

.env (NOT IN GIT, local only)
├── JWT_SECRET=<your_generated_key>
├── DB_HOST=...
├── DB_USER=...
├── DB_PASS=...
└── ...other vars...
```

---

## Step-by-Step Checklist

### Backend Files
- [ ] Copy `build/config.php` → `api/config/config.php` (REPLACE)
- [ ] Copy `build/auth.php` → `api/middleware/auth.php` (REPLACE)
- [ ] Copy `build/JwtService.php` → `api/services/JwtService.php` (NEW)
- [ ] Copy `build/register.php` → `api/auth/register.php` (NEW)
- [ ] Copy `build/login.php` → `api/auth/login.php` (NEW)
- [ ] Copy `build/refresh.php` → `api/auth/refresh.php` (NEW)
- [ ] Copy `build/logout.php` → `api/auth/logout.php` (NEW)
- [ ] Copy `build/me.php` → `api/auth/me.php` (REPLACE)
- [ ] DELETE `api/services/FirebaseJwtService.php`

### Database
- [ ] Run `build/migration_add_jwt_auth.sql` on Hostinger MySQL

### Frontend
- [ ] Copy `build/auth.js` → `js/auth.js` (REPLACE)
- [ ] DELETE or comment out `js/firebase-init.js`
- [ ] Review & update `js/admin.js` (remove Firebase auth calls)
- [ ] Review & update `js/manager.js` (remove Firebase auth calls)
- [ ] Review & update `js/partner.js` (remove Firebase auth calls)
- [ ] Review & update `js/profile.js` (remove Firebase auth calls)

### HTML Files
Remove this line from ALL HTML files that have it:
```html
<script src="/js/firebase-init.js"></script>
```

Files to check:
- [ ] index.html
- [ ] profile.html
- [ ] booking.html
- [ ] bookings.html
- [ ] admin.html
- [ ] manager.html
- [ ] executive.html
- [ ] partner.html
- [ ] contact.html
- [ ] fleet.html

### Configuration
- [ ] Update `.env` file with `JWT_SECRET=<generated_key>`
- [ ] Update Hostinger environment variables panel with `JWT_SECRET`

### Documentation
- [ ] Copy `build/IMPLEMENTATION_GUIDE.md` → `docs/IMPLEMENTATION_GUIDE.md`
- [ ] Copy `build/MIGRATION_SUMMARY.md` → `docs/MIGRATION_SUMMARY.md`

### Testing
- [ ] Test register endpoint via curl
- [ ] Test login endpoint via curl
- [ ] Test protected endpoint (GET /api/auth/me)
- [ ] Test frontend signup
- [ ] Test frontend login
- [ ] Test token storage in localStorage
- [ ] Test protected page redirect (not logged in)
- [ ] Test admin panel access
- [ ] Test token refresh (manually expire token)
- [ ] Test logout

### Deployment
- [ ] Commit to git (or save for manual upload)
- [ ] Test in staging environment
- [ ] Run database migration
- [ ] Deploy backend files
- [ ] Deploy frontend files
- [ ] Verify endpoints are accessible
- [ ] Monitor error logs for issues

---

## Files NOT To Touch (Already Working)

These files work with the new auth middleware without changes:

```
✅ Keep as-is:
- api/config/database.php
- api/middleware/cors.php
- api/users/*
- api/bookings/*
- api/vehicles/*
- api/admin/*
- api/payments/*
- api/coupons/*
- api/verification/*
- api/invoices/*
- api/media/*
- database/schema.sql
- database/seed_production.sql
- css/* (all CSS is fine)
- js/booking.js
- js/fleet.js
- js/vehicles.js
- js/payment.js
- js/contact.js
- js/coupon-service.js
- ...and all other JS files not listed above
```

These endpoints use `Auth::requireAuth()` which now works with JWT instead of Firebase. No changes needed.

---

## Quick Copy Commands (Linux/Mac)

```bash
# Copy backend files
cp build/config.php api/config/config.php
cp build/auth.php api/middleware/auth.php
cp build/JwtService.php api/services/JwtService.php
cp build/register.php api/auth/register.php
cp build/login.php api/auth/login.php
cp build/refresh.php api/auth/refresh.php
cp build/logout.php api/auth/logout.php
cp build/me.php api/auth/me.php

# Remove Firebase service
rm api/services/FirebaseJwtService.php

# Copy frontend
cp build/auth.js js/auth.js

# Copy docs
cp build/IMPLEMENTATION_GUIDE.md docs/
cp build/MIGRATION_SUMMARY.md docs/

# Run SQL migration
mysql -h DB_HOST -u DB_USER -p DB_NAME < build/migration_add_jwt_auth.sql
```

---

## Verify After Deployment

```bash
# Check endpoints exist
curl http://localhost/api/auth/register -I
curl http://localhost/api/auth/login -I
curl http://localhost/api/auth/me -I

# Test register
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test"}'

# Should return 201 with tokens if successful
```

---

## Support

If file structure questions arise:
- Refer to `IMPLEMENTATION_GUIDE.md` (detailed step-by-step)
- Refer to `MIGRATION_SUMMARY.md` (high-level overview)
- Check `FILE_PLACEMENT.md` (this file, for quick reference)
