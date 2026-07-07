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
    console.log('Database migration complete');

    server.listen(config.port, () => {
      console.log(`Server running on port ${config.port} (${config.nodeEnv})`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
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
