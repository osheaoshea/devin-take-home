import { refundApprovals, refunds, type Refund } from '../schema';
import { compareAndSwapUpdate, type DrizzleTx } from './core';

/**
 * A refund as the raising agent describes it; amounts are minor units with an explicit currency,
 * and the caller mints the id so the audit entry names the refund it created.
 */
export interface NewRefund {
  id: string;
  customerEmail: string;
  paymentId: string;
  amountPence: number;
  currency: string;
  reasonCode: string;
  requestedById: string;
}

export interface ApproveRefundArgs {
  refundId: string;
  /** The state the guards were evaluated against, so the update is a compare-and-swap. */
  from: Refund['state'];
  to: Refund['state'];
  approverId: string;
  /** Present only for the transition into `approved`, when the provider issued the refund. */
  providerRefundId?: string;
}

export interface RefundMutations {
  createRefund(refund: NewRefund): Promise<Refund>;
  /**
   * Records this approver's row and moves the refund in one go, so dual approval needs no extra
   * columns: two rows on a refund are two distinct approvers, enforced by a unique constraint.
   */
  approveRefund(args: ApproveRefundArgs): Promise<Refund>;
  setRefundState(refundId: string, from: Refund['state'], to: Refund['state']): Promise<Refund>;
}

export function refundMutations(tx: DrizzleTx): RefundMutations {
  const updateRefund = (
    refundId: string,
    from: Refund['state'],
    values: Partial<Refund>,
  ): Promise<Refund> => compareAndSwapUpdate(tx, refunds, refundId, from, values, 'refund');

  return {
    createRefund: async (refund) => {
      const [row] = await tx.insert(refunds).values(refund).returning();
      if (row === undefined) throw new Error('failed to create refund');
      return row;
    },
    approveRefund: async ({ refundId, from, to, approverId, providerRefundId }) => {
      await tx.insert(refundApprovals).values({ refundId, approverId });
      return updateRefund(refundId, from, {
        state: to,
        ...(providerRefundId === undefined ? {} : { providerRefundId }),
      });
    },
    setRefundState: (refundId, from, to) => updateRefund(refundId, from, { state: to }),
  };
}
