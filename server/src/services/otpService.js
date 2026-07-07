import crypto from 'crypto';
import bcrypt from 'bcrypt';
import config from '../config.js';

/**
 * In-memory OTP store.
 * Maps phoneHash -> { otpHash, attempts, expiresAt }
 *
 * OTPs are hashed with bcrypt before storage (no plaintext OTPs in memory).
 * Entries auto-expire via the TTL check in verifyOtp().
 */
const otpStore = new Map();

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const BCrypt_SALT_ROUNDS = 6; // Lightweight for OTPs (6-digit, short-lived)

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
 * Hash the phone number for use as a map key (avoids storing raw phone in memory).
 * @param {string} phone
 * @returns {string}
 */
function hashPhone(phone) {
  return crypto.createHash('sha256').update(phone).digest('hex');
}

/**
 * Store an OTP hash for a given phone number.
 * Any previous OTP for this phone is invalidated.
 *
 * @param {string} phone - Canonical phone (03XXXXXXXXX)
 * @param {string} otp - The plaintext OTP to store
 */
export async function storeOtp(phone, otp) {
  const key = hashPhone(phone);
  const otpHash = await bcrypt.hash(otp, BCrypt_SALT_ROUNDS);

  otpStore.set(key, {
    otpHash,
    attempts: 0,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
}

/**
 * Verify an OTP for a given phone number.
 *
 * - Checks existence
 * - Checks expiry
 * - Checks attempt limit
 * - Compares bcrypt hash
 * - On success, removes the entry (one-time use)
 * - On failure, increments attempt counter
 *
 * @param {string} phone - Canonical phone (03XXXXXXXXX)
 * @param {string} otp - The plaintext OTP to verify
 * @returns {{ valid: boolean, reason?: string }}
 */
export async function verifyOtp(phone, otp) {
  const key = hashPhone(phone);
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
 * Check if a phone number currently has a stored (unexpired) OTP.
 * Used for rate limiting to prevent flooding.
 *
 * @param {string} phone
 * @returns {boolean}
 */
export function hasActiveOtp(phone) {
  const key = hashPhone(phone);
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return false;
  }
  return true;
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
