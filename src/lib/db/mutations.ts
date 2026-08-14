import { and, eq } from 'drizzle-orm';
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
 * Raised when a state change matched no row because the entity had already moved on. The
 * caller read the entity outside the transaction, so the read is the stale part, not the write.
 */
export class StaleStateError extends Error {
  constructor(
    readonly entityId: string,
    readonly expected: string,
  ) {
    super(`kyc case ${entityId} is no longer in state ${expected}`);
    this.name = 'StaleStateError';
  }
}

/**
 * The mutation surface handed to `audited()`. Every write lives here, so no caller can
 * change a row outside the audit wrapper (convention 1). State changes are compare-and-swap:
 * the caller passes the state it believes the row is in, and the update refuses to land on a
 * row another transaction has already moved.
 */
export interface Tx {
  claimKycCase(caseId: string, assigneeId: string, from: KycCase['state']): Promise<KycCase>;
  setKycCaseState(
    caseId: string,
    from: KycCase['state'],
    to: KycCase['state'],
    fields?: Partial<Pick<KycCase, 'escalatedById' | 'resolutionReasonCode' | 'assignedToId'>>,
  ): Promise<KycCase>;
}

export function mutations(tx: DrizzleTx): Tx {
  const updateCase = async (
    caseId: string,
    from: KycCase['state'],
    values: Partial<KycCase>,
  ): Promise<KycCase> => {
    const [updated] = await tx
      .update(kycCases)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(kycCases.id, caseId), eq(kycCases.state, from)))
      .returning();
    if (updated === undefined) throw new StaleStateError(caseId, from);
    return updated;
  };

  return {
    claimKycCase: (caseId, assigneeId, from) =>
      updateCase(caseId, from, { state: 'in_review', assignedToId: assigneeId }),
    setKycCaseState: (caseId, from, to, fields = {}) =>
      updateCase(caseId, from, { state: to, ...fields }),
  };
}
