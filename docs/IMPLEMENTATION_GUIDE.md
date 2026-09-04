# JWT Authentication Migration Guide
## Firebase → Native JWT (Hostinger MySQL Backend)

This guide replaces all Firebase authentication with JWT tokens stored in MySQL.

---

## Phase 1: Database Preparation (5 minutes)

### 1. Run Migration SQL
Execute `migration_add_jwt_auth.sql` on your Hostinger MySQL database:

```bash
# Via SSH/PHPMyAdmin or command line:
mysql -h localhost -u u303150498_omkar -p'Pa$$@12123' u303150498_carRentpe < migration_add_jwt_auth.sql
```

**What it adds:**
- `password_hash` (VARCHAR 255) - bcrypt hashed passwords
- `refresh_token` (VARCHAR 1024) - JWT refresh tokens for rotation
- `last_login_at` (TIMESTAMP) - Track login history

### 2. Verify Schema
```sql
DESCRIBE users;
-- Should show new columns: password_hash, refresh_token, last_login_at
```

---

## Phase 2: Backend Deployment (15 minutes)

### 3. Update Configuration

**File: `api/config/config.php`**
- Replace with `build/config.php`
- **CRITICAL:** Set `JWT_SECRET` environment variable in production:
  ```bash
  # Generate a strong key (run this locally):
  php -r "echo bin2hex(random_bytes(32));"
  
  # Copy the output and set as environment variable on Hostinger:
  # Environment Variables: JWT_SECRET=<your_generated_key>
  ```

**Dev default key is for development only. Change immediately in production.**

### 4. Add New Services

**File: `api/services/JwtService.php`**
- Copy from `build/JwtService.php`
- No dependencies, pure PHP 8.x JWT with HMAC-SHA256

### 5. Update Middleware

**File: `api/middleware/auth.php`**
- Replace with `build/auth.php`
- Now uses `JwtService` instead of `FirebaseJwtService`
- Loads users from MySQL instead of Firebase

### 6. Update/Add Auth Endpoints

Replace or create these files in `api/auth/`:

- **register.php** → `build/register.php` (NEW)
  - POST /api/auth/register
  - Accepts: email, password, name
  - Returns: JWT tokens + user data
  
- **login.php** → `build/login.php` (NEW)
  - POST /api/auth/login
  - Accepts: email, password
  - Returns: JWT tokens + user data
  
- **refresh.php** → `build/refresh.php` (NEW)
  - POST /api/auth/refresh
  - Accepts: refreshToken
  - Returns: New accessToken
  
- **logout.php** → `build/logout.php` (NEW)
  - POST /api/auth/logout
  - Revokes refresh token, clears session
  
- **me.php** → `build/me.php` (UPDATED)
  - GET /api/auth/me
  - Returns: Current authenticated user

### 7. Remove Firebase Service

**Delete this file:**
- `api/services/FirebaseJwtService.php` (no longer needed)

### 8. Test Backend Endpoints

```bash
# Register
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'

# Should return:
{
  "success": true,
  "user": {...},
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 86400
  }
}

# Login
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# Get current user
curl -X GET http://localhost/api/auth/me \
  -H "Authorization: Bearer eyJ..."
```

---

## Phase 3: Frontend Migration (20 minutes)

### 9. Update Authentication Module

**File: `js/auth.js`**
- Replace with `build/auth.js`
- Key exports: `login()`, `register()`, `logout()`, `getCurrentUser()`, `isLoggedIn()`
- No Firebase dependency, pure API calls

### 10. Remove Firebase Initialization

**Delete or disable:**
- `js/firebase-init.js` - Not needed anymore
- Remove from HTML: `<script src="/js/firebase-init.js"></script>`

### 11. Update All Pages That Use Auth

**In HTML files (index.html, profile.html, booking.html, etc.):**

Remove:
```html
<script src="/js/firebase-init.js"></script>
```

Keep the auth script import:
```html
<script type="module">
  import { isLoggedIn, getCurrentUser } from './js/auth.js';
  
  if (isLoggedIn()) {
    const user = getCurrentUser();
    console.log('Logged in as:', user.email);
  }
</script>
```

### 12. Update Components Using Auth

**Files that need updating:**

1. **js/admin.js** - Remove Firebase auth calls, use new auth module
2. **js/manager.js** - Same as above
3. **js/partner.js** - Same as above
4. **js/profile.js** - Same as above

**Pattern change:**
```javascript
// OLD (Firebase)
import { auth } from './firebase-init.js';
auth.onAuthStateChanged((user) => { ... });

// NEW (JWT)
import { isLoggedIn, getCurrentUser } from './auth.js';
if (isLoggedIn()) {
  const user = getCurrentUser();
  // ...
}
```

### 13. Update API Calls

**All API calls now use JWT tokens automatically:**

```javascript
// OLD (Firebase)
const idToken = await auth.currentUser.getIdToken();
const response = await fetch('/api/vehicles', {
  headers: { 'Authorization': `Bearer ${idToken}` }
});

// NEW (JWT)
// The auth.js module handles this automatically
import { apiCall } from './auth.js';
const response = await apiCall('GET', '/vehicles');
```

