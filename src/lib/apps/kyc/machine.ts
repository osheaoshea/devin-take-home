import { z } from 'zod';
import type { KycCase } from '@/lib/db/schema';
import {
  all,
  defineMachine,
  distinctActor,
  hasPermission,
  type Guard,
  type Machine,
} from '@/lib/workflow';

export type KycState = KycCase['state'];

export const KYC_STATES = [
  'pending',
  'in_review',
  'approved',
  'rejected',
  'escalated',
] as const satisfies readonly KycState[];

/** What a KYC transition needs in order to persist itself: who acted, and why. */
export interface KycTransitionContext {
  actorId: string;
  reasonCode?: string;
}

const transitionContextSchema = z.object({
  actorId: z.string().uuid(),
  reasonCode: z.string().min(1).optional(),
});

/**
 * Four-eyes: resolving an escalation takes the manager permission *and* an actor other than
 * whoever escalated the case.
 */
const resolveEscalated = all<KycCase>(
  hasPermission('kyc.resolve_escalated'),
  distinctActor((kycCase) => kycCase.escalatedById, 'same_actor_as_escalator'),
);

/**
 * The transition map, by state, so the UI can ask which actions a case even has before asking
 * whether this actor may take them. `approved` and `rejected` appear nowhere as a source state,
 * which is what makes them terminal.
 */
const GUARDS: Partial<Record<KycState, Partial<Record<KycState, readonly Guard<KycCase>[]>>>> = {
  pending: { in_review: [hasPermission('kyc.claim')] },
  in_review: {
    approved: [hasPermission('kyc.approve')],
    rejected: [hasPermission('kyc.reject')],
    escalated: [hasPermission('kyc.escalate')],
  },
  escalated: { approved: [resolveEscalated], rejected: [resolveEscalated] },
};

/** The states a case in `from` can move to at all, regardless of who is asking. */
export function declaredTargets(from: KycState): KycState[] {
  const targets = GUARDS[from];
  return targets === undefined ? [] : KYC_STATES.filter((state) => targets[state] !== undefined);
}

function flatTransitions(): Partial<Record<string, readonly Guard<KycCase>[]>> {
  const transitions: Partial<Record<string, readonly Guard<KycCase>[]>> = {};
  for (const from of KYC_STATES) {
    for (const to of declaredTargets(from)) transitions[`${from}->${to}`] = GUARDS[from]?.[to];
  }
  return transitions;
}

export const kycMachine: Machine<KycCase, KycState> = defineMachine<KycCase, KycState>({
  entityType: 'kyc_case',
  stateOf: (kycCase) => kycCase.state,
  transitions: flatTransitions(),
  persist: ({ tx, entity, from, to, context }) => {
    const { actorId, reasonCode } = transitionContextSchema.parse(context);
    if (to === 'in_review') return tx.claimKycCase(entity.id, actorId, from);
    return tx.setKycCaseState(entity.id, from, to, {
      resolutionReasonCode: reasonCode ?? null,
      ...(to === 'escalated' ? { escalatedById: actorId } : {}),
    });
  },
  action: (to) => `kyc.case.${to}`,
});
