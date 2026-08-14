import { eq } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm/relations';
import { kycCases, type KycCase } from './schema';
import type * as schema from './schema';

export type DrizzleTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * The mutation surface handed to `audited()`. Every write lives here, so no caller can
 * change a row outside the audit wrapper (convention 1).
 */
export interface Tx {
  claimKycCase(caseId: string, assigneeId: string): Promise<KycCase>;
  setKycCaseState(
    caseId: string,
    state: KycCase['state'],
    fields?: Partial<Pick<KycCase, 'escalatedById' | 'resolutionReasonCode' | 'assignedToId'>>,
  ): Promise<KycCase>;
}

export function mutations(tx: DrizzleTx): Tx {
  const updateCase = async (caseId: string, values: Partial<KycCase>): Promise<KycCase> => {
    const [updated] = await tx
      .update(kycCases)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(kycCases.id, caseId))
      .returning();
    if (updated === undefined) throw new Error(`kyc case not found: ${caseId}`);
    return updated;
  };

  return {
    claimKycCase: (caseId, assigneeId) =>
      updateCase(caseId, { state: 'in_review', assignedToId: assigneeId }),
    setKycCaseState: (caseId, state, fields = {}) => updateCase(caseId, { state, ...fields }),
  };
}
