import { eq } from 'drizzle-orm';
import { kycCases, kycEvents, users, type KycCase } from '../schema';
import { compareAndSwapUpdate, type DrizzleTx } from './core';

/** A case as the provider's completed check describes it; the caller mints the id. */
export interface NewKycCase {
  id: string;
  applicantName: string;
  applicantDob: string;
  country: string;
  documentType: string;
  documentImageUrls: string[];
  providerRiskScore: number;
  watchlistHits: unknown[];
  slaDueAt: Date;
}

export interface ServiceActorRow {
  id: string;
  email: string;
  name: string;
}

export interface KycMutations {
  claimKycCase(caseId: string, assigneeId: string, from: KycCase['state']): Promise<KycCase>;
  setKycCaseState(
    caseId: string,
    from: KycCase['state'],
    to: KycCase['state'],
    fields?: Partial<Pick<KycCase, 'escalatedById' | 'resolutionReasonCode' | 'assignedToId'>>,
  ): Promise<KycCase>;
  /**
   * The webhook is public, so its audit entries are attributed to a service identity that no
   * one can sign in as; the row is created on first use and holds no roles.
   */
  ensureServiceActor(actor: ServiceActorRow): Promise<void>;
  /** Archives the inbound payload and opens the case it describes, atomically. */
  recordKycCheck(args: {
    provider: string;
    payload: unknown;
    kycCase: NewKycCase;
  }): Promise<KycCase>;
}

export function kycMutations(tx: DrizzleTx): KycMutations {
  const updateCase = (
    caseId: string,
    from: KycCase['state'],
    values: Partial<KycCase>,
  ): Promise<KycCase> => compareAndSwapUpdate(tx, kycCases, caseId, from, values, 'kyc case');

  return {
    claimKycCase: (caseId, assigneeId, from) =>
      updateCase(caseId, from, { state: 'in_review', assignedToId: assigneeId }),
    setKycCaseState: (caseId, from, to, fields = {}) =>
      updateCase(caseId, from, { state: to, ...fields }),
    ensureServiceActor: async (actor) => {
      await tx.insert(users).values(actor).onConflictDoNothing();
    },
    recordKycCheck: async ({ provider, payload, kycCase }) => {
      const [event] = await tx.insert(kycEvents).values({ provider, payload }).returning();
      const [row] = await tx.insert(kycCases).values(kycCase).returning();
      if (event === undefined || row === undefined) throw new Error('failed to record kyc check');
      await tx.update(kycEvents).set({ caseId: row.id }).where(eq(kycEvents.id, event.id));
      return row;
    },
  };
}
