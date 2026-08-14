import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

let cached: { sql: postgres.Sql; db: Database } | undefined;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not set (see .env.example)');
  }
  return url;
}

/**
 * Lazy singleton so importing this module never opens a connection — required for
 * serverless, where each invocation may or may not touch the database.
 */
export function getDb(): Database {
  cached ??= createClient(connectionString());
  return cached.db;
}

export function createClient(url: string): { sql: postgres.Sql; db: Database } {
  // `max: 1` and no prepared statements keeps the pool serverless-safe (Neon pooled URLs).
  const sql = postgres(url, { max: 1, prepare: false });
  return { sql, db: drizzle(sql, { schema }) };
}

export async function closeDb(): Promise<void> {
  if (cached === undefined) return;
  await cached.sql.end();
  cached = undefined;
}
