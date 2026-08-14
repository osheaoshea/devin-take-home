import { config } from 'dotenv';
import { DEMO_ACCOUNTS } from '@/lib/auth/demo-accounts';
import { createClient } from './client';
import { seedFlags } from './seed/flags';
import { seedDemoUsers } from './seed/foundation';
import { seedKyc } from './seed/kyc';
import { seedRefunds } from './seed/refunds';

config({ path: '.env' });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '')
    throw new Error('DATABASE_URL is not set (see .env.example)');
  const { sql: connection, db } = createClient(url);

  // Idempotent: each app's seeder replaces its demo data wholesale, demo accounts are upserted.
  const ids = await seedDemoUsers(db);
  await seedKyc(db, ids);
  await seedRefunds(db, ids);
  await seedFlags(db);
  await connection.end();

  console.log(`seeded ${DEMO_ACCOUNTS.length} demo accounts, 40 KYC cases, 30 refunds, 12 flags`);
}

void main();
