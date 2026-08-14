import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { createClient } from './client';

config({ path: '.env' });

/** Drops every table so `pnpm db:migrate` can rebuild from the committed migrations. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '')
    throw new Error('DATABASE_URL is not set (see .env.example)');
  const { sql: connection, db } = createClient(url);
  await db.execute(sql`drop schema public cascade; create schema public;`);
  await db.execute(sql`drop schema if exists drizzle cascade;`);
  await connection.end();
  console.log('database dropped');
}

void main();
