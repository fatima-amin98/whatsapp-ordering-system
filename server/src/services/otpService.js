import crypto from 'crypto';
import bcrypt from 'bcrypt';
import config from '../config.js';

/**
 * In-memory OTP store.
 * Maps emailHash -> { otpHash, attempts, expiresAt, resentAt }
 *
 * OTPs are hashed with bcrypt before storage (no plaintext OTPs in memory).
 * Entries auto-expire via the TTL check in verifyOtp().
 */
const otpStore = new Map();

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const BCRYPT_SALT_ROUNDS = 6; // Lightweight for OTPs (6-digit, short-lived)
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds before resend allowed

/**
 * Generate a cryptographically random N-digit OTP.
 * @returns {string}
 */
export function generateOtp() {
  const max = Math.pow(10, OTP_LENGTH);
  const num = crypto.randomInt(0, max);
  return String(num).padStart(OTP_LENGTH, '0');
}

/**
 * Hash an identifier (email) for use as a map key (avoids storing raw email in memory).
 * @param {string} identifier
 * @returns {string}
 */
function hashIdentifier(identifier) {
  return crypto.createHash('sha256').update(identifier.toLowerCase().trim()).digest('hex');
}

/**
 * Store an OTP hash for a given email.
 * Any previous OTP for this email is invalidated.
 *
 * @param {string} email - The email address
 * @param {string} otp - The plaintext OTP to store
 */
export async function storeOtp(email, otp) {
  const key = hashIdentifier(email);
  const otpHash = await bcrypt.hash(otp, BCRYPT_SALT_ROUNDS);

  otpStore.set(key, {
    otpHash,
    attempts: 0,
    expiresAt: Date.now() + OTP_TTL_MS,
    lastResentAt: Date.now(),
  });
}

/**
 * Verify an OTP for a given email.
 *
 * - Checks existence
 * - Checks expiry
 * - Checks attempt limit
 * - Compares bcrypt hash
 * - On success, removes the entry (one-time use)
 * - On failure, increments attempt counter
 *
 * @param {string} email - The email address
 * @param {string} otp - The plaintext OTP to verify
 * @returns {{ valid: boolean, reason?: string }}
 */
export async function verifyOtp(email, otp) {
  const key = hashIdentifier(email);
  const entry = otpStore.get(key);

  if (!entry) {
    return { valid: false, reason: 'No OTP found. Request a new one.' };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { valid: false, reason: 'OTP has expired. Request a new one.' };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { valid: false, reason: 'Too many failed attempts. Request a new OTP.' };
  }

  const match = await bcrypt.compare(otp, entry.otpHash);
  if (!match) {
    entry.attempts += 1;
    return { valid: false, reason: 'Invalid OTP.' };
  }

  // Success — remove so it cannot be reused
  otpStore.delete(key);
  return { valid: true };
}

/**
 * Check if an email currently has a stored (unexpired) OTP.
 * Used for rate limiting to prevent flooding.
 *
 * @param {string} email
 * @returns {boolean}
 */
export function hasActiveOtp(email) {
  const key = hashIdentifier(email);
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return false;
  }
  return true;
}

/**
 * Check if resend cooldown is active for an email (60 seconds between resends).
 * @param {string} email
 * @returns {{ allowed: boolean, remainingSeconds: number }}
 */
export function checkResendCooldown(email) {
  const key = hashIdentifier(email);
  const entry = otpStore.get(key);
  if (!entry || !entry.lastResentAt) {
    return { allowed: true, remainingSeconds: 0 };
  }

  const elapsed = Date.now() - entry.lastResentAt;
  if (elapsed < RESEND_COOLDOWN_MS) {
    return { allowed: false, remainingSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000) };
  }

  return { allowed: true, remainingSeconds: 0 };
}

/**
 * Delete an OTP entry by email (used after successful verification).
 * @param {string} email
 */
export function deleteOtp(email) {
  const key = hashIdentifier(email);
  otpStore.delete(key);
}

/**
 * Periodic cleanup of expired entries (runs every 5 minutes).
 */
export function startOtpCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of otpStore) {
      if (now > entry.expiresAt) {
        otpStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}
