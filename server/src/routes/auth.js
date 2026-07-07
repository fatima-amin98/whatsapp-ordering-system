import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/pool.js';
import { signJwt, verifyJwt } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRegisterInput } from '../middleware/validate.js';
import { checkRateLimit } from '../middleware/rateLimit.js';
import { generateOtp, storeOtp, verifyOtp, hasActiveOtp } from '../services/otpService.js';
import { sendOtp } from '../services/smsProvider.js';
import { generateQrDataUrl } from '../utils/qrCode.js';
import config from '../config.js';

const router = Router();

// ─── OTP: Send verification code ───────────────────────────────────
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

    const { phone } = req.body;
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const { validatePhone } = await import('../utils/phoneUtils.js');
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.valid) {
      return res.status(400).json({ error: phoneCheck.error });
    }

    // Prevent flooding: only one active OTP at a time per phone
    if (hasActiveOtp(phoneCheck.normalized)) {
      return res.status(429).json({ error: 'An active OTP already exists. Please wait before requesting a new one.' });
    }

    const otp = generateOtp();
    await storeOtp(phoneCheck.normalized, otp);

    // Send via the configured provider
    const result = await sendOtp(phoneCheck.normalized, otp);

    res.json({
      message: 'Verification code sent',
      method: result.method,
      expiresIn: 300,
      // In development, include the OTP for convenience
      ...(config.isProduction ? {} : { devOtp: otp }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── OTP: Verify code ──────────────────────────────────────────────
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!otp || typeof otp !== 'string' || otp.length !== 6) {
      return res.status(400).json({ error: 'A valid 6-digit verification code is required' });
    }

    const { validatePhone } = await import('../utils/phoneUtils.js');
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.valid) {
      return res.status(400).json({ error: phoneCheck.error });
    }

    const result = await verifyOtp(phoneCheck.normalized, otp);
    if (!result.valid) {
      return res.status(400).json({ error: result.reason });
    }

    // Issue a short-lived verification token (5 min)
    const verificationToken = signJwt({
      purpose: 'phone-verification',
      phone: phoneCheck.normalized,
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

    const { storeName, slug, whatsappNumber, password, verificationToken } = req.cleanInput;

    // Verify the phone verification token
    if (!verificationToken) {
      return res.status(400).json({ error: 'Phone verification is required. Please verify your number first.' });
    }

    const tokenPayload = verifyJwt(verificationToken);
    if (!tokenPayload || tokenPayload.purpose !== 'phone-verification') {
      return res.status(400).json({ error: 'Invalid or expired verification token. Please verify your number again.' });
    }

    // Ensure the verified phone matches the submitted phone
    if (tokenPayload.phone !== whatsappNumber) {
      return res.status(400).json({ error: 'Phone number mismatch. Please verify the correct number.' });
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

    // Note: we no longer reject duplicate phones — allow up to 3 stores
    const passwordHash = await bcrypt.hash(password, config.bcryptSaltRounds);

    const result = await pool.query(
      `INSERT INTO stores (store_name, slug, whatsapp_number, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, store_name, slug`,
      [storeName, slug, whatsappNumber, passwordHash]
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

    res.status(201).json({
      store: { id: store.id, storeName: store.store_name, slug: store.slug },
      storeUrl,
      qrCode,
    });
  } catch (err) {
    next(err);
  }
});

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
      `SELECT id, store_name, slug, whatsapp_number, allow_delivery, allow_pickup,
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