### 14. Test Frontend Authentication

1. **Clear browser storage:**
   ```javascript
   // In browser console
   localStorage.clear();
   sessionStorage.clear();
   ```

2. **Test signup:**
   - Go to registration page
   - Fill form with test email/password
   - Verify tokens are stored in localStorage
   - Check `localStorage.getItem('kruizly_tokens')`

3. **Test login:**
   - Go to login page
   - Enter credentials
   - Verify redirect to profile/dashboard

4. **Test protected routes:**
   - Try accessing `/profile.html` without login
   - Should redirect to login with `?next=` parameter

5. **Test token refresh:**
   - Manually expire access token in localStorage
   - Try calling protected endpoint
   - Should auto-refresh using refresh token

---

## Phase 4: Admin Panels (10 minutes)

### 15. Update Admin Dashboard Access

**Files: admin.html, manager.html, executive.html**

Replace Firebase role checks with JWT role in token:

```javascript
// OLD
if (user.customClaims?.role === 'admin') { ... }

// NEW
import { getCurrentUser } from './js/auth.js';
const user = getCurrentUser();
if (user?.role === 'admin') { ... }
```

### 16. Update Admin API Calls

All endpoints already check `Auth::requireRole()` in PHP backend.

Add role enforcement in `api/middleware/auth.php` (already in build/auth.php):

```php
// Example: admin.php now enforces
Auth::requireRole('admin');
```

---

## Phase 5: Existing Users Migration (Optional)

### 17. Migrate Firebase Users to MySQL

**For existing Firebase users, create migration script:**

```php
<?php
// api/scripts/migrate_firebase_users.php

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../services/JwtService.php';

// Get all users currently in MySQL
$users = Database::fetchAll("SELECT * FROM users WHERE password_hash IS NULL");

foreach ($users as $user) {
  // Option 1: Force password reset on next login
  // Just leave password_hash NULL
  
  // Option 2: Send migration email
  // Tell users to reset password at /forgot-password
  
  // Option 3: Generate temporary password
  // $tempPass = bin2hex(random_bytes(8));
  // Database::execute("UPDATE users SET password_hash = ? WHERE id = ?", 
  //   [password_hash($tempPass, PASSWORD_BCRYPT), $user['id']]);
  // // Send email with temp password
}
?>
```

**Recommended:** Force password reset for security.

---

## Deployment Checklist

- [ ] Database migration SQL executed
- [ ] `api/config/config.php` updated with JWT_SECRET env var
- [ ] `api/services/JwtService.php` added
- [ ] `api/middleware/auth.php` replaced
- [ ] All 5 auth endpoints in place (register, login, logout, refresh, me)
- [ ] `api/services/FirebaseJwtService.php` deleted
- [ ] `js/auth.js` replaced
- [ ] `js/firebase-init.js` removed or disabled from HTML
- [ ] All admin panels updated (admin.js, manager.js, partner.js)
- [ ] Backend endpoints tested via curl
- [ ] Frontend login/register tested in browser
- [ ] Protected routes tested
- [ ] Token refresh tested
- [ ] Existing users have plan for password migration

---

## Rollback Plan

If something breaks:

1. **Revert database:**
   ```sql
   ALTER TABLE users DROP COLUMN password_hash, DROP COLUMN refresh_token, DROP COLUMN last_login_at;
   ```

2. **Restore old config and auth middleware**

3. **Re-enable Firebase in frontend**

---

## Troubleshooting

### "Invalid or expired authentication token"
- Check JWT_SECRET matches between config.php and environment
- Verify token in Bearer header is not truncated
- Check token expiration time

### "User not found"
- Ensure user was created with `register.php`
- Check database users table has the record

### Tokens not persisting in localStorage
- Check browser DevTools → Application → Local Storage
- Verify `kruizly_tokens` and `kruizly_user` keys exist
- Check if private browsing mode is enabled (clears storage)

### Admin panel access denied
- Verify user.role in localStorage matches database
- Check Auth::requireRole() in PHP endpoint
- Ensure admin email is in ADMIN_EMAILS array in config.php

---

## Production Deployment Notes

1. **Set strong JWT_SECRET** (not the dev default)
2. **Use HTTPS only** (tokens in Authorization header)
3. **Implement token rotation** in refresh.php (already done)
4. **Monitor user login attempts** (optional: track in db)
5. **Set appropriate CORS headers** (already in middleware/cors.php)
6. **Consider rate limiting** on auth endpoints (/api/auth/login, /api/auth/register)

---

## What's Now Possible

✅ Zero Firebase dependency
✅ Full user control via MySQL
✅ Token rotation & refresh
✅ Role-based access control
✅ Audit logs (track refresh_token updates)
✅ Passwordless auth (add later without Firebase)
✅ 2FA/MFA (add later without Firebase)
✅ Custom password policies
✅ Account lockout on failed attempts
