/**
 * Why a refund was raised. Stored on the refund and carried into every audit entry's
 * before/after image, so the log explains the money, not just the movement.
 */
export const REFUND_REASON_CODES = [
  'duplicate_charge',
  'item_not_received',
  'goodwill',
  'fraud_claim',
] as const;

export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number];
