import { z } from 'zod';
import type { Refund } from '@/lib/db/schema';
import { paymentsProvider } from '@/lib/providers';
import { now } from '@/lib/time';
import { defineMachine, hasPermission, type Guard, type Machine } from '@/lib/workflow';

export type RefundState = Refund['state'];

export const REFUND_STATES = [
  'requested',
  'approved',
  'rejected',
] as const satisfies readonly RefundState[];

/** What a refund transition needs in order to persist itself: who decided it. */
export interface RefundTransitionContext {
  actorId: string;
}

const transitionContextSchema = z.object({ actorId: z.string().uuid() });

/**
 * One decision per refund: approve or reject, each gated by a permission alone. Threshold tiers
 * and dual approval are deliberately out of scope here — KYC carries the four-eyes flow.
 */
const GUARDS: Partial<Record<RefundState, Partial<Record<RefundState, readonly Guard<Refund>[]>>>> =
  {
    requested: {
      approved: [hasPermission('refunds.approve')],
      rejected: [hasPermission('refunds.reject')],
    },
  };

/** The states a refund in `from` can move to at all, regardless of who is asking. */
export function declaredTargets(from: RefundState): RefundState[] {
  const targets = GUARDS[from];
  return targets === undefined ? [] : REFUND_STATES.filter((state) => targets[state] !== undefined);
}

function flatTransitions(): Partial<Record<string, readonly Guard<Refund>[]>> {
  const transitions: Partial<Record<string, readonly Guard<Refund>[]>> = {};
  for (const from of REFUND_STATES) {
    for (const to of declaredTargets(from)) transitions[`${from}->${to}`] = GUARDS[from]?.[to];
  }
  return transitions;
}

export const refundMachine: Machine<Refund, RefundState> = defineMachine<Refund, RefundState>({
  entityType: 'refund',
  stateOf: (refund) => refund.state,
  transitions: flatTransitions(),
  persist: async ({ tx, entity, from, to, context }) => {
    const { actorId } = transitionContextSchema.parse(context);

    // The compare-and-swap runs first, so a concurrent decision that loses it never reaches the
    // provider, and the refund id keys the provider call, so a retry cannot issue twice. A crash
    // between provider success and commit still loses the provider refund id; production would
    // record an outbox/intent row before calling out.
    const decided = await tx.decideRefund({
      refundId: entity.id,
      from,
      to,
      decidedById: actorId,
      decidedAt: now(),
    });
    if (to !== 'approved') return decided;

    const issued = await paymentsProvider().issueRefund({
      idempotencyKey: entity.id,
      paymentId: entity.paymentId,
      amountPence: entity.amountPence,
      currency: entity.currency,
    });
    return tx.recordProviderRefund({
      refundId: entity.id,
      providerRefundId: issued.providerRefundId,
    });
  },
  action: (to) => `refund.${to}`,
});
