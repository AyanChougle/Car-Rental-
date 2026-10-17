Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = 'D:\AYAN\Car-Rental-\kruizly_partner_and_kpi_sync.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
if (Test-Path 'D:\AYAN\Car-Rental-\accounts.html') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\accounts.html', 'accounts.html') }
if (Test-Path 'D:\AYAN\Car-Rental-\admin.html') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\admin.html', 'admin.html') }
if (Test-Path 'D:\AYAN\Car-Rental-\profile.html') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\profile.html', 'profile.html') }
if (Test-Path 'D:\AYAN\Car-Rental-\booking.html') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\booking.html', 'booking.html') }
if (Test-Path 'D:\AYAN\Car-Rental-\payment.html') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\payment.html', 'payment.html') }
if (Test-Path 'D:\AYAN\Car-Rental-\executive.html') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\executive.html', 'executive.html') }
if (Test-Path 'D:\AYAN\Car-Rental-\index.html') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\index.html', 'index.html') }
if (Test-Path 'D:\AYAN\Car-Rental-\js\accounts.js') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\js\accounts.js', 'js/accounts.js') }
if (Test-Path 'D:\AYAN\Car-Rental-\js\admin.js') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\js\admin.js', 'js/admin.js') }
if (Test-Path 'D:\AYAN\Car-Rental-\js\profile.js') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\js\profile.js', 'js/profile.js') }
if (Test-Path 'D:\AYAN\Car-Rental-\js\booking.js') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\js\booking.js', 'js/booking.js') }
if (Test-Path 'D:\AYAN\Car-Rental-\js\payment.js') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\js\payment.js', 'js/payment.js') }
if (Test-Path 'D:\AYAN\Car-Rental-\js\auth.js') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\js\auth.js', 'js/auth.js') }
if (Test-Path 'D:\AYAN\Car-Rental-\js\booking-calculator.js') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\js\booking-calculator.js', 'js/booking-calculator.js') }
if (Test-Path 'D:\AYAN\Car-Rental-\js\executive.js') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\js\executive.js', 'js/executive.js') }
if (Test-Path 'D:\AYAN\Car-Rental-\js\image-lightbox.js') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\js\image-lightbox.js', 'js/image-lightbox.js') }
if (Test-Path 'D:\AYAN\Car-Rental-\js\kruizly-api.js') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\js\kruizly-api.js', 'js/kruizly-api.js') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\config\config.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\config\config.php', 'api/config/config.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\config\database.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\config\database.php', 'api/config/database.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\middleware\auth.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\middleware\auth.php', 'api/middleware/auth.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\admin\stats.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\admin\stats.php', 'api/admin/stats.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\hubs\summary.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\hubs\summary.php', 'api/hubs/summary.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\services\KpiService.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\services\KpiService.php', 'api/services/KpiService.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\services\FileStorageService.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\services\FileStorageService.php', 'api/services/FileStorageService.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\users\partner-cars.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\users\partner-cars.php', 'api/users/partner-cars.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\bookings\create.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\bookings\create.php', 'api/bookings/create.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\bookings\detail.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\bookings\detail.php', 'api/bookings/detail.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\api\payments\verify.php') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\api\payments\verify.php', 'api/payments/verify.php') }
if (Test-Path 'D:\AYAN\Car-Rental-\database\sync_partner_host_fleets.sql') { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, 'D:\AYAN\Car-Rental-\database\sync_partner_host_fleets.sql', 'database/sync_partner_host_fleets.sql') }
$zip.Dispose()
Write-Host 'ZIP_REBUILT_SUCCESSFULLY'
