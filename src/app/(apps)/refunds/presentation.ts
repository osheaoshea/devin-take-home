import type { RefundState } from '@/lib/apps/refunds';
import type { BadgeTone } from '@/lib/ui';

const STATE_TONES: Record<RefundState, BadgeTone> = {
  requested: 'neutral',
  approved: 'success',
  rejected: 'danger',
};

/** What each transition is called for the person taking it, rather than for the machine. */
const ACTION_LABELS: Partial<Record<RefundState, string>> = {
  approved: 'Approve',
  rejected: 'Reject',
};

export function stateTone(state: RefundState): BadgeTone {
  return STATE_TONES[state];
}

export function actionLabel(to: RefundState): string {
  return ACTION_LABELS[to] ?? to;
}
