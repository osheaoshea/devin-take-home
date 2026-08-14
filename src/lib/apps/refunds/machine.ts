import { z } from 'zod';
import type { Refund } from '@/lib/db/schema';
import { paymentsProvider } from '@/lib/providers';
import {
  all,
  amountAtMost,
  any,
  defineMachine,
  distinctActor,
  hasPermission,
  not,
  type Guard,
  type Machine,
} from '@/lib/workflow';

export type RefundState = Refund['state'];

export const REFUND_STATES = [
  'requested',
  'needs_second_approval',
  'approved',
  'rejected',
] as const satisfies readonly RefundState[];

/** Minor units, so the thresholds are exact: £100 and £5,000. */
export const SINGLE_AGENT_LIMIT_PENCE = 10_000;
export const SINGLE_APPROVAL_LIMIT_PENCE = 500_000;

/**
 * A refund as the guards need to see it: the row plus its approval rows, oldest first, because
 * the four-eyes guard compares the acting user against whoever approved first.
 */
export interface RefundApprovalRecord {
  approverId: string;
  approvedAt: Date;
}

export interface RefundWithApprovals extends Refund {
  approvals: readonly RefundApprovalRecord[];
}

/** What a refund transition needs in order to persist itself: who is approving. */
export interface RefundTransitionContext {
  actorId: string;
}

const transitionContextSchema = z.object({ actorId: z.string().uuid() });

const amountOf = (refund: RefundWithApprovals): number => refund.amountPence;

/** Threshold routing is a guard, not UI: the amount decides who may settle a refund alone. */
const approveOutright = any<RefundWithApprovals>(
  all(hasPermission('refunds.approve_small'), amountAtMost(amountOf, SINGLE_AGENT_LIMIT_PENCE)),
  all(hasPermission('refunds.approve'), amountAtMost(amountOf, SINGLE_APPROVAL_LIMIT_PENCE)),
);

/** Above £5,000 a first approval only routes the refund on: it never settles it. */
const routeToSecondApproval = all<RefundWithApprovals>(
  hasPermission('refunds.approve'),
  not(amountAtMost(amountOf, SINGLE_APPROVAL_LIMIT_PENCE), 'amount_within_single_approval'),
);

/** Four eyes: the second approver must differ from the first. */
const completeSecondApproval = all<RefundWithApprovals>(
  hasPermission('refunds.co_approve'),
  distinctActor((refund) => refund.approvals[0]?.approverId, 'same_approver'),
);

const reject = hasPermission<RefundWithApprovals>('refunds.reject');

/**
 * The transition map by state, so the UI can ask which actions a refund has at all before asking
 * whether this actor may take them. `approved` and `rejected` are absent as source states, which
 * is what makes them terminal.
 */
const GUARDS: Partial<
  Record<RefundState, Partial<Record<RefundState, readonly Guard<RefundWithApprovals>[]>>>
> = {
  requested: {
    approved: [approveOutright],
    needs_second_approval: [routeToSecondApproval],
    rejected: [reject],
  },
  needs_second_approval: { approved: [completeSecondApproval], rejected: [reject] },
};

/** The states a refund in `from` can move to at all, regardless of who is asking. */
export function declaredTargets(from: RefundState): RefundState[] {
  const targets = GUARDS[from];
  return targets === undefined ? [] : REFUND_STATES.filter((state) => targets[state] !== undefined);
}

function flatTransitions(): Partial<Record<string, readonly Guard<RefundWithApprovals>[]>> {
  const transitions: Partial<Record<string, readonly Guard<RefundWithApprovals>[]>> = {};
  for (const from of REFUND_STATES) {
    for (const to of declaredTargets(from)) transitions[`${from}->${to}`] = GUARDS[from]?.[to];
  }
  return transitions;
}

export const refundMachine: Machine<RefundWithApprovals, RefundState> = defineMachine<
  RefundWithApprovals,
  RefundState
>({
  entityType: 'refund',
  stateOf: (refund) => refund.state,
  transitions: flatTransitions(),
  persist: async ({ tx, entity, from, to, context }) => {
    const { actorId } = transitionContextSchema.parse(context);
    if (to === 'rejected') {
      const rejected = await tx.setRefundState(entity.id, from, to);
      return { ...rejected, approvals: entity.approvals };
    }

    // Money leaves the platform on the way into `approved` only, inside the same transaction as
    // the state change and the approval row: a provider refund with no audit trail cannot exist.
    const issued =
      to === 'approved'
        ? await paymentsProvider().issueRefund({
            paymentId: entity.paymentId,
            amountPence: entity.amountPence,
            currency: entity.currency,
          })
        : undefined;

    const approved = await tx.approveRefund({
      refundId: entity.id,
      from,
      to,
      approverId: actorId,
      providerRefundId: issued?.providerRefundId,
    });

    return {
      ...approved,
      approvals: [...entity.approvals, { approverId: actorId, approvedAt: approved.updatedAt }],
    };
  },
  action: (to) => `refund.${to}`,
});
