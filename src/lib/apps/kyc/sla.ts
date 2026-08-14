import { now } from '@/lib/time';

/** Hours a new case has before it breaches its SLA. */
export const SLA_HOURS = 24;

/** How close to the due-at a case has to be before the queue flags it. */
export const DUE_SOON_HOURS = 4;

const HOUR_MS = 3_600_000;

export type SlaStatus = 'overdue' | 'due_soon' | 'on_track';

export function slaDueAtFor(receivedAt: Date = now()): Date {
  return new Date(receivedAt.getTime() + SLA_HOURS * HOUR_MS);
}

export function slaStatus(dueAt: Date, at: Date = now()): SlaStatus {
  const remaining = dueAt.getTime() - at.getTime();
  if (remaining <= 0) return 'overdue';
  return remaining <= DUE_SOON_HOURS * HOUR_MS ? 'due_soon' : 'on_track';
}

/** Countdown for the queue badge, e.g. `3h 12m left` or `1h 5m overdue`. */
export function slaCountdown(dueAt: Date, at: Date = now()): string {
  const remaining = dueAt.getTime() - at.getTime();
  const minutes = Math.floor(Math.abs(remaining) / 60_000);
  const label = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return remaining <= 0 ? `${label} overdue` : `${label} left`;
}
