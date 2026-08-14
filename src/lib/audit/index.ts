import { getDb } from '@/lib/db/client';
import { mutations, type DrizzleTx, type Tx } from '@/lib/db/mutations';
import { selectAuditLog, type AuditEntry, type AuditLogFilter } from '@/lib/db/queries';
import { auditLog } from '@/lib/db/schema';
import type { Actor } from '@/lib/rbac';

export type { Tx } from '@/lib/db/mutations';
export type { AuditEntry, AuditLogFilter } from '@/lib/db/queries';

export interface AuditedOptions<T> {
  actor: Actor;
  /** Dotted action name, e.g. `kyc.case.approve`. */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  /** Defaults to the value the mutation returned. */
  after?: (result: T) => unknown;
}

/**
 * The only sanctioned write path. Runs the mutation and writes its audit entry in the same
 * transaction, so a change can never exist without its trail — and a failed change leaves none.
 */
export async function audited<T>(
  options: AuditedOptions<T>,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (drizzleTx: DrizzleTx) => {
    const result = await fn(mutations(drizzleTx));
    const after = options.after ? options.after(result) : result;
    await drizzleTx.insert(auditLog).values({
      actorId: options.actor.id,
      actorRolesSnapshot: [...options.actor.roles],
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId,
      before: options.before ?? null,
      after: after ?? null,
    });
    return result;
  });
}

export function readAuditLog(actor: Actor, filter: AuditLogFilter): Promise<AuditEntry[]> {
  return selectAuditLog(actor, filter);
}
