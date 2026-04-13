/**
 * Shared IMAP utilities for extracting MyChart 2FA verification codes from email.
 */

/**
 * Extract a 6-digit MyChart verification code from a raw RFC 2822 email.
 * Strips headers first to avoid matching routing IDs. Prefers contextual
 * matches (near "code:", "verification code is", etc.) over bare 6-digit runs.
 */
export function extractVerificationCode(rawEmail: string): string | null {
  // Headers and body are separated by the first double CRLF
  const bodyStart = rawEmail.indexOf("\r\n\r\n");
  const body = bodyStart >= 0 ? rawEmail.slice(bodyStart + 4) : rawEmail;

  const contextMatch =
    body.match(/code[:\s]+(\d{6})/i) ??
    body.match(/verification code is:?\s*(\d{6})/i) ??
    body.match(/(\d{6})\s+This code will expire/i);
  const match = contextMatch ?? body.match(/(?<![0-9])(\d{6})(?![0-9])/);
  return match ? match[1] : null;
}
