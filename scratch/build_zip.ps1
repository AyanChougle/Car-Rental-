$tempDir = Join-Path $env:TEMP ('kruizly_pkg_' + [Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempDir | Out-Null

$files = @(
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
)

foreach ($f in $files) {
    $src = Join-Path 'D:\AYAN\Car-Rental-' $f
    $dst = Join-Path $tempDir $f
    $parent = Split-Path $dst
    if (!(Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item $src $dst -Force
    Write-Host "Copied $f"
}

$zipOut = 'D:\AYAN\Car-Rental-\kruizly_partner_and_kpi_sync.zip'
if (Test-Path $zipOut) { Remove-Item $zipOut -Force }

Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipOut -Force
Remove-Item $tempDir -Recurse -Force
Write-Host "PACKAGE_BUILT_SUCCESSFULLY: $zipOut"
