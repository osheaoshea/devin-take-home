import { asc, count, eq } from 'drizzle-orm';
import { requirePermission, type Actor } from '@/lib/rbac';
import { getDb } from '../client';
import { flagStates, flags, type Flag, type FlagState } from '../schema';

/** A flag with one row per environment, ordered dev, staging, prod — what the admin page shows. */
export interface FlagRow extends Flag {
  states: FlagState[];
}

/** The public shape: what a flag evaluates to in one environment, with no ids or timestamps. */
export interface FlagEvaluation {
  key: string;
  enabled: boolean;
  kind: FlagState['kind'];
  rolloutPercentage: number;
}

export async function countFlags(actor: Actor): Promise<number> {
  requirePermission(actor, 'flags.read');
  const [row] = await getDb().select({ total: count() }).from(flags);
  return row?.total ?? 0;
}

export async function selectFlagRows(actor: Actor): Promise<FlagRow[]> {
  requirePermission(actor, 'flags.read');
  const rows = await getDb()
    .select({ flag: flags, state: flagStates })
    .from(flags)
    .leftJoin(flagStates, eq(flagStates.flagId, flags.id))
    .orderBy(asc(flags.key), asc(flagStates.environment));

  const byId = new Map<string, FlagRow>();
  for (const { flag, state } of rows) {
    const row = byId.get(flag.id) ?? { ...flag, states: [] };
    if (state !== null) row.states.push(state);
    byId.set(flag.id, row);
  }
  return [...byId.values()];
}

export async function findFlagRowById(actor: Actor, flagId: string): Promise<FlagRow | undefined> {
  requirePermission(actor, 'flags.read');
  const [flag] = await getDb().select().from(flags).where(eq(flags.id, flagId)).limit(1);
  if (flag === undefined) return undefined;
  const states = await getDb()
    .select()
    .from(flagStates)
    .where(eq(flagStates.flagId, flagId))
    .orderBy(asc(flagStates.environment));
  return { ...flag, states };
}

export async function findFlagStateById(
  actor: Actor,
  stateId: string,
): Promise<FlagState | undefined> {
  requirePermission(actor, 'flags.read');
  const [row] = await getDb().select().from(flagStates).where(eq(flagStates.id, stateId)).limit(1);
  return row;
}

/**
 * The one deliberately actor-less accessor: `GET /api/flags/[env]` is the public read side of
 * the platform (spec 03), so it takes no actor and can only ever read.
 */
export async function selectFlagEvaluations(
  environment: FlagState['environment'],
): Promise<FlagEvaluation[]> {
  return getDb()
    .select({
      key: flags.key,
      enabled: flagStates.enabled,
      kind: flagStates.kind,
      rolloutPercentage: flagStates.rolloutPercentage,
    })
    .from(flagStates)
    .innerJoin(flags, eq(flags.id, flagStates.flagId))
    .where(eq(flagStates.environment, environment))
    .orderBy(asc(flags.key));
}
