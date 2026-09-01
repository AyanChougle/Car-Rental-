# Hostinger Deployment Guide — KRUIZLY Production Architecture

This guide explains how to deploy KRUIZLY to Hostinger without Node.js, PM2, or any local computer dependencies.

---

## 1. Architecture Summary

- **Frontend**: Vanilla HTML / CSS / JavaScript served by LiteSpeed / Apache.
- **Authentication**: Firebase Authentication (Google Sign-In, Email/Password).
- **Backend API**: PHP 8.x REST API inside `/api/` (using PDO prepared statements and pure PHP RS256 JWT verification).
- **Database**: Hostinger MySQL (`schema.sql` + `seed_production.sql`).
- **File Storage**: Hostinger server filesystem inside `/storage/` (protected by `.htaccess`).
- **Invoices**: Pure PHP PDF Generator & SMTP Emailer.

---

## 2. Step-by-Step Hostinger Deployment

### Step 1: Create Hostinger MySQL Database
1. Log in to Hostinger hPanel -> **Databases** -> **MySQL Databases**.
2. Create a database (e.g. `u123456789_kruizly`) and user with a strong password.
3. Open **phpMyAdmin** for this database.
4. Click **Import** and upload `database/schema.sql`.
5. Click **Import** and upload `database/seed_production.sql`.

### Step 2: Upload Files to `public_html`
1. In hPanel, open **File Manager** -> navigate to `public_html/`.
2. Upload all files and folders:
   - `index.html`, `fleet.html`, `booking.html`, `payment.html`, `profile.html`, `admin.html`, etc.
   - `css/`, `js/`, `assets/`
   - `api/` (contains all PHP endpoints and services)
   - `storage/` (contains `.htaccess` and upload subdirectories)

### Step 3: Configure Database Credentials
In `api/config/config.php` (or by setting Hostinger PHP Environment Variables):
```php
define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'u123456789_kruizly');
define('DB_USER', 'u123456789_kruizly_user');
define('DB_PASS', 'YourActualPassword');
```

### Step 4: Verify Health
Visit in your browser:
```
https://yourdomain.com/api/health.php
```
You should see:
```json
{
  "success": true,
  "service": "KRUIZLY PHP REST API",
  "version": "2.0.0",
  "runtime": "PHP 8.x",
  "database": "connected"
}
```

---

## 3. That's It!
- The website is 100% cloud-hosted on Hostinger.
- No Node.js server, terminal, or PM2 process is required.
- The website works 24/7 even when your PC is turned off.
