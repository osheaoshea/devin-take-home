import { and, eq } from 'drizzle-orm';
import type { AnyPgColumn, PgTable, PgTransaction, PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm/relations';
import { now } from '@/lib/time';
import type * as schema from '../schema';

export type DrizzleTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Raised when a state change matched no row because the entity had already moved on. The
 * caller read the entity outside the transaction, so the read is the stale part, not the write.
 */
export class StaleStateError extends Error {
  constructor(
    readonly entityId: string,
    readonly expected: string,
  ) {
    super(`kyc case ${entityId} is no longer in state ${expected}`);
    this.name = 'StaleStateError';
  }
}

/** A table whose rows move through a state machine and stamp their last write. */
type StatefulTable = PgTable & {
  id: AnyPgColumn;
  state: AnyPgColumn;
  updatedAt: AnyPgColumn;
};

/**
 * Compare-and-swap state update: the caller passes the state it believes the row is in, and
 * the update refuses to land on a row another transaction has already moved.
 */
export async function compareAndSwapUpdate<T extends StatefulTable>(
  tx: DrizzleTx,
  table: T,
  entityId: string,
  from: string,
  values: PgUpdateSetSource<T>,
): Promise<T['$inferSelect']> {
  const [updated] = await tx
    .update(table)
    .set({ ...values, updatedAt: now() } as PgUpdateSetSource<T>)
    .where(and(eq(table.id, entityId), eq(table.state, from)))
    .returning();
  if (updated === undefined) throw new StaleStateError(entityId, from);
  return updated;
}
