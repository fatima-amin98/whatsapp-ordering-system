import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import config from './config.js';
import migrate from './db/migrate.js';
import pool from './db/pool.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initializeSocket } from './socket/index.js';
import { startOrderExpiryCron } from './cron/orderExpiry.js';
import { startOtpCleanup } from './services/otpService.js';
import { verifyTransporter } from './services/emailService.js';
import authRoutes from './routes/auth.js';
import storeRoutes from './routes/store.js';
import orderRoutes from './routes/orders.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: config.frontendUrl,
  credentials: true,
};

// Trust Railway/Vercel proxy for correct req.ip in rate limiting
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

const io = initializeSocket(server, corsOptions);
app.set('io', io);

startOrderExpiryCron(io);
startOtpCleanup();

async function start() {
  try {
    await migrate();
    console.log('[Boot] ✅ Database migration complete');

    // SMTP / Email configuration check
    if (config.email.user && config.email.pass) {
      console.log('[Boot] ✅ SMTP configuration detected —', config.email.user);
      console.log('[Boot]    Verifying email credentials...');
      try {
        await verifyTransporter();
      } catch (err) {
        console.error('[Boot] ❌ Email configuration is invalid. Server will start but emails will fail.');
        console.error('[Boot]    Fix the SMTP credentials in .env and restart.');
      }
    } else {
      console.warn('[Boot] ⚠ No SMTP credentials configured.');
      console.warn('[Boot]    Emails will be logged to console only.');
      if (config.isProduction) {
        console.warn('[Boot]    ❌ PRODUCTION MODE: Set EMAIL_USER and EMAIL_PASS in .env');
      }
    }

    server.listen(config.port, () => {
      console.log(`[Boot] ✅ Server running on port ${config.port} (${config.nodeEnv})`);
      console.log(`[Boot]    Frontend URL: ${config.frontendUrl}`);
    });
  } catch (err) {
    console.error('[Boot] ❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    pool.end().then(() => {
      console.log('Database pool closed');
      process.exit(0);
    }).catch(() => {
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
