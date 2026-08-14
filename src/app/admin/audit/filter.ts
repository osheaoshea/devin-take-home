import { z } from 'zod';

export const PAGE_SIZE = 25;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `<input type="date">` submits a day, not an instant. As an inclusive upper bound that day has to
 * run to its last millisecond, or filtering "up to today" hides everything that happened today.
 */
const inclusiveEndDate = z.union([
  z
    .string()
    .regex(DATE_ONLY)
    .transform((day) => new Date(`${day}T23:59:59.999Z`)),
  z.coerce.date(),
]);

export const auditFilterSchema = z.object({
  actorId: z.string().uuid().optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: inclusiveEndDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  entry: z.string().uuid().optional(),
});

export type AuditFilter = z.infer<typeof auditFilterSchema>;
