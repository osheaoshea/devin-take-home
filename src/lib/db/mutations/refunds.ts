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
  /** Present only for the transition into `approved`, when the provider issued the refund. */
  providerRefundId?: string;
}

export interface RefundMutations {
  /**
   * Settles a refund: the state change and the deciding actor land in one compare-and-swap, so a
   * decided refund always names who decided it.
   */
  decideRefund(args: DecideRefundArgs): Promise<Refund>;
}

export function refundMutations(tx: DrizzleTx): RefundMutations {
  return {
    decideRefund: ({ refundId, from, to, decidedById, decidedAt, providerRefundId }) =>
      compareAndSwapUpdate(
        tx,
        refunds,
        refundId,
        from,
        {
          state: to,
          decidedById,
          decidedAt,
          ...(providerRefundId === undefined ? {} : { providerRefundId }),
        },
        'refund',
      ),
  };
}
