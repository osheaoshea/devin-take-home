import { and, eq } from 'drizzle-orm';
import { now } from '@/lib/time';
import { environmentEnum, flagStates, type FlagState } from '../schema';
import { StaleStateError, type DrizzleTx } from './core';

export interface FlagsMutations {
  /**
   * Compare-and-swap on `enabled`: `flag_states` has no generic `state` column, so the toggle
   * carries the value the guards ran against instead of using `compareAndSwapUpdate`.
   */
  setFlagEnabled(stateId: string, from: boolean, to: boolean): Promise<FlagState>;
  setFlagRolloutPercentage(stateId: string, percentage: number): Promise<FlagState>;
  /** The kill switch: every environment of one flag goes off in a single statement. */
  disableAllFlagEnvironments(flagId: string): Promise<FlagState[]>;
}

export function flagsMutations(tx: DrizzleTx): FlagsMutations {
  return {
    setFlagEnabled: async (stateId, from, to) => {
      const [updated] = await tx
        .update(flagStates)
        .set({ enabled: to, updatedAt: now() })
        .where(and(eq(flagStates.id, stateId), eq(flagStates.enabled, from)))
        .returning();
      if (updated === undefined)
        throw new StaleStateError(stateId, from ? 'on' : 'off', 'flag environment');
      return updated;
    },
    setFlagRolloutPercentage: async (stateId, percentage) => {
      const [updated] = await tx
        .update(flagStates)
        .set({ rolloutPercentage: percentage, updatedAt: now() })
        .where(eq(flagStates.id, stateId))
        .returning();
      if (updated === undefined) throw new Error(`flag environment ${stateId} no longer exists`);
      return updated;
    },
    disableAllFlagEnvironments: (flagId) =>
      tx
        .update(flagStates)
        .set({ enabled: false, updatedAt: now() })
        .where(eq(flagStates.flagId, flagId))
        .returning()
        .then((rows) => [...rows].sort(byEnvironment)),
  };
}

/** Rows come back in update order; the UI and the audit entry read dev, staging, prod. */
function byEnvironment(a: FlagState, b: FlagState): number {
  const order = environmentEnum.enumValues;
  return order.indexOf(a.environment) - order.indexOf(b.environment);
}
