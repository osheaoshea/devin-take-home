import { kycCases, type KycCase } from '../schema';
import { compareAndSwapUpdate, type DrizzleTx } from './core';

export interface KycMutations {
  claimKycCase(caseId: string, assigneeId: string, from: KycCase['state']): Promise<KycCase>;
  setKycCaseState(
    caseId: string,
    from: KycCase['state'],
    to: KycCase['state'],
    fields?: Partial<Pick<KycCase, 'escalatedById' | 'resolutionReasonCode' | 'assignedToId'>>,
  ): Promise<KycCase>;
}

export function kycMutations(tx: DrizzleTx): KycMutations {
  const updateCase = (
    caseId: string,
    from: KycCase['state'],
    values: Partial<KycCase>,
  ): Promise<KycCase> => compareAndSwapUpdate(tx, kycCases, caseId, from, values);

  return {
    claimKycCase: (caseId, assigneeId, from) =>
      updateCase(caseId, from, { state: 'in_review', assignedToId: assigneeId }),
    setKycCaseState: (caseId, from, to, fields = {}) =>
      updateCase(caseId, from, { state: to, ...fields }),
  };
}
