import type { KycState } from './machine';

/**
 * Reason codes a reviewer picks when resolving a case. They are stored on the case and end up
 * in the audit entry's after-image, so the log explains *why* a case moved, not just that it did.
 */
export const KYC_REASON_CODES: Partial<Record<KycState, readonly string[]>> = {
  approved: ['documents_verified', 'low_risk_cleared', 'manual_review_passed'],
  rejected: ['document_mismatch', 'expired_document', 'watchlist_hit', 'suspected_fraud'],
  escalated: ['needs_manager_review', 'watchlist_hit', 'document_quality'],
};

export function reasonCodesFor(to: KycState): readonly string[] {
  return KYC_REASON_CODES[to] ?? [];
}
