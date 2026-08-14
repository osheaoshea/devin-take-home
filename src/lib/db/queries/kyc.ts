import { count, eq } from 'drizzle-orm';
import { requirePermission, type Actor } from '@/lib/rbac';
import { getDb } from '../client';
import { kycCases, type KycCase } from '../schema';

export async function findKycCaseById(actor: Actor, caseId: string): Promise<KycCase | undefined> {
  requirePermission(actor, 'kyc.read');
  const [row] = await getDb().select().from(kycCases).where(eq(kycCases.id, caseId)).limit(1);
  return row;
}

export async function countKycCasesByState(actor: Actor, state: KycCase['state']): Promise<number> {
  requirePermission(actor, 'kyc.read');
  const [row] = await getDb()
    .select({ total: count() })
    .from(kycCases)
    .where(eq(kycCases.state, state));
  return row?.total ?? 0;
}
