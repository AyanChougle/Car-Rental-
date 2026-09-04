# Auth Migration Summary: Firebase → JWT + MySQL

## The Problem (Before)
Your app was split between two systems:
- **User data** lived in MySQL (users table)
- **Auth tokens** came from Firebase (external dependency)
- **Auth roles** stored both in Firebase AND MySQL (sync nightmare)
- **Result:** Firebase dependency for every request, complex token verification

---

## The Solution (After)
Single source of truth: MySQL database
- **Tokens generated** by your backend (JWT with HS256)
- **User data** in MySQL (including password hashes)
- **Auth roles** only in MySQL
- **Result:** Complete control, zero Firebase dependency

---

## Files Added

### Backend (PHP)
1. **`api/services/JwtService.php`** (NEW)
   - Pure PHP JWT generation & verification
   - No external dependencies
   - HMAC-SHA256 signing

2. **`api/auth/register.php`** (NEW)
   - User signup endpoint
   - Hashes password with bcrypt
   - Returns JWT tokens

3. **`api/auth/login.php`** (NEW)
   - Login endpoint
   - Verifies password
   - Returns JWT tokens + refresh token

4. **`api/auth/refresh.php`** (NEW)
   - Token rotation endpoint
   - Takes refresh token, returns new access token

5. **`api/auth/logout.php`** (NEW)
   - Revokes refresh token
   - Clears session

6. **`api/auth/me.php`** (UPDATED)
   - Fetch current user
   - Replaces old Firebase-dependent version

### Frontend (JavaScript)
7. **`js/auth.js`** (UPDATED)
   - Pure API-based authentication
   - No Firebase SDK
   - Token storage & refresh logic
   - Exports: login, register, logout, getCurrentUser, isLoggedIn

### Configuration
8. **`api/config/config.php`** (UPDATED)
   - Removed: FIREBASE_PROJECT_ID
   - Added: JWT_SECRET (environment variable)
   - Added: ADMIN_EMAILS, JWT_ACCESS_TOKEN_TTL, JWT_REFRESH_TOKEN_TTL

9. **`api/middleware/auth.php`** (UPDATED)
   - Removed: FirebaseJwtService dependency
   - Added: JwtService dependency
   - Same Auth::requireAuth() and Auth::requireRole() API

---

## Files Deleted

- **`api/services/FirebaseJwtService.php`** ❌
  - No longer needed, replaced by JwtService
- **`js/firebase-init.js`** ❌
  - Remove from HTML files

---

## Database Changes

```sql
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN refresh_token VARCHAR(1024);
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
```

Existing users will have `password_hash = NULL` until they reset password.

---

## API Changes

### New Endpoints
```
POST   /api/auth/register       → signup (email, password, name)
POST   /api/auth/login          → signin (email, password)
POST   /api/auth/refresh        → get new access token
POST   /api/auth/logout         → revoke refresh token
GET    /api/auth/me             → fetch current user
```

### Token Format (JWT)
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE2MjU4Njc1MjAsImV4cCI6MTYyNTk1MzkyMCwic3ViIjoiMSIsImVtYWlsIjoiYWRtaW5Aa3J1aXpseSIsInJvbGUiOiJhZG1pbiJ9.xyz...
```

Payload includes:
- `iat` - issued at time
- `exp` - expiration time
- `sub` - user ID
- `email` - user email
- `role` - user role

### Token Lifecycle
1. User logs in → get access token (24h) + refresh token (7d)
2. Access token expires → call /api/auth/refresh with refresh token
3. New access token generated
4. Refresh token rotated (optional, for security)

---

## Frontend Changes

### Before (Firebase)
```javascript
import { auth } from './firebase-init.js';
auth.signInWithEmailAndPassword(email, password);
auth.onAuthStateChanged((user) => { ... });
```

### After (JWT)
```javascript
import { login, isLoggedIn, getCurrentUser } from './js/auth.js';
await login(email, password);
if (isLoggedIn()) { 
  const user = getCurrentUser(); 
}
```

All API calls automatically include Bearer token in Authorization header.

---

## Admin Panels Impact

### Before
- Checked `user.customClaims.role` from Firebase
- Auth state from Firebase SDK

### After
- Check `getCurrentUser().role` from JWT payload
- Auth state from localStorage + JWT validation

**All authorization endpoints (`api/admin/*`, `api/users/*`, etc.) already validate `Auth::requireRole()` on backend** — no changes needed to endpoint logic.

---

## Security Improvements

✅ **Bcrypt password hashing** (instead of plain Firebase auth)
✅ **JWT token rotation** (refresh tokens are separate)
✅ **Rate limiting possible** (track failed logins)
✅ **Audit trail possible** (log password changes, token usage)
✅ **Custom password policies** (no Firebase limitations)
✅ **MFA/2FA can be added** (without Firebase)
✅ **Session revocation** (clear refresh token)
✅ **No dependency on Firebase availability**

---

## Migration Path for Existing Users

### Option 1: Force Password Reset (Recommended)
- Existing users with `password_hash = NULL`
- On next login attempt → redirect to forgot-password
- Reset password → set password_hash → auto-login

### Option 2: Generate Temporary Password
- Email existing users with one-time password
- They log in with temp password
- Change to permanent password

### Option 3: Federated Login (Delayed)
- Keep Firebase for existing users initially
- New users only use JWT
- Migrate in batches as users reset passwords

---

## Environment Variables to Set (Production)

```bash
JWT_SECRET=<generate_with: php -r "echo bin2hex(random_bytes(32));">
DB_HOST=your_hostinger_db_host
DB_USER=your_hostinger_db_user
DB_PASS=your_hostinger_db_password
DB_NAME=your_hostinger_db_name
SMTP_USER=your_email
SMTP_PASS=your_app_password
```

---

## Deployment Order

1. **Run SQL migration** (add columns)
2. **Deploy PHP files** (backend endpoints)
3. **Deploy frontend auth.js**
4. **Remove firebase-init.js from HTML**
5. **Update admin panels** (admin.js, manager.js, etc.)
6. **Test all auth flows** in production
7. **Monitor logs** for errors
8. **Gradually migrate existing users** (password reset)

---

## Rollback

If critical issues:
1. Revert config.php to use FirebaseJwtService
2. Delete new auth endpoints
3. Revert auth.js to use Firebase
4. Restart app

Existing data is safe — no destructive changes made.

---

## What You Can Now Do

🚀 Build passwordless auth (email links)
🚀 Add 2FA/MFA (TOTP, SMS)
🚀 Implement SSO (OAuth providers)
🚀 Custom user workflows (approval, invites)
🚀 Audit logs (track all auth events)
🚀 Session management (active devices list)
🚀 API key generation (for programmatic access)
🚀 Webhook events (user signed up, logged in, etc.)

All without Firebase limitations.
