# JWT Auth Migration - Quick Start (30 Minutes)

## You're Here
Your app needs auth migration from Firebase to native JWT. This package has everything.

---

## What You're Getting

✅ JWT Service (pure PHP, no Firebase)
✅ 5 New Auth Endpoints (register, login, logout, refresh, me)
✅ Updated Frontend Auth (no Firebase SDK)
✅ Complete Implementation Guide
✅ Database Migration SQL

**Result:** Firebase-free auth, 100% under your control.

---

## The Fastest Path (TL;DR)

### 1. Database (5 min)
```bash
# Run this SQL on Hostinger MySQL:
# File: build/migration_add_jwt_auth.sql

ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN refresh_token VARCHAR(1024);
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
```

### 2. Backend Files (5 min)
Copy these 8 files to your project:

```
build/config.php → api/config/config.php (REPLACE)
build/auth.php → api/middleware/auth.php (REPLACE)
build/JwtService.php → api/services/JwtService.php (NEW)
build/register.php → api/auth/register.php (NEW)
build/login.php → api/auth/login.php (NEW)
build/refresh.php → api/auth/refresh.php (NEW)
build/logout.php → api/auth/logout.php (NEW)
build/me.php → api/auth/me.php (REPLACE)
```

Delete:
```
api/services/FirebaseJwtService.php
```

### 3. Frontend (5 min)
```
build/auth.js → js/auth.js (REPLACE)
```

Remove from ALL HTML files:
```html
<!-- DELETE THIS LINE from every HTML file -->
<script src="/js/firebase-init.js"></script>
```

Delete:
```
js/firebase-init.js
```

### 4. Environment Setup (5 min)
```bash
# Generate strong key (run locally):
php -r "echo bin2hex(random_bytes(32));"

# Output: abc123def456...
# Set in Hostinger control panel:
# Settings → Environment Variables
# JWT_SECRET=abc123def456...
```

### 5. Test (5 min)
```bash
# Register
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@kruizly.com",
    "password": "Test1234",
    "name": "Test User"
  }'

# Should return:
{
  "success": true,
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 86400
  }
}
```

If you get that → **You're done.** Go live.

---

## Common Issues & Fixes

### "Undefined constant JWT_SECRET"
→ You didn't set the environment variable
→ Check Hostinger control panel, set JWT_SECRET

### "Invalid token" after login
→ dev_key_change_in_production_immediately is the default
→ You need to set real JWT_SECRET in production

### "User not found" after register
→ Database columns not added
→ Run migration_add_jwt_auth.sql

### Frontend not logging in
→ firebase-init.js still loading
→ Remove the script tag from HTML files

### Admin panel shows "Access denied"
→ Check user.role in localStorage
→ Verify user has admin role in database

---

## What Changed

### APIs Now Available
```
POST /api/auth/register     ← New signup
POST /api/auth/login        ← New login
POST /api/auth/logout       ← New logout
POST /api/auth/refresh      ← Refresh token
GET  /api/auth/me          ← Current user
```

### Old Firebase Auth
```
❌ Gone: /api/auth/me (Firebase-based)
❌ Gone: firebase-init.js
❌ Gone: Firebase SDK calls
```

### New JWT Auth
```
✅ New: Pure PHP JWT generation
✅ New: Bcrypt password hashing
✅ New: Token refresh system
✅ New: API-based (no SDK)
```

---

## Frontend Code Changes

### Before
```javascript
import { auth } from './firebase-init.js';
auth.signInWithEmailAndPassword(email, pwd);
```

### After
```javascript
import { login } from './js/auth.js';
await login(email, pwd);
```

That's it. All API calls auto-include the JWT token.

---

## Admin Panels (Update Required)

Open these files and look for Firebase auth:
- `js/admin.js`
- `js/manager.js`
- `js/partner.js`

Find & replace:
```javascript
// OLD
if (user.customClaims?.role === 'admin') { ... }

// NEW
import { getCurrentUser } from './auth.js';
const user = getCurrentUser();
if (user?.role === 'admin') { ... }
```

The backend endpoints (`/api/admin/*`, etc.) already enforce roles with `Auth::requireRole()`. Frontend just needs to check the JWT payload.

---

## Production Deployment Order

1. Run SQL migration
2. Deploy backend files (upload 8 PHP files)
3. Deploy frontend files (upload auth.js)
4. Update HTML files (remove firebase-init.js)
5. Set JWT_SECRET environment variable
6. Test all auth flows
7. Monitor logs for errors
8. Gradually migrate existing users (password reset)

---

## Token Expiry & Refresh

Access token: **24 hours** (valid for 1 day of use)
Refresh token: **7 days** (valid for renewing access token)

When access token expires:
1. Frontend auto-calls `/api/auth/refresh`
2. Sends refresh token
3. Gets new access token
4. Continues working

User doesn't notice anything.

---

## For Existing Users

They have `password_hash = NULL` in the database.

Options:
1. **Force password reset** (security-first, recommended)
   - Try login → redirect to forgot-password
   - Set password → auto-login

2. **Email with temp password** (user-friendly)
   - Generate temp password
   - Email it to them
   - They log in and change it

3. **Keep Firebase temporarily**
   - Some users via JWT, others via Firebase
   - Migrate in batches

Recommended: Option 1 (force reset for security).

---

## Security Notes

✅ JWT_SECRET is NOT the dev key in production
✅ Passwords are bcrypt hashed (cost=12)
✅ Tokens are HMAC-SHA256 signed
✅ Refresh tokens are single-use (rotated)
✅ Expired tokens are rejected
✅ Account lockouts can be added later

---

## What You Can Build Now

After this migration, you can add:
- 2FA/MFA (email, SMS, TOTP)
- Passwordless login (email links)
- OAuth (Google, GitHub, etc.)
- SSO (SAML)
- API keys (programmatic access)
- Audit logs (track all auth events)
- Session management (active devices)
- Custom workflows (approvals, invites)

All without Firebase. Full control.

---

## Need Help?

1. Read `IMPLEMENTATION_GUIDE.md` (step-by-step)
2. Read `MIGRATION_SUMMARY.md` (high-level overview)
3. Read `FILE_PLACEMENT.md` (file structure)
4. Check error logs on Hostinger
5. Test endpoints with curl first

---

## Files in This Package

```
build/
├── JwtService.php                ← Token generation & verification
├── config.php                    ← Config with JWT_SECRET
├── auth.php                      ← JWT-based middleware
├── register.php                  ← Signup endpoint
├── login.php                     ← Login endpoint
├── refresh.php                   ← Token refresh endpoint
├── logout.php                    ← Logout endpoint
├── me.php                        ← Current user endpoint
├── auth.js                       ← Frontend auth module
├── migration_add_jwt_auth.sql    ← Database schema update
├── QUICKSTART.md                 ← This file
├── IMPLEMENTATION_GUIDE.md       ← Detailed steps
├── MIGRATION_SUMMARY.md          ← What changed & why
└── FILE_PLACEMENT.md             ← Where to copy files
```

---

## Time Estimate

- **Experienced dev:** 20-30 minutes
- **First time:** 45-60 minutes
- **With existing Firebase users:** Add 30 minutes for migration strategy

---

## You're Ready

1. Extract this package
2. Follow FILE_PLACEMENT.md
3. Run migration SQL
4. Copy files
5. Test
6. Deploy
7. Monitor logs

Done. Firebase gone. JWT auth working.

✅ Zero Firebase dependency
✅ Full control over auth
✅ Ready to scale
