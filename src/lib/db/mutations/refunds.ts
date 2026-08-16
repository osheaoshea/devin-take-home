import { eq } from 'drizzle-orm';
import { refunds, type Refund } from '../schema';
import { compareAndSwapUpdate, type DrizzleTx } from './core';

export interface DecideRefundArgs {
  refundId: string;
  /** The state the guards were evaluated against, so the update is a compare-and-swap. */
  from: Refund['state'];
  to: Refund['state'];
  decidedById: string;
  /** Taken from `now()` by the caller, so tests and seeds share the app's clock. */
  decidedAt: Date;
}

export interface RefundMutations {
  /**
   * Settles a refund: the state change and the deciding actor land in one compare-and-swap, so a
   * decided refund always names who decided it.
   */
  decideRefund(args: DecideRefundArgs): Promise<Refund>;
  /**
   * Stamps the provider's refund id on an already-decided row, in the same transaction as the
   * decision, once the provider call has succeeded.
   */
  recordProviderRefund(args: { refundId: string; providerRefundId: string }): Promise<Refund>;
}

export function refundMutations(tx: DrizzleTx): RefundMutations {
  return {
    decideRefund: ({ refundId, from, to, decidedById, decidedAt }) =>
      compareAndSwapUpdate(
        tx,
        refunds,
        refundId,
        from,
        { state: to, decidedById, decidedAt },
        'refund',
      ),
    recordProviderRefund: async ({ refundId, providerRefundId }) => {
      const [updated] = await tx
        .update(refunds)
        .set({ providerRefundId })
        .where(eq(refunds.id, refundId))
        .returning();
      if (updated === undefined) throw new Error(`refund ${refundId} not found`);
      return updated;
    },
  };
}
