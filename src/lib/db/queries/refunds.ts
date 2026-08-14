import { count, eq } from 'drizzle-orm';
import { requirePermission, type Actor } from '@/lib/rbac';
import { getDb } from '../client';
import { refunds, type Refund } from '../schema';

export async function countRefundsByState(actor: Actor, state: Refund['state']): Promise<number> {
  requirePermission(actor, 'refunds.read');
  const [row] = await getDb()
    .select({ total: count() })
    .from(refunds)
    .where(eq(refunds.state, state));
  return row?.total ?? 0;
}
