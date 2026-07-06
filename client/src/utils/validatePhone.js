/**
 * Normalizes Pakistani phone numbers to a canonical format.
 *
 * Accepted inputs:
 *   03001234567, 3001234567, +923001234567, 923001234567
 *   (spaces and dashes are stripped before processing)
 *
 * Canonical output: 03XXXXXXXXX (11 digits, leading 03)
 */
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[\s\-()]/g, '');

  if (cleaned.length < 10 || cleaned.length > 14) return null;

  let digits = cleaned;
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.startsWith('92')) digits = digits.slice(2);

  const trimmed = digits.slice(-10);
  if (!/^[0-9]{10}$/.test(trimmed)) return null;
  if (!trimmed.startsWith('3')) return null;

  return `0${trimmed}`;
}

/**
 * Validates a Pakistani phone number.
 * Returns { valid: true, cleaned: '03XXXXXXXXX' } or { valid: false, error: '...' }
 */
export function validatePhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return {
      valid: false,
      error: 'Enter a valid Pakistani phone number (e.g., 03001234567 or +923001234567)',
    };
  }
  return { valid: true, cleaned: normalized };
}
