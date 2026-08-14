import { z } from 'zod';
import { audited } from '@/lib/audit';
import { findFlagRowById } from '@/lib/db/queries';
import type { FlagState } from '@/lib/db/schema';
import { requirePermission, type Actor } from '@/lib/rbac';
import type { Environment } from './environments';

/**
 * A refused change that is not a state transition, so it carries the same untranslated reason
 * codes as `TransitionRefusedError` and reaches the UI through the same refusal copy.
 */
export class FlagChangeRefusedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'FlagChangeRefusedError';
  }
}

const percentageSchema = z.number().int().min(0).max(100);

/**
 * A rollout edit moves no state, so it is a direct audited write rather than a transition —
 * but it is still gated on `flags.write` and still leaves a before/after trail.
 */
export async function setRolloutPercentage(
  actor: Actor,
  state: FlagState,
  percentage: number,
): Promise<FlagState> {
  requirePermission(actor, 'flags.write');
  if (state.kind !== 'percentage') throw new FlagChangeRefusedError('not_a_percentage_rollout');
  const parsed = percentageSchema.safeParse(percentage);
  if (!parsed.success) throw new FlagChangeRefusedError('invalid_percentage');

  return audited(
    {
      actor,
      action: 'flag_state.rollout',
      entityType: 'flag_state',
      entityId: state.id,
      before: state,
    },
    (tx) => tx.setFlagRolloutPercentage(state.id, parsed.data),
  );
}

/**
 * The kill switch: one audited mutation over the flag that turns every environment off. It is
 * logged against the flag rather than an environment, so the flag's history shows one entry.
 */
export async function killFlag(actor: Actor, flagId: string): Promise<FlagState[]> {
  requirePermission(actor, 'flags.kill_switch');
  const row = await findFlagRowById(actor, flagId);
  if (row === undefined) throw new FlagChangeRefusedError('flag_not_found');

  return audited(
    {
      actor,
      action: 'flag.kill_switch',
      entityType: 'flag',
      entityId: flagId,
      before: enabledByEnvironment(row.states),
      after: enabledByEnvironment,
    },
    (tx) => tx.disableAllFlagEnvironments(flagId),
  );
}

function enabledByEnvironment(states: readonly FlagState[]): Partial<Record<Environment, boolean>> {
  return Object.fromEntries(states.map((state) => [state.environment, state.enabled]));
}
