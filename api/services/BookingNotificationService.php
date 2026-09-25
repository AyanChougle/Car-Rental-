<?php
/**
 * api/services/BookingNotificationService.php
 * 
 * Central Notification Service for KRUIZLY Bookings.
 * Handles:
 * 1. Professional HTML Confirmation Emails with attached Invoice PDF.
 * 2. WhatsApp Approval Confirmation Text & Direct Dispatch URLs with exact pickup/drop times, days, and hours.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/MailService.php';
require_once __DIR__ . '/InvoicePdfService.php';

class BookingNotificationService
{
    /**
     * Calculates exact rental duration in days and hours.
     */
    public static function calculateDuration(?string $pickupStr, ?string $dropStr): array
    {
        $pTime = !empty($pickupStr) ? strtotime($pickupStr) : false;
        $dTime = !empty($dropStr) ? strtotime($dropStr) : false;

        if ($pTime === false || $dTime === false || $dTime <= $pTime) {
            return [
                'total_hours' => 24,
                'days' => 1,
                'remaining_hours' => 0,
                'formatted' => '1 Day (24 hrs)',
                'pickup_formatted' => !empty($pickupStr) ? date('d M Y, h:i A', $pTime ?: time()) : '—',
                'drop_formatted' => !empty($dropStr) ? date('d M Y, h:i A', $dTime ?: time()) : '—',
            ];
        }

        $diffSec = $dTime - $pTime;
        $totalHours = max(1, (int)ceil($diffSec / 3600));
        $days = (int)floor($totalHours / 24);
        $remHours = $totalHours % 24;

        if ($days > 0 && $remHours > 0) {
            $formatted = "{$days} Day" . ($days > 1 ? "s" : "") . " {$remHours} Hr" . ($remHours > 1 ? "s" : "") . " ({$totalHours} hrs)";
        } elseif ($days > 0) {
            $formatted = "{$days} Day" . ($days > 1 ? "s" : "") . " ({$totalHours} hrs)";
        } else {
            $formatted = "{$totalHours} Hour" . ($totalHours > 1 ? "s" : "");
        }

        return [
            'total_hours' => $totalHours,
            'days' => max(1, $days),
            'remaining_hours' => $remHours,
            'formatted' => $formatted,
            'pickup_formatted' => date('d M Y, h:i A', $pTime),
            'drop_formatted' => date('d M Y, h:i A', $dTime),
        ];
    }

    /**
     * Dispatches Approval Email and generates WhatsApp confirmation message.
     */
    public static function sendBookingApprovalNotification($bookingOrId): array
    {
        try {
            $booking = null;
            if (is_array($bookingOrId)) {
                $booking = $bookingOrId;
            } else {
                $bId = trim((string)$bookingOrId);
                $cleanId = ltrim($bId, '#');
                $booking = Database::fetchOne(
                    "SELECT * FROM bookings 
                     WHERE booking_id = ? 
                        OR booking_number = ? 
                        OR id = ? 
                        OR REPLACE(booking_id, '#', '') = ? 
                        OR REPLACE(booking_number, '#', '') = ? 
                     LIMIT 1",
                    [$bId, $bId, is_numeric($bId) ? (int)$bId : 0, $cleanId, $cleanId]
                );
            }

            if (!$booking) {
                return ['success' => false, 'error' => 'Booking record not found.'];
            }

            $bookingNumber = (string)($booking['booking_number'] ?? $booking['booking_id'] ?? $booking['id'] ?? 'KZ-0000');
            $customerName = trim((string)($booking['user_name'] ?? 'Valued Customer'));
            $customerEmail = trim((string)($booking['user_email'] ?? ''));
            $customerPhone = trim((string)($booking['user_phone'] ?? ''));

            $vehicleName = trim((string)($booking['vehicle_name'] ?? 'KRUIZLY Rental Vehicle'));
            $vehicleReg = trim((string)($booking['vehicle_reg'] ?? ''));
            $vehicleDisplay = $vehicleReg ? "{$vehicleName} ({$vehicleReg})" : $vehicleName;

            $pickupLocation = trim((string)($booking['pickup_location'] ?? 'Gavson Business Park, Ghansoli, Navi Mumbai'));
            $dropLocation = trim((string)($booking['drop_location'] ?? $pickupLocation));

            $durationData = self::calculateDuration(
                (string)($booking['pickup_date'] ?? ''),
                (string)($booking['drop_date'] ?? '')
            );

            $totalAmount = (float)($booking['final_amount'] ?? $booking['total_amount'] ?? 0);
            $advanceAmount = (float)($booking['advance_amount'] ?? $booking['payment_amount_paid'] ?? 0);
            $remainingBalance = (float)($booking['remaining_balance'] ?? max(0, $totalAmount - $advanceAmount));
            $isPaidInFull = ($remainingBalance <= 0 || strtolower((string)($booking['payment_status'] ?? '')) === 'paid');

            // 1. Generate Invoice PDF attachment if possible
            $pdfPath = null;
            $fileName = "KRUIZLY_Booking_Confirmation_{$bookingNumber}.pdf";
            try {
                $pdfPath = InvoicePdfService::getOrCreateInvoicePdf($booking['booking_id']);
            } catch (Throwable $_) {}

            // 2. Dispatch Email
            $emailSent = false;
            $emailError = null;
            if (!empty($customerEmail) && filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
                try {
                    $htmlBody = self::buildApprovalEmailHtml([
                        'customerName' => $customerName,
                        'bookingNumber' => $bookingNumber,
                        'vehicleDisplay' => $vehicleDisplay,
                        'pickupFormatted' => $durationData['pickup_formatted'],
                        'dropFormatted' => $durationData['drop_formatted'],
                        'durationFormatted' => $durationData['formatted'],
                        'pickupLocation' => $pickupLocation,
                        'dropLocation' => $dropLocation,
                        'totalAmount' => number_format($totalAmount, 2),
                        'advanceAmount' => number_format($advanceAmount, 2),
                        'remainingBalance' => number_format($remainingBalance, 2),
                        'isPaidInFull' => $isPaidInFull,
                    ]);

                    $subject = "✅ Booking Approved & Confirmed: #{$bookingNumber} — {$vehicleName} | KRUIZLY";
                    $emailSent = MailService::sendMail($customerEmail, $subject, $htmlBody, $pdfPath, $fileName);
                } catch (Throwable $e) {
                    $emailError = $e->getMessage();
                    error_log("[Booking Approval Email Error] " . $e->getMessage());
                }
            }

            // 3. Craft WhatsApp Message & Direct Link
            $whatsAppText = self::buildWhatsAppApprovalText([
                'customerName' => $customerName,
                'bookingNumber' => $bookingNumber,
                'vehicleDisplay' => $vehicleDisplay,
                'pickupFormatted' => $durationData['pickup_formatted'],
                'dropFormatted' => $durationData['drop_formatted'],
                'durationFormatted' => $durationData['formatted'],
                'pickupLocation' => $pickupLocation,
                'totalAmount' => number_format($totalAmount, 2),
                'advanceAmount' => number_format($advanceAmount, 2),
                'remainingBalance' => number_format($remainingBalance, 2),
                'isPaidInFull' => $isPaidInFull,
            ]);

            // Clean phone number for WhatsApp wa.me link
            $cleanPhone = preg_replace('/[^0-9]/', '', $customerPhone);
            if (strlen($cleanPhone) === 10) {
                $cleanPhone = '91' . $cleanPhone;
            } elseif (strlen($cleanPhone) === 11 && str_starts_with($cleanPhone, '0')) {
                $cleanPhone = '91' . substr($cleanPhone, 1);
            }

            $whatsAppUrl = "https://wa.me/" . ($cleanPhone ?: "919167164547") . "?text=" . rawurlencode($whatsAppText);

            return [
                'success' => true,
                'booking_number' => $bookingNumber,
                'email_sent' => $emailSent,
                'email_error' => $emailError,
                'customer_email' => $customerEmail,
                'customer_phone' => $customerPhone,
                'duration_formatted' => $durationData['formatted'],
                'pickup_formatted' => $durationData['pickup_formatted'],
                'drop_formatted' => $durationData['drop_formatted'],
                'whatsapp_text' => $whatsAppText,
                'whatsapp_url' => $whatsAppUrl,
            ];
        } catch (Throwable $e) {
            error_log("[sendBookingApprovalNotification Exception] " . $e->getMessage());
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Dispatches Cancellation Email and generates WhatsApp cancellation message.
     */
    public static function sendBookingCancellationNotification($bookingOrId, ?string $reason = null): array
    {
        try {
            $booking = null;
            if (is_array($bookingOrId)) {
                $booking = $bookingOrId;
            } else {
                $bId = trim((string)$bookingOrId);
                $cleanId = ltrim($bId, '#');
                $booking = Database::fetchOne(
                    "SELECT * FROM bookings 
                     WHERE booking_id = ? 
                        OR booking_number = ? 
                        OR id = ? 
                        OR REPLACE(booking_id, '#', '') = ? 
                        OR REPLACE(booking_number, '#', '') = ? 
                     LIMIT 1",
                    [$bId, $bId, is_numeric($bId) ? (int)$bId : 0, $cleanId, $cleanId]
                );
            }

            if (!$booking) {
                return ['success' => false, 'error' => 'Booking record not found.'];
            }

            $bookingNumber = (string)($booking['booking_number'] ?? $booking['booking_id'] ?? $booking['id'] ?? 'KZ-0000');
            $customerName = trim((string)($booking['user_name'] ?? 'Valued Customer'));
            $customerEmail = trim((string)($booking['user_email'] ?? ''));
            $customerPhone = trim((string)($booking['user_phone'] ?? ''));

            $vehicleName = trim((string)($booking['vehicle_name'] ?? 'KRUIZLY Rental Vehicle'));
            $vehicleReg = trim((string)($booking['vehicle_reg'] ?? ''));
            $vehicleDisplay = $vehicleReg ? "{$vehicleName} ({$vehicleReg})" : $vehicleName;

            $pickupLocation = trim((string)($booking['pickup_location'] ?? 'Gavson Business Park, Ghansoli, Navi Mumbai'));
            $dropLocation = trim((string)($booking['drop_location'] ?? $pickupLocation));

            $durationData = self::calculateDuration(
                (string)($booking['pickup_date'] ?? ''),
                (string)($booking['drop_date'] ?? '')
            );

            $totalAmount = (float)($booking['final_amount'] ?? $booking['total_amount'] ?? 0);
            $cancellationReason = $reason ?: trim((string)($booking['cancellation_reason'] ?? $booking['payment_rejection_reason'] ?? 'Verification / Payment could not be confirmed'));
            $refundStatus = trim((string)($booking['refund_status'] ?? 'Eligible refund initiated'));

            // 1. Dispatch Cancellation Email
            $emailSent = false;
            $emailError = null;
            if (!empty($customerEmail) && filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
                try {
                    $htmlBody = self::buildCancellationEmailHtml([
                        'customerName' => $customerName,
                        'bookingNumber' => $bookingNumber,
                        'vehicleDisplay' => $vehicleDisplay,
                        'pickupFormatted' => $durationData['pickup_formatted'],
                        'dropFormatted' => $durationData['drop_formatted'],
                        'durationFormatted' => $durationData['formatted'],
                        'pickupLocation' => $pickupLocation,
                        'totalAmount' => number_format($totalAmount, 2),
                        'cancellationReason' => $cancellationReason,
                        'refundStatus' => strtoupper($refundStatus),
                    ]);

                    $subject = "❌ Reservation Cancelled: #{$bookingNumber} — {$vehicleName} | KRUIZLY";
                    $emailSent = MailService::sendMail($customerEmail, $subject, $htmlBody);
                } catch (Throwable $e) {
                    $emailError = $e->getMessage();
                    error_log("[Booking Cancellation Email Error] " . $e->getMessage());
                }
            }

            // 2. Craft WhatsApp Message & Direct Link
            $whatsAppText = self::buildWhatsAppCancellationText([
                'customerName' => $customerName,
                'bookingNumber' => $bookingNumber,
                'vehicleDisplay' => $vehicleDisplay,
                'pickupFormatted' => $durationData['pickup_formatted'],
                'dropFormatted' => $durationData['drop_formatted'],
                'durationFormatted' => $durationData['formatted'],
                'totalAmount' => number_format($totalAmount, 2),
                'cancellationReason' => $cancellationReason,
                'refundStatus' => strtoupper($refundStatus),
            ]);

            $cleanPhone = preg_replace('/[^0-9]/', '', $customerPhone);
            if (strlen($cleanPhone) === 10) {
                $cleanPhone = '91' . $cleanPhone;
            } elseif (strlen($cleanPhone) === 11 && str_starts_with($cleanPhone, '0')) {
                $cleanPhone = '91' . substr($cleanPhone, 1);
            }

            $whatsAppUrl = "https://wa.me/" . ($cleanPhone ?: "919167164547") . "?text=" . rawurlencode($whatsAppText);

            return [
                'success' => true,
                'booking_number' => $bookingNumber,
                'email_sent' => $emailSent,
                'email_error' => $emailError,
                'customer_email' => $customerEmail,
                'customer_phone' => $customerPhone,
                'whatsapp_text' => $whatsAppText,
                'whatsapp_url' => $whatsAppUrl,
            ];
        } catch (Throwable $e) {
            error_log("[sendBookingCancellationNotification Exception] " . $e->getMessage());
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Builds professional HTML email template for booking approval.
     */
    private static function buildApprovalEmailHtml(array $d): string
    {
        $statusBadge = $d['isPaidInFull']
            ? '<span style="background:#10b981;color:#fff;padding:6px 14px;border-radius:20px;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Confirmed &amp; Fully Paid</span>'
            : '<span style="background:#0ea5e9;color:#fff;padding:6px 14px;border-radius:20px;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Confirmed &amp; Token Paid</span>';

        $balanceRow = !$d['isPaidInFull']
            ? "<tr><td style='padding:8px 0;color:#6b7280;font-size:14px;'>Balance Due at Pickup:</td><td style='padding:8px 0;font-weight:700;color:#ef4444;font-size:14px;text-align:right;'>₹{$d['remainingBalance']}</td></tr>"
            : "<tr><td style='padding:8px 0;color:#6b7280;font-size:14px;'>Payment Status:</td><td style='padding:8px 0;font-weight:700;color:#10b981;font-size:14px;text-align:right;'>Paid in Full (₹0 Due)</td></tr>";

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>KRUIZLY Booking Confirmation</title>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#0b0f19;color:#e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#131c2e;border:1px solid #1e293b;border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.5);">
    <!-- Header -->
    <tr>
      <td style="background:linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);padding:32px 28px;text-align:center;border-bottom:1px solid #334155;">
        <h1 style="margin:0;font-size:28px;font-weight:900;letter-spacing:2px;color:#ffffff;text-transform:uppercase;">KRUIZLY</h1>
        <p style="margin:6px 0 0;font-size:13px;letter-spacing:1.5px;color:#38bdf8;text-transform:uppercase;font-weight:600;">Premium Self-Drive Car Rentals</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:32px 28px;">
        <div style="text-align:center;margin-bottom:24px;">
          {$statusBadge}
          <h2 style="margin:16px 0 4px;font-size:22px;color:#ffffff;font-weight:800;">Your Booking is Approved!</h2>
          <p style="margin:0;font-size:14px;color:#94a3b8;">Reservation <strong style="color:#38bdf8;">#{$d['bookingNumber']}</strong> has been confirmed by our operations team.</p>
        </div>

        <p style="font-size:15px;line-height:1.6;color:#cbd5e1;margin-bottom:24px;">
          Dear <strong>{$d['customerName']}</strong>,<br>
          We are pleased to inform you that your rental reservation has been officially approved. Your vehicle is reserved and scheduled for your journey!
        </p>

        <!-- Itinerary Box -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#1e293b;border:1px solid #334155;border-radius:12px;margin-bottom:24px;">
          <tr>
            <td style="padding:20px;">
              <h3 style="margin:0 0 16px;font-size:15px;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Trip &amp; Vehicle Details</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:14px;width:35%;">Vehicle:</td>
                  <td style="padding:6px 0;font-weight:700;color:#ffffff;font-size:15px;">{$d['vehicleDisplay']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:14px;">Pickup Date &amp; Time:</td>
                  <td style="padding:6px 0;font-weight:700;color:#38bdf8;font-size:15px;">{$d['pickupFormatted']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:14px;">Drop Date &amp; Time:</td>
                  <td style="padding:6px 0;font-weight:700;color:#38bdf8;font-size:15px;">{$d['dropFormatted']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:14px;">Total Duration:</td>
                  <td style="padding:6px 0;font-weight:800;color:#facc15;font-size:15px;">{$d['durationFormatted']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:14px;">Pickup Location:</td>
                  <td style="padding:6px 0;font-weight:600;color:#cbd5e1;font-size:14px;">{$d['pickupLocation']}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Payment Summary Box -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;margin-bottom:24px;">
          <tr>
            <td style="padding:20px;">
              <h3 style="margin:0 0 12px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Financial Breakdown</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:6px 0;color:#64748b;font-size:14px;">Total Rental Amount:</td>
                  <td style="padding:6px 0;font-weight:700;color:#ffffff;font-size:14px;text-align:right;">₹{$d['totalAmount']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#64748b;font-size:14px;">Amount Paid / Token:</td>
                  <td style="padding:6px 0;font-weight:700;color:#10b981;font-size:14px;text-align:right;">₹{$d['advanceAmount']}</td>
                </tr>
                {$balanceRow}
              </table>
            </td>
          </tr>
        </table>

        <!-- Important Checklist -->
        <div style="background:rgba(56,189,248,0.06);border-left:4px solid #38bdf8;padding:16px;border-radius:0 8px 8px 0;margin-bottom:28px;">
          <h4 style="margin:0 0 8px;font-size:14px;color:#38bdf8;font-weight:700;">Pickup Checklist &amp; Guidelines</h4>
          <ul style="margin:0;padding-left:18px;font-size:13px;color:#cbd5e1;line-height:1.6;">
            <li>Please carry your <strong>Original Driving License</strong> and <strong>Aadhaar Card</strong> at pickup.</li>
            <li>Security deposit (if applicable) is 100% refundable upon safe return.</li>
            <li>Fastag toll charges and fuel consumed are payable as per usage upon return.</li>
          </ul>
        </div>

        <p style="font-size:13px;color:#94a3b8;line-height:1.6;margin:0 0 16px;text-align:center;">
          Have questions or need to modify your schedule? Our support team is available 24/7.<br>
          Call: <a href="tel:+919167164547" style="color:#38bdf8;text-decoration:none;font-weight:700;">+91 91671 64547</a> &bull; Email: <a href="mailto:support@kruizly.com" style="color:#38bdf8;text-decoration:none;">support@kruizly.com</a>
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#090d16;padding:20px;text-align:center;border-top:1px solid #1e293b;font-size:12px;color:#64748b;">
        &copy; 2026 KRUIZLY. Gavson Business Park, Ghansoli, Navi Mumbai, Maharashtra 400701.<br>
        This is an official transactional message regarding reservation #{$d['bookingNumber']}.
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
    }

    /**
     * Builds preformatted WhatsApp confirmation message text.
     */
    private static function buildWhatsAppApprovalText(array $d): string
    {
        $balanceLine = $d['isPaidInFull']
            ? "💳 *Payment:* Fully Paid (₹0 Balance)"
            : "💵 *Balance Due at Pickup:* ₹{$d['remainingBalance']}";

        return
            "🎉 *KRUIZLY BOOKING APPROVED & CONFIRMED!*\n\n" .
            "Dear *{$d['customerName']}*,\n" .
            "Your self-drive rental booking has been officially approved! 🚗💨\n\n" .
            "📋 *Reservation ID:* #{$d['bookingNumber']}\n" .
            "🚘 *Vehicle:* {$d['vehicleDisplay']}\n\n" .
            "📅 *Pickup Date & Time:* {$d['pickupFormatted']}\n" .
            "📅 *Drop Date & Time:* {$d['dropFormatted']}\n" .
            "⏱️ *Rental Duration:* {$d['durationFormatted']}\n" .
            "📍 *Pickup Location:* {$d['pickupLocation']}\n\n" .
            "💰 *Total Rental:* ₹{$d['totalAmount']}\n" .
            "✅ *Advance / Paid:* ₹{$d['advanceAmount']}\n" .
            "{$balanceLine}\n\n" .
            "📌 *Pickup Checklist:*\n" .
            "• Please carry your original Driving License & Aadhaar Card.\n" .
            "• Security deposit is 100% refundable upon vehicle return.\n\n" .
            "Need help? Contact us directly at +91 91671 64547.\n" .
            "Thank you for choosing KRUIZLY! Have a wonderful and safe ride! 🌟";
    }

    /**
     * Builds preformatted WhatsApp cancellation message text.
     */
    private static function buildWhatsAppCancellationText(array $d): string
    {
        return
            "❌ *KRUIZLY BOOKING CANCELLED*\n\n" .
            "Dear *{$d['customerName']}*,\n" .
            "We regret to inform you that your self-drive reservation #{$d['bookingNumber']} has been *CANCELLED*. ❌\n\n" .
            "📋 *Reservation ID:* #{$d['bookingNumber']}\n" .
            "🚘 *Vehicle:* {$d['vehicleDisplay']}\n\n" .
            "📅 *Pickup Date & Time:* {$d['pickupFormatted']}\n" .
            "📅 *Drop Date & Time:* {$d['dropFormatted']}\n" .
            "⏱️ *Rental Duration:* {$d['durationFormatted']}\n" .
            "💰 *Total Amount:* ₹{$d['totalAmount']}\n" .
            "❌ *Status:* Booking Cancelled\n" .
            "📝 *Reason:* {$d['cancellationReason']}\n" .
            "💵 *Refund Status:* {$d['refundStatus']}\n\n" .
            "If you have any questions or wish to re-book, please contact our support team at +91 91671 64547.\n" .
            "Thank you for considering KRUIZLY.";
    }

    /**
     * Builds professional HTML email template for booking cancellation.
     */
    private static function buildCancellationEmailHtml(array $d): string
    {
        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Booking Cancelled - KRUIZLY</title>
</head>
<body style="margin:0;padding:0;background-color:#070a12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:20px auto;background-color:#0d121f;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:28px 32px;background:linear-gradient(135deg, #1e1b4b 0%, #0d121f 100%);border-bottom:1px solid #1e293b;">
        <h1 style="margin:0;font-size:24px;font-weight:900;color:#ef476f;letter-spacing:1px;">KRUIZLY</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Premium Self-Drive Car Rentals</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <span style="background:#ef476f;color:#fff;padding:6px 14px;border-radius:20px;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Booking Cancelled</span>
        <h2 style="margin:16px 0 8px;font-size:20px;font-weight:800;color:#ffffff;">Reservation #{$d['bookingNumber']} Cancelled</h2>
        <p style="margin:0 0 20px;font-size:14px;color:#cbd5e1;line-height:1.6;">
          Dear <strong>{$d['customerName']}</strong>,<br>
          We regret to inform you that your self-drive booking #{$d['bookingNumber']} for the <strong>{$d['vehicleDisplay']}</strong> has been cancelled.
        </p>

        <!-- Trip Details -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;margin-bottom:20px;">
          <tr>
            <td style="padding:20px;">
              <h3 style="margin:0 0 12px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Trip Summary</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:14px;">Vehicle:</td>
                  <td style="padding:6px 0;font-weight:700;color:#ffffff;font-size:14px;">{$d['vehicleDisplay']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:14px;">Pickup Date &amp; Time:</td>
                  <td style="padding:6px 0;font-weight:700;color:#38bdf8;font-size:14px;">{$d['pickupFormatted']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:14px;">Drop Date &amp; Time:</td>
                  <td style="padding:6px 0;font-weight:700;color:#38bdf8;font-size:14px;">{$d['dropFormatted']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:14px;">Duration:</td>
                  <td style="padding:6px 0;font-weight:700;color:#facc15;font-size:14px;">{$d['durationFormatted']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:14px;">Total Amount:</td>
                  <td style="padding:6px 0;font-weight:700;color:#ffffff;font-size:14px;">₹{$d['totalAmount']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#ef476f;font-size:14px;">Reason:</td>
                  <td style="padding:6px 0;font-weight:700;color:#ef476f;font-size:14px;">{$d['cancellationReason']}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#10b981;font-size:14px;">Refund Status:</td>
                  <td style="padding:6px 0;font-weight:700;color:#10b981;font-size:14px;">{$d['refundStatus']}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <p style="font-size:13px;color:#94a3b8;line-height:1.6;margin:0 0 16px;text-align:center;">
          If you have questions, please reach our customer support team:<br>
          Call: <a href="tel:+919167164547" style="color:#38bdf8;text-decoration:none;font-weight:700;">+91 91671 64547</a> &bull; Email: <a href="mailto:support@kruizly.com" style="color:#38bdf8;text-decoration:none;">support@kruizly.com</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="background:#090d16;padding:20px;text-align:center;border-top:1px solid #1e293b;font-size:12px;color:#64748b;">
        &copy; 2026 KRUIZLY. All rights reserved.<br>
        Transactional update regarding reservation #{$d['bookingNumber']}.
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
    }
}
