import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { createClient } from '@/lib/db/client';

config({ path: '.env' });
config({ path: '.env.example' });

/** Creates and migrates the throwaway database used by database-backed tests. */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url === '') throw new Error('TEST_DATABASE_URL is not set');
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  parsed.pathname = '/postgres';

  const admin = postgres(parsed.toString(), { max: 1, prepare: false });
  try {
    const existing = await admin`select 1 from pg_database where datname = ${database}`;
    if (existing.length === 0) await admin.unsafe(`create database "${database}"`);
  } finally {
    await admin.end();
  }

  const { sql, db } = createClient(url);
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
  } finally {
    await sql.end();
  }
}
