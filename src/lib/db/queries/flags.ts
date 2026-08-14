import { count } from 'drizzle-orm';
import { requirePermission, type Actor } from '@/lib/rbac';
import { getDb } from '../client';
import { flags } from '../schema';

export async function countFlags(actor: Actor): Promise<number> {
  requirePermission(actor, 'flags.read');
  const [row] = await getDb().select({ total: count() }).from(flags);
  return row?.total ?? 0;
}
