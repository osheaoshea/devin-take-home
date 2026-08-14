import { z } from 'zod';
import { DUE_SOON_HOURS, KYC_STATES } from '@/lib/apps/kyc';
import { now } from '@/lib/time';

export const PAGE_SIZE = 20;

export const kycQueueParamsSchema = z.object({
  state: z.enum(KYC_STATES).optional(),
  minRisk: z.coerce.number().int().min(0).max(100).optional(),
  sla: z.enum(['overdue', 'due_soon']).optional(),
  /** "My cases": the queue scoped to the signed-in reviewer. */
  mine: z.literal('1').optional(),
  sort: z.enum(['sla', 'risk', 'applicant', 'state', 'created']).default('sla'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  case: z.string().uuid().optional(),
  /** A guard's refusal reason, passed back untranslated for inline rendering. */
  error: z.string().min(1).max(120).optional(),
});

export type KycQueueParams = z.infer<typeof kycQueueParamsSchema>;

/** Turns the SLA filter into the instant the query compares against, via `now()`. */
export function dueBeforeFor(sla: KycQueueParams['sla'], at: Date = now()): Date | undefined {
  if (sla === undefined) return undefined;
  return sla === 'overdue' ? at : new Date(at.getTime() + DUE_SOON_HOURS * 3_600_000);
}

/** Drops the empty and repeated values Next hands a page before zod sees them. */
export function singleValueParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const single = Array.isArray(value) ? value[0] : value;
      return single === undefined || single === '' ? [] : [[key, single]];
    }),
  );
}
