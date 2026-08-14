import { slaCountdown, slaStatus, type KycState, type SlaStatus } from '@/lib/apps/kyc';
import type { BadgeTone, SubmitTone } from '@/lib/ui';

const STATE_TONES: Record<KycState, BadgeTone> = {
  pending: 'neutral',
  in_review: 'info',
  approved: 'success',
  rejected: 'danger',
  escalated: 'warning',
};

const ACTION_TONES: Partial<Record<KycState, SubmitTone>> = {
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

/** An action button is coloured by the state it moves the case to, so the decision reads at a glance. */
export function actionTone(to: KycState): SubmitTone {
  return ACTION_TONES[to] ?? 'accent';
}

/** The SLA countdown as the queue shows it: how long is left, and how alarming that is. */
export function slaBadge(dueAt: Date): { label: string; tone: BadgeTone } {
  return { label: slaCountdown(dueAt), tone: SLA_TONES[slaStatus(dueAt)] };
}
