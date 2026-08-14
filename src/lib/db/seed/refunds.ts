import { sql } from 'drizzle-orm';
import { now } from '@/lib/time';
import { type Database } from '../client';
import { refunds } from '../schema';
import { makeRandom, pick } from './foundation';

const REFUND_STATES = ['requested', 'approved', 'rejected'] as const;
const REFUND_REASONS = ['duplicate_charge', 'item_not_received', 'goodwill', 'fraud_claim'];
const AMOUNTS_PENCE = [4_500, 9_900, 12_500, 48_000, 152_000, 780_000];

const DAY_MS = 86_400_000;

export async function seedRefunds(db: Database, ids: Record<string, string>): Promise<void> {
  await db.execute(sql`truncate table refunds restart identity cascade`);

  const random = makeRandom(11);
  const agent = ids['agent@demo.co']!;
  const financeManager = ids['fmanager@demo.co']!;
  const seededAt = now();

  for (let index = 0; index < 30; index += 1) {
    // The first third stay open so the dashboard always has requests to work.
    const state = index < 10 ? 'requested' : pick(random, REFUND_STATES);
    const decided = state !== 'requested';
    // Recent decisions, so "approved this week" is a live number rather than always zero.
    const decidedAt = new Date(seededAt.getTime() - Math.floor(random() * 5) * DAY_MS);
    await db.insert(refunds).values({
      customerEmail: `customer${index}@example.com`,
      paymentId: `pi_mock_${1000 + index}`,
      amountPence: AMOUNTS_PENCE[index % AMOUNTS_PENCE.length]!,
      currency: 'GBP',
      reasonCode: pick(random, REFUND_REASONS),
      state,
      requestedById: agent,
      decidedById: decided ? financeManager : null,
      decidedAt: decided ? decidedAt : null,
      providerRefundId: state === 'approved' ? `re_mock_${index}` : null,
    });
  }
}
