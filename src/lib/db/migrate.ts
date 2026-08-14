import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createClient } from './client';

config({ path: '.env' });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '')
    throw new Error('DATABASE_URL is not set (see .env.example)');
  const { sql, db } = createClient(url);
  await migrate(db, { migrationsFolder: './drizzle' });
  await sql.end();
  console.log('migrations applied');
}

void main();
