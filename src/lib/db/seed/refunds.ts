import { sql } from 'drizzle-orm';
import { type Database } from '../client';
import { refundApprovals, refunds } from '../schema';
import { makeRandom, pick } from './foundation';

const REFUND_STATES = ['requested', 'needs_second_approval', 'approved', 'rejected'] as const;
const REFUND_REASONS = ['duplicate_charge', 'item_not_received', 'goodwill', 'fraud_claim'];

export async function seedRefunds(db: Database, ids: Record<string, string>): Promise<void> {
  await db.execute(sql`truncate table refund_approvals, refunds restart identity cascade`);

  const random = makeRandom(11);
  const agent = ids['agent@demo.co']!;
  const financeManager = ids['fmanager@demo.co']!;
  const financeManager2 = ids['fmanager2@demo.co']!;

  for (let index = 0; index < 30; index += 1) {
    // A spread across the £100 and £5,000 thresholds so the routing rules are visible.
    const amountPence = [4_500, 9_900, 12_500, 48_000, 499_900, 780_000][index % 6]!;
    const state =
      amountPence > 500_000
        ? pick(random, ['requested', 'needs_second_approval', 'approved'] as const)
        : pick(random, REFUND_STATES);
    const [row] = await db
      .insert(refunds)
      .values({
        customerEmail: `customer${index}@example.com`,
        paymentId: `pi_mock_${1000 + index}`,
        amountPence,
        currency: 'GBP',
        reasonCode: pick(random, REFUND_REASONS),
        state,
        requestedById: agent,
        providerRefundId: state === 'approved' ? `re_mock_${index}` : null,
      })
      .returning();
    if (row === undefined) continue;

    if (state === 'needs_second_approval' || state === 'approved') {
      await db.insert(refundApprovals).values({ refundId: row.id, approverId: financeManager });
    }
    if (state === 'approved' && amountPence > 500_000) {
      await db.insert(refundApprovals).values({ refundId: row.id, approverId: financeManager2 });
    }
  }
}
