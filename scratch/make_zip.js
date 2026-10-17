const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const files = [
  'accounts.html',
  'admin.html',
  'profile.html',
  'booking.html',
  'payment.html',
  'executive.html',
  'index.html',
  'js/accounts.js',
  'js/admin.js',
  'js/profile.js',
  'js/booking.js',
  'js/payment.js',
  'js/auth.js',
  'js/booking-calculator.js',
  'js/executive.js',
  'js/image-lightbox.js',
  'js/kruizly-api.js',
  'api/config/config.php',
  'api/config/database.php',
  'api/middleware/auth.php',
  'api/admin/stats.php',
  'api/hubs/summary.php',
  'api/services/KpiService.php',
  'api/services/FileStorageService.php',
  'api/users/partner-cars.php',
  'api/bookings/create.php',
  'api/bookings/detail.php',
  'api/payments/verify.php',
  'database/sync_partner_host_fleets.sql'
];

let ps = "Add-Type -AssemblyName System.IO.Compression.FileSystem\r\n";
ps += "$zipPath = 'D:\\AYAN\\Car-Rental-\\kruizly_partner_and_kpi_sync.zip'\r\n";
ps += "if (Test-Path $zipPath) { Remove-Item $zipPath -Force }\r\n";
ps += "$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)\r\n";

for (const f of files) {
  const full = path.join('D:\\AYAN\\Car-Rental-', f).replace(/\//g, '\\');
  const entry = f.replace(/\\/g, '/');
  ps += `if (Test-Path '${full}') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, '${full}', '${entry}') }\r\n`;
}

ps += "$zip.Dispose()\r\n";
ps += "Write-Host 'ZIP_REBUILT_SUCCESSFULLY'\r\n";

fs.writeFileSync(path.join(__dirname, 'make_zip.ps1'), ps);
const out = execSync('powershell -ExecutionPolicy Bypass -File D:\\AYAN\\Car-Rental-\\scratch\\make_zip.ps1').toString();
console.log(out);
