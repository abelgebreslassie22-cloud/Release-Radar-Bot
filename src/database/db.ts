import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export async function ensureDatabaseSchema() {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(`
      ALTER TABLE releases ADD COLUMN IF NOT EXISTS seeders integer DEFAULT 0;
      ALTER TABLE releases ADD COLUMN IF NOT EXISTS leechers integer DEFAULT 0;
    `);
    console.log('Database schema verified (seeders & leechers columns ensured).');
  } catch (err) {
    console.error('Error ensuring database schema:', err);
  }
}

