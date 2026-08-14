import { slaCountdown, slaStatus, type KycState, type SlaStatus } from '@/lib/kyc';
import type { BadgeTone } from '@/lib/ui';

const STATE_TONES: Record<KycState, BadgeTone> = {
  pending: 'neutral',
  in_review: 'info',
  approved: 'success',
  rejected: 'danger',
  escalated: 'warning',
};

const SLA_TONES: Record<SlaStatus, BadgeTone> = {
  overdue: 'danger',
  due_soon: 'warning',
  on_track: 'neutral',
};

export function stateTone(state: KycState): BadgeTone {
  return STATE_TONES[state];
}

/** The SLA countdown as the queue shows it: how long is left, and how alarming that is. */
export function slaBadge(dueAt: Date): { label: string; tone: BadgeTone } {
  return { label: slaCountdown(dueAt), tone: SLA_TONES[slaStatus(dueAt)] };
}
