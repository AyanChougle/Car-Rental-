# KRUIZLY JWT AUTH MIGRATION PACKAGE

## What's In This Package

Complete Firebase → JWT migration for your car rental platform.

**Inside:** 8 PHP files, 1 JS file, 1 SQL migration, 4 guides.

---

## 📋 Start Here

1. **First time?** → Read `QUICKSTART.md` (5 min)
2. **Need details?** → Read `IMPLEMENTATION_GUIDE.md` (15 min)
3. **Understanding changes?** → Read `MIGRATION_SUMMARY.md` (10 min)
4. **Ready to copy files?** → Follow `FILE_PLACEMENT.md`

---

## 🎯 What This Does

### Before
- Firebase manages auth tokens
- Firebase manages users
- Multiple sources of truth

### After
- Your MySQL database manages everything
- JWT tokens generated server-side
- Zero Firebase dependency
- Full control over authentication

---

## 📦 Files Included

### Core (PHP Backend)
- `JwtService.php` — JWT generation & verification
- `config.php` — Updated configuration (JWT_SECRET)
- `auth.php` — Updated middleware (JWT instead of Firebase)

### Auth Endpoints (5 new)
- `register.php` — User signup
- `login.php` — User login
- `refresh.php` — Token refresh
- `logout.php` — Token revocation
- `me.php` — Current user info

### Frontend (JavaScript)
- `auth.js` — Pure API-based auth (no Firebase SDK)

### Database
- `migration_add_jwt_auth.sql` — Add auth columns to users table

### Documentation
- `QUICKSTART.md` — TL;DR version (you are here)
- `IMPLEMENTATION_GUIDE.md` — Step-by-step walkthrough
- `MIGRATION_SUMMARY.md` — What changed & why
- `FILE_PLACEMENT.md` — Exact file locations & structure

---

## ⚡ Quick Timeline

| Step | Time | What |
|------|------|------|
| 1 | 5 min | Run SQL migration on Hostinger |
| 2 | 5 min | Copy 8 PHP files to api/ |
| 3 | 5 min | Copy auth.js to js/ |
| 4 | 5 min | Set JWT_SECRET env variable |
| 5 | 5 min | Test endpoints with curl |
| **Total** | **~25 min** | **Live with JWT auth** |

---

## 🔑 Key Points

### Tokens
- **Access Token:** 24 hours (for using the app)
- **Refresh Token:** 7 days (for getting new access tokens)
- **Both:** HMAC-SHA256 signed, cannot be forged

### Users
- **Passwords:** Bcrypt hashed (cost 12, industry standard)
- **Storage:** All in your MySQL database
- **No Firebase needed:** Ever

### APIs
- **New endpoints:** /api/auth/register, /api/auth/login, etc.
- **Old endpoints:** /api/users/*, /api/bookings/*, etc. unchanged
- **All protected:** Use Auth::requireAuth() automatically

### Frontend
- **Old:** `import { auth } from './firebase-init.js'`
- **New:** `import { login } from './js/auth.js'`
- **Tokens:** Auto-included in Authorization header

---

## 🚀 Deployment

```bash
# 1. Extract this package
unzip Kruizly-JWT-Auth-Migration.zip

# 2. Run database migration
mysql -h <host> -u <user> -p<pass> <db> < build/migration_add_jwt_auth.sql

# 3. Copy backend files
cp build/config.php api/config/config.php
cp build/auth.php api/middleware/auth.php
cp build/JwtService.php api/services/JwtService.php
cp build/register.php api/auth/register.php
cp build/login.php api/auth/login.php
cp build/refresh.php api/auth/refresh.php
cp build/logout.php api/auth/logout.php
cp build/me.php api/auth/me.php

# 4. Remove old Firebase service
rm api/services/FirebaseJwtService.php

# 5. Copy frontend
cp build/auth.js js/auth.js
rm js/firebase-init.js  # (or comment out from HTML)

# 6. Set environment variable (Hostinger control panel)
JWT_SECRET=<generate: php -r "echo bin2hex(random_bytes(32));">

# 7. Test
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

---

## ✅ What You Get

| Feature | Before | After |
|---------|--------|-------|
| Auth Source | Firebase | MySQL + JWT |
| Token Generation | Firebase | Your server |
| User Control | Limited | Full |
| Password Hashing | N/A | Bcrypt |
| Token Refresh | N/A | Automatic |
| Session Revocation | No | Yes |
| Custom Workflows | Difficult | Easy |
| 2FA/MFA | Need Firebase | Build yourself |
| Audit Logs | Not available | Build yourself |
| SSO/OAuth | Need Firebase | Add yourself |

---

## 🔒 Security

✅ **Passwords:** Bcrypt hashed, never stored plaintext
✅ **Tokens:** HMAC-SHA256 signed, verifiable
✅ **Refresh:** Separate from access token (rotation)
✅ **Expiry:** Auto-rejected after TTL
✅ **Database:** Single source of truth
✅ **No external dependency:** No Firebase outages affect auth

---

## 🚦 Existing Users

Old users with Firebase auth need password reset:

1. **First login attempt** → Redirect to forgot-password
2. **Set password** → Hash stored in database
3. **Auto-login** → Get JWT tokens

Or: Email them temp password → they change it on first login.

---

## 📚 Next Steps

1. **Open QUICKSTART.md** for TL;DR
2. **Follow FILE_PLACEMENT.md** for exact locations
3. **Use IMPLEMENTATION_GUIDE.md** if you hit issues
4. **Reference MIGRATION_SUMMARY.md** to understand changes

---

## ⚠️ Important Notes

- **JWT_SECRET** must be strong in production (not the dev key)
- **Database migration** must run before deploying endpoints
- **Firebase removal** from HTML files is critical
- **Token lifetime** is configurable (currently 24h access, 7d refresh)
- **Admin panels** need update (remove Firebase role checks)

---

## 🆘 Troubleshooting

**"Invalid token"**
→ JWT_SECRET mismatch
→ Check Hostinger env vars match your config

**"User not found"**
→ Database columns not added
→ Run migration_add_jwt_auth.sql

**"Access denied" on admin**
→ User role not in JWT
→ Check database user.role field

**Frontend won't login**
→ firebase-init.js still loading
→ Remove script tag from HTML

---

## 📞 Support Strategy

If things break:

1. Check error logs (Hostinger error.log)
2. Verify database migration ran
3. Verify JWT_SECRET is set
4. Test endpoints with curl
5. Check localStorage for tokens
6. Reference IMPLEMENTATION_GUIDE.md

Full rollback: Revert 8 PHP files and auth.js back to Firebase versions.

---

## 🎓 What's Next (After Auth Works)

Once this is live, you can easily add:

- **2FA:** Email/SMS codes (no Firebase needed)
- **Passwordless:** Magic links (send email, click, auto-login)
- **OAuth:** Google/GitHub login (your own implementation)
- **Invites:** Special registration links
- **Audit:** Log all auth events
- **Rate limiting:** Throttle login attempts
- **Sessions:** Show "active devices" to users
- **API Keys:** Let users generate credentials

All under your control. Firebase-free.

---

**Version:** 1.0
**Date:** September 2025
**Status:** Production Ready
**License:** For KRUIZLY use only

---

**Questions?** Check the four guides in this package. Everything is documented.
