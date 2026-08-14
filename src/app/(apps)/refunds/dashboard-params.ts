import { z } from 'zod';
import { REFUND_STATES } from '@/lib/apps/refunds';
import { now } from '@/lib/time';

export const PAGE_SIZE = 20;

const DAYS_IN_WEEK = 7;

export const refundParamsSchema = z.object({
  state: z.enum(REFUND_STATES).optional(),
  /** Entered in pounds by the person filtering; the query layer only speaks minor units. */
  minAmount: z.coerce.number().min(0).max(1_000_000).optional(),
  sort: z.enum(['created', 'amount', 'state', 'customer']).default('created'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  refund: z.string().uuid().optional(),
  /** A guard's refusal reason, passed back untranslated for inline rendering. */
  error: z.string().min(1).max(160).optional(),
});

export type RefundParams = z.infer<typeof refundParamsSchema>;

/** The start of the "approved this week" window, taken from the app's clock rather than the DB's. */
export function approvedSince(at: Date = now()): Date {
  return new Date(at.getTime() - DAYS_IN_WEEK * 24 * 3_600_000);
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
