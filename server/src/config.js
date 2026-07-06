import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const requiredVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'FRONTEND_URL',
];

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    console.error(`FATAL: Missing required environment variable: ${varName}`);
    process.exit(1);
  }
}

export default {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  frontendUrl: process.env.FRONTEND_URL,
  jwtExpiry: '7d',
  bcryptSaltRounds: 12,
  rateLimit: {
    orderWindowMs: 60 * 60 * 1000,
    orderMaxAttempts: 3,
    authWindowMs: 60 * 60 * 1000,
    authMaxAttempts: 5,
    registerWindowMs: 60 * 60 * 1000,
    registerMaxAttempts: 3,
  },
  cron: {
    expiryMinutes: 60,
    reminderMinMinutes: 28,
    reminderMaxMinutes: 32,
  },
  isProduction: process.env.NODE_ENV === 'production',
  supabaseConfigured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
};
