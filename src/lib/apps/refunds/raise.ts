import { randomUUID } from 'node:crypto';
import { audited } from '@/lib/audit';
import type { Refund } from '@/lib/db/schema';
import { requirePermission, type Actor } from '@/lib/rbac';
import { penceFromPounds, raiseRefundFormSchema, type RaiseRefundForm } from './raise-form';

/**
 * Opens a refund request. Raising is a create rather than a state change, so it goes straight
 * through `audited()` — the refund and its audit entry commit together or not at all.
 */
export function raiseRefund(actor: Actor, input: RaiseRefundForm): Promise<Refund> {
  requirePermission(actor, 'refunds.create');
  const { customerEmail, paymentId, amountPounds, reasonCode } = raiseRefundFormSchema.parse(input);
  const refundId = randomUUID();

  return audited(
    { actor, action: 'refund.created', entityType: 'refund', entityId: refundId },
    (tx) =>
      tx.createRefund({
        id: refundId,
        customerEmail,
        paymentId,
        amountPence: penceFromPounds(amountPounds),
        currency: 'GBP',
        reasonCode,
        requestedById: actor.id,
      }),
  );
}
