<?php
/**
 * api/services/MailService.php
 * 
 * Standalone Pure PHP SMTP Email Dispatcher for KRUIZLY.
 * Supports TLS, authentication, HTML emails, and PDF attachments.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';

class MailService {
    /**
     * Sends an email with optional attachment via SMTP
     */
    public static function sendMail(string $to, string $subject, string $htmlBody, ?string $attachmentPath = null, ?string $attachmentName = null): bool {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            throw new Exception("Invalid recipient email address '$to'.");
        }

        // If SMTP credentials not provided, log and fail gracefully as required
        if (empty(SMTP_HOST) || empty(SMTP_USER)) {
            throw new Exception("SMTP configuration missing on server.");
        }

        $host = SMTP_HOST;
        $port = SMTP_PORT;
        $user = SMTP_USER;
        $pass = SMTP_PASS;
        $fromEmail = SMTP_FROM_EMAIL;
        $fromName = SMTP_FROM_NAME;

        $socket = @fsockopen(($port === 465 ? "ssl://$host" : $host), $port, $errno, $errstr, 10);
        if (!$socket) {
            // Native mail fallback
            return self::sendViaNativeMail($to, $subject, $htmlBody, $attachmentPath, $attachmentName);
        }

        try {
            self::readResponse($socket);

            self::sendCommand($socket, "EHLO " . ($_SERVER['SERVER_NAME'] ?? 'localhost'));

            if ($port === 587) {
                self::sendCommand($socket, "STARTTLS");
                stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                self::sendCommand($socket, "EHLO " . ($_SERVER['SERVER_NAME'] ?? 'localhost'));
            }

            self::sendCommand($socket, "AUTH LOGIN");
            self::sendCommand($socket, base64_encode($user));
            self::sendCommand($socket, base64_encode($pass));

            self::sendCommand($socket, "MAIL FROM: <$fromEmail>");
            self::sendCommand($socket, "RCPT TO: <$to>");
            self::sendCommand($socket, "DATA");

            $boundary = "==KRUIZLY_MULTIPART_" . md5((string)time());

            $headers = [
                "From: $fromName <$fromEmail>",
                "To: <$to>",
                "Subject: $subject",
                "MIME-Version: 1.0",
                "Content-Type: multipart/mixed; boundary=\"$boundary\"",
                "X-Mailer: KRUIZLY-PHP-Mailer/1.0"
            ];

            $msg = implode("\r\n", $headers) . "\r\n\r\n";
            $msg .= "--$boundary\r\n";
            $msg .= "Content-Type: text/html; charset=UTF-8\r\n";
            $msg .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
            $msg .= $htmlBody . "\r\n\r\n";

            if ($attachmentPath && file_exists($attachmentPath)) {
                $attachContent = file_get_contents($attachmentPath);
                $attachBase64 = chunk_split(base64_encode($attachContent));
                $name = $attachmentName ?: basename($attachmentPath);

                $msg .= "--$boundary\r\n";
                $msg .= "Content-Type: application/pdf; name=\"$name\"\r\n";
                $msg .= "Content-Transfer-Encoding: base64\r\n";
                $msg .= "Content-Disposition: attachment; filename=\"$name\"\r\n\r\n";
                $msg .= $attachBase64 . "\r\n\r\n";
            }

            $msg .= "--$boundary--\r\n";
            $msg .= "\r\n.";

            self::sendCommand($socket, $msg);
            self::sendCommand($socket, "QUIT");
            fclose($socket);

            return true;
        } catch (Throwable $e) {
            if (is_resource($socket)) {
                fclose($socket);
            }
            error_log("[SMTP Mail Error] " . $e->getMessage());
            return self::sendViaNativeMail($to, $subject, $htmlBody, $attachmentPath, $attachmentName);
        }
    }

    private static function sendCommand($socket, string $cmd): string {
        fwrite($socket, $cmd . "\r\n");
        return self::readResponse($socket);
    }

    private static function readResponse($socket): string {
        $response = "";
        while ($str = fgets($socket, 515)) {
            $response .= $str;
            if (substr($str, 3, 1) === ' ') {
                break;
            }
        }
        return $response;
    }

    private static function sendViaNativeMail(string $to, string $subject, string $htmlBody, ?string $attachmentPath, ?string $attachmentName): bool {
        $headers = [
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=UTF-8",
            "From: " . SMTP_FROM_NAME . " <" . SMTP_FROM_EMAIL . ">",
            "Reply-To: " . COMPANY_EMAIL
        ];
        return @mail($to, $subject, $htmlBody, implode("\r\n", $headers));
    }
}
