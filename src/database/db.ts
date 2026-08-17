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
    // Ensure all tables exist automatically on fresh databases
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        year INTEGER NOT NULL,
        type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS watchlist_title_year_type_idx ON watchlist (title, year, type);

      CREATE TABLE IF NOT EXISTS releases (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        year INTEGER NOT NULL,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        source_url TEXT NOT NULL,
        release_type TEXT NOT NULL,
        seeders INTEGER DEFAULT 0,
        leechers INTEGER DEFAULT 0,
        poster TEXT,
        metadata_json JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS releases_title_year_idx ON releases (title, year);
      CREATE UNIQUE INDEX IF NOT EXISTS releases_source_url_idx ON releases (source_url);

      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        scan_interval INTEGER DEFAULT 10 NOT NULL,
        telegram_chat_id TEXT,
        metadata_api_key TEXT,
        debug_mode INTEGER DEFAULT 0 NOT NULL,
        provider_type TEXT DEFAULT 'PIRATEBAY' NOT NULL,
        provider_url TEXT,
        app_url TEXT,
        last_scan TIMESTAMP,
        active_instance_id TEXT
      );

      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        service TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- Add columns if missing for existing databases
      ALTER TABLE releases ADD COLUMN IF NOT EXISTS seeders INTEGER DEFAULT 0;
      ALTER TABLE releases ADD COLUMN IF NOT EXISTS leechers INTEGER DEFAULT 0;
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS app_url TEXT;
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS provider_type TEXT DEFAULT 'PIRATEBAY';
    `);
    console.log('Database schema verified (all tables and columns ensured).');
  } catch (err) {
    console.error('Error ensuring database schema:', err);
  }
}

