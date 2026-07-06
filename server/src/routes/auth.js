import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/pool.js';
import { signJwt } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRegisterInput } from '../middleware/validate.js';
import { checkRateLimit } from '../middleware/rateLimit.js';
import config from '../config.js';

const router = Router();

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

    const { storeName, slug, whatsappNumber, password } = req.cleanInput;

    const existing = await pool.query(
      'SELECT id FROM stores WHERE slug = $1',
      [slug]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This store URL slug is already taken' });
    }

    const existingPhone = await pool.query(
      'SELECT id FROM stores WHERE whatsapp_number = $1',
      [whatsappNumber]
    );
    if (existingPhone.rows.length > 0) {
      return res.status(409).json({ error: 'A store with this WhatsApp number already exists' });
    }

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

    res.status(201).json({
      store: { id: store.id, storeName: store.store_name, slug: store.slug },
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

    res.json({
      store: { id: store.id, storeName: store.store_name, slug: store.slug },
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
