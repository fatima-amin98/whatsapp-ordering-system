/**
 * SMS / WhatsApp Provider Interface
 *
 * Designed so providers can be swapped easily (e.g. Twilio, WhatsApp Business API).
 *
 * Currently uses console logging + wa.me deep link for development.
 * To add a real provider, implement the sendOtp function and swap it here.
 */

import { buildWaDeepLink } from '../utils/waLink.js';
import config from '../config.js';

/**
 * Send an OTP to a phone number.
 *
 * @param {string} phone - Canonical phone (03XXXXXXXXX)
 * @param {string} otp - The 6-digit OTP code
 * @returns {Promise<{ sent: boolean, method: string }>}
 */
export async function sendOtp(phone, otp) {
  if (config.isProduction) {
    // In production, generate a WhatsApp deep link so the merchant
    // receives the OTP on their own WhatsApp number.
    const message = `Your WhatsApp Store verification code is: ${otp}\n\nThis code expires in 5 minutes.`;
    const waLink = buildWaDeepLink(phone, message);

    console.log(`[OTP] Sent to ${phone} via wa.me link`);

    return {
      sent: true,
      method: 'whatsapp',
      waLink,
    };
  }

  // Development: log to console so the developer can read it
  console.log(`[OTP] Verification code for ${phone}: ${otp}`);
  return { sent: true, method: 'console' };
}
