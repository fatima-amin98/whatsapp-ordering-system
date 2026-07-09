import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import pool from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = resolve(__dirname, 'migrations');

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query(
    'SELECT name FROM migrations ORDER BY name ASC'
  );
  return new Set(rows.map(r => r.name));
}

function getMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

export default async function migrate() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error('Migrations directory not found:', MIGRATIONS_DIR);
    throw new Error('Migrations directory missing');
  }

  const client = await pool.connect();
  try {
    await ensureTrackingTable(client);

    const applied = await getAppliedMigrations(client);
    const files = getMigrationFiles();

    let appliedCount = 0;

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const filePath = join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`[Migration] Applying: ${file}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`[Migration] Applied: ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migration] FAILED: ${file} — ${err.message}`);
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log('[Migration] Database is up to date.');
    } else {
      console.log(`[Migration] Applied ${appliedCount} migration(s).`);
    }
  } finally {
    client.release();
  }
}
