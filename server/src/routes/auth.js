import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/pool.js';
import { signJwt, verifyJwt } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRegisterInput } from '../middleware/validate.js';
import { checkRateLimit } from '../middleware/rateLimit.js';
import {
  generateOtp,
  storeOtp,
  verifyOtp,
  hasActiveOtp,
  checkResendCooldown,
  deleteOtp,
} from '../services/otpService.js';
import { sendOtpEmail, sendPasswordResetSuccessEmail, sendWelcomeEmail } from '../services/emailService.js';
import { generateQrDataUrl } from '../utils/qrCode.js';
import config from '../config.js';

const router = Router();

// ─── Helper: validate email format ─────────────────────────────────
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ─── OTP: Send verification code to email ──────────────────────────
router.post('/send-otp', async (req, res, next) => {
  try {
    const { allowed, retryAfter } = checkRateLimit(
      `send-otp:${req.ip}`,
      config.rateLimit.registerMaxAttempts,
      config.rateLimit.registerWindowMs
    );
    if (!allowed) {
      return res.status(429).json({
        error: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      });
    }

    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Prevent flooding: only one active OTP at a time per email
    if (hasActiveOtp(normalizedEmail)) {
      return res.status(429).json({ error: 'An active OTP already exists. Please wait before requesting a new one.' });
    }

    const otp = generateOtp();
    await storeOtp(normalizedEmail, otp);

    // Send via email
    await sendOtpEmail({ email: normalizedEmail, otp, storeName: null, purpose: 'registration' });

    res.json({
      message: 'Verification code sent to your email',
      expiresIn: 300,
      ...(config.isProduction ? {} : { devOtp: otp }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── OTP: Re-send verification code (with cooldown) ────────────────
router.post('/resend-otp', async (req, res, next) => {
  try {
    const { allowed, retryAfter } = checkRateLimit(
      `resend-otp:${req.ip}`,
      config.rateLimit.registerMaxAttempts,
      config.rateLimit.registerWindowMs
    );
    if (!allowed) {
      return res.status(429).json({
        error: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      });
    }

    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const cooldown = checkResendCooldown(normalizedEmail);
    if (!cooldown.allowed) {
      return res.status(429).json({
        error: `Please wait ${cooldown.remainingSeconds} seconds before requesting a new code.`,
        remainingSeconds: cooldown.remainingSeconds,
      });
    }

    const otp = generateOtp();
    await storeOtp(normalizedEmail, otp);

    await sendOtpEmail({ email: normalizedEmail, otp, storeName: null, purpose: 'registration' });

    res.json({
      message: 'Verification code resent to your email',
      expiresIn: 300,
      ...(config.isProduction ? {} : { devOtp: otp }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── OTP: Verify code ──────────────────────────────────────────────
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!otp || typeof otp !== 'string' || otp.length !== 6) {
      return res.status(400).json({ error: 'A valid 6-digit verification code is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await verifyOtp(normalizedEmail, otp);
    if (!result.valid) {
      return res.status(400).json({ error: result.reason });
    }

    // Issue a short-lived verification token (5 min)
    const verificationToken = signJwt({
      purpose: 'email-verification',
      email: normalizedEmail,
    });

    res.json({
      verified: true,
      verificationToken,
      expiresIn: 300,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Register ──────────────────────────────────────────────────────
router.post('/register', validateRegisterInput, async (req, res, next) => {
  try {
    const { allowed, retryAfter } = checkRateLimit(
      `register:${req.ip}`,
      config.rateLimit.registerMaxAttempts,
      config.rateLimit.registerWindowMs
    );
    if (!allowed) {
      return res.status(429).json({
        error: `Too many registration attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      });
    }

    const { storeName, slug, whatsappNumber, password, email, verificationToken } = req.cleanInput;

    // Verify the email verification token
    if (!verificationToken) {
      return res.status(400).json({ error: 'Email verification is required. Please verify your email first.' });
    }

    const tokenPayload = verifyJwt(verificationToken);
    if (!tokenPayload || tokenPayload.purpose !== 'email-verification') {
      return res.status(400).json({ error: 'Invalid or expired verification token. Please verify your email again.' });
    }

    // Ensure the verified email matches the submitted email
    if (tokenPayload.email !== email) {
      return res.status(400).json({ error: 'Email mismatch. Please verify the correct email address.' });
    }

    // Check that email is not already in use
    const existingEmail = await pool.query(
      'SELECT id FROM stores WHERE email = $1',
      [email]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ error: 'This email is already registered. Please use a different email or sign in.' });
    }

    // Check store limit: max 3 stores per phone number
    const storeCount = await pool.query(
      'SELECT COUNT(*)::int AS count FROM stores WHERE whatsapp_number = $1',
      [whatsappNumber]
    );
    if (storeCount.rows[0].count >= 3) {
      return res.status(409).json({ error: 'This phone number already has the maximum of 3 stores.' });
    }

    const existing = await pool.query(
      'SELECT id FROM stores WHERE slug = $1',
      [slug]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This store URL slug is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptSaltRounds);

    const result = await pool.query(
      `INSERT INTO stores (store_name, slug, whatsapp_number, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, store_name, slug`,
      [storeName, slug, whatsappNumber, email, passwordHash]
    );

    const store = result.rows[0];
    const token = signJwt({ storeId: store.id, slug: store.slug });

    const defaultHours = [];
    for (let d = 0; d <= 6; d++) {
      defaultHours.push(
        `($1, ${d}, '09:00', '21:00', FALSE)`
      );
    }
    await pool.query(
      `INSERT INTO business_hours (store_id, day_of_week, open_time, close_time, is_closed) VALUES ${defaultHours.join(', ')}`,
      [store.id]
    );

    // Clear the used OTP entry
    deleteOtp(email);

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: config.isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    const appUrl = config.frontendUrl.replace(/\/$/, '');
    const storeUrl = `${appUrl}/store/${store.slug}`;

    // Generate QR code for the onboarding page
    let qrCode = null;
    try {
      qrCode = await generateQrDataUrl(storeUrl);
    } catch {
      // QR is non-critical
    }

    // Send welcome email (non-blocking)
    const loginUrl = `${appUrl}/login`;
    sendWelcomeEmail({
      email,
      storeName: store.store_name,
      storeUrl,
      loginUrl,
    }).catch(err => console.error('[Email] Failed to send welcome email:', err.message));

    res.status(201).json({
      store: { id: store.id, storeName: store.store_name, slug: store.slug },
      storeUrl,
      qrCode,
    });
  } catch (err) {
    // Handle unique constraint violation (race condition on email)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This email is already registered. Please use a different email or sign in.' });
    }
    next(err);
  }
});

// ─── Login ──────────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { allowed, retryAfter } = checkRateLimit(
      `login:${req.ip}`,
      config.rateLimit.authMaxAttempts,
      config.rateLimit.authWindowMs
    );
    if (!allowed) {
      return res.status(429).json({
        error: `Too many login attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      });
    }

    const { slug: rawSlug, password } = req.body;
    if (!rawSlug || typeof rawSlug !== 'string' || !/^[a-z0-9-]{2,100}$/.test(rawSlug.trim().toLowerCase())) {
      return res.status(400).json({ error: 'Invalid store URL format' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }
    const slug = rawSlug.trim().toLowerCase();

    const result = await pool.query(
      'SELECT id, store_name, slug, password_hash FROM stores WHERE slug = $1',
      [slug]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const store = result.rows[0];
    const valid = await bcrypt.compare(password, store.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signJwt({ storeId: store.id, slug: store.slug });

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: config.isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    const appUrl = config.frontendUrl.replace(/\/$/, '');
    const storeUrl = `${appUrl}/store/${store.slug}`;

    res.json({
      store: { id: store.id, storeName: store.store_name, slug: store.slug },
      storeUrl,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Helper: mask email for display ────────────────────────────────
function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  const visible = local.charAt(0);
  const masked = visible + '*'.repeat(Math.min(local.length - 1, 7));
  return `${masked}@${domain}`;
}

// ─── Forgot Password: Step 1 — Send OTP using store slug ───────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { allowed, retryAfter } = checkRateLimit(
      `forgot-password:${req.ip}`,
      config.rateLimit.forgotPasswordMaxAttempts,
      config.rateLimit.forgotPasswordWindowMs
    );
    if (!allowed) {
      return res.status(429).json({
        error: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      });
    }

    const { slug: rawSlug } = req.body;
    if (!rawSlug || typeof rawSlug !== 'string' || !/^[a-z0-9-]{2,100}$/.test(rawSlug.trim().toLowerCase())) {
      // Generic — don't reveal whether store exists
      return res.status(200).json({ message: 'If this store exists, a password reset code has been sent to the registered email.' });
    }

    const slug = rawSlug.trim().toLowerCase();

    // Look up store by slug to get the registered email
    const storeResult = await pool.query(
      'SELECT id, store_name, email FROM stores WHERE slug = $1',
      [slug]
    );

    // Generic response whether store exists or not
    if (storeResult.rows.length === 0 || !storeResult.rows[0].email) {
      return res.json({ message: 'If this store exists, a password reset code has been sent to the registered email.' });
    }

    const store = storeResult.rows[0];
    const normalizedEmail = store.email.trim().toLowerCase();

    // Rate limit per email as well
    const emailRateCheck = checkRateLimit(
      `forgot-password-email:${normalizedEmail}`,
      3,
      60 * 60 * 1000
    );
    if (!emailRateCheck.allowed) {
      return res.json({ message: 'If this store exists, a password reset code has been sent to the registered email.' });
    }

    // Generate and store OTP
    const otp = generateOtp();
    await storeOtp(normalizedEmail, otp);

    // Send OTP email with purpose 'password-reset'
    await sendOtpEmail({
      email: normalizedEmail,
      otp,
      storeName: store.store_name,
      purpose: 'password-reset',
    });

    res.json({
      message: 'A password reset code has been sent to your registered email.',
      maskedEmail: maskEmail(normalizedEmail),
      // Return full email so the frontend can use it for subsequent API calls
      email: normalizedEmail,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Forgot Password: Step 2 — Verify OTP ──────────────────────────
router.post('/verify-reset-otp', async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!otp || typeof otp !== 'string' || otp.length !== 6) {
      return res.status(400).json({ error: 'A valid 6-digit code is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await verifyOtp(normalizedEmail, otp);
    if (!result.valid) {
      return res.status(400).json({ error: result.reason });
    }

    // Issue a short-lived reset token (5 min)
    const resetToken = signJwt({
      purpose: 'password-reset',
      email: normalizedEmail,
    });

    res.json({
      verified: true,
      resetToken,
      expiresIn: 300,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Forgot Password: Step 3 — Reset password ─────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const { resetToken, password } = req.body;

    if (!resetToken || typeof resetToken !== 'string') {
      return res.status(400).json({ error: 'Reset token is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Password must be under 128 characters' });
    }

    const tokenPayload = verifyJwt(resetToken);
    if (!tokenPayload || tokenPayload.purpose !== 'password-reset') {
      return res.status(400).json({ error: 'Invalid or expired reset token. Please restart the password reset process.' });
    }

    const { email } = tokenPayload;

    const passwordHash = await bcrypt.hash(password, config.bcryptSaltRounds);

    const result = await pool.query(
      `UPDATE stores SET password_hash = $1 WHERE email = $2
       RETURNING id, store_name, email`,
      [passwordHash, email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Account not found. Please try again.' });
    }

    // Send success notification email
    await sendPasswordResetSuccessEmail({ email }).catch(() => {
      // Non-critical — password was still updated
    });

    // Clear any remaining OTP for this email
    deleteOtp(email);

    res.json({ message: 'Password has been reset successfully. You can now sign in with your new password.' });
  } catch (err) {
    next(err);
  }
});

// ─── Logout ─────────────────────────────────────────────────────────
router.post('/logout', (_req, res) => {
  res.clearCookie('token', {
    path: '/',
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
  });
  res.json({ message: 'Logged out' });
});

router.get('/token', requireAuth, (_req, res) => {
  res.json({ hasToken: true });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, store_name, slug, whatsapp_number, email, allow_delivery, allow_pickup,
              delivery_fee, free_delivery_threshold, pickup_address, pickup_instructions
       FROM stores WHERE id = $1`,
      [req.merchant.storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const s = result.rows[0];
    res.json({
      store: {
        id: s.id,
        storeName: s.store_name,
        slug: s.slug,
        whatsappNumber: s.whatsapp_number,
        email: s.email,
        allowDelivery: s.allow_delivery,
        allowPickup: s.allow_pickup,
        deliveryFee: parseFloat(s.delivery_fee),
        freeDeliveryThreshold: s.free_delivery_threshold ? parseFloat(s.free_delivery_threshold) : null,
        pickupAddress: s.pickup_address,
        pickupInstructions: s.pickup_instructions,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
