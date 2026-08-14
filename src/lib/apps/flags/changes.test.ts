import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readAuditLog } from '@/lib/audit';
import { closeDb, getDb } from '@/lib/db/client';
import { findFlagRowById, findFlagStateById } from '@/lib/db/queries';
import { flagStates, flags, type FlagState } from '@/lib/db/schema';
import { AuthorizationError, type Actor } from '@/lib/rbac';
import { TransitionRefusedError } from '@/lib/workflow';
import { createDemoUser, resetDatabase } from '@/test/db';
import { FlagChangeRefusedError, killFlag, setRolloutPercentage } from './changes';
import { flagStateMachine } from './machine';

let engineer: Actor;
let viewer: Actor;
let admin: Actor;

beforeEach(async () => {
  await resetDatabase();
  engineer = await createDemoUser('engineer@demo.co', ['engineer']);
  viewer = await createDemoUser('viewer@demo.co', ['viewer']);
  admin = await createDemoUser('admin@demo.co', ['admin']);
});

afterAll(async () => {
  await closeDb();
});

/** A flag with all three environments on, so a kill switch has something to switch off. */
async function insertFlag(fields: {
  key: string;
  kind?: FlagState['kind'];
  rolloutPercentage?: number;
}): Promise<string> {
  const [flag] = await getDb()
    .insert(flags)
    .values({ key: fields.key, description: `${fields.key} description` })
    .returning();
  if (flag === undefined) throw new Error('failed to insert test flag');
  for (const environment of ['dev', 'staging', 'prod'] as const) {
    await getDb()
      .insert(flagStates)
      .values({
        flagId: flag.id,
        environment,
        kind: fields.kind ?? 'boolean',
        enabled: true,
        rolloutPercentage: fields.rolloutPercentage ?? 0,
      });
  }
  return flag.id;
}

async function stateOf(flagId: string, environment: FlagState['environment']): Promise<FlagState> {
  const row = await findFlagRowById(admin, flagId);
  const state = row?.states.find((candidate) => candidate.environment === environment);
  if (state === undefined) throw new Error(`no ${environment} state for flag ${flagId}`);
  return state;
}

describe('toggling an environment through the machine', () => {
  it('flips the row and records the change against the flag_state entity', async () => {
    const flagId = await insertFlag({ key: 'checkout-v2' });
    const before = await stateOf(flagId, 'staging');

    const after = await flagStateMachine.transition({ actor: engineer, entity: before, to: 'off' });

    expect(after.enabled).toBe(false);
    const [entry] = await readAuditLog(admin, { entityType: 'flag_state', entityId: before.id });
    expect(entry).toMatchObject({
      actorId: engineer.id,
      action: 'flag_state.off',
      entityType: 'flag_state',
    });
    expect(entry?.before).toMatchObject({ enabled: true });
    expect(entry?.after).toMatchObject({ enabled: false });
  });

  it('refuses a stale read, leaving the row and the log untouched', async () => {
    const flagId = await insertFlag({ key: 'instant-payouts' });
    const stale = await stateOf(flagId, 'dev');
    await flagStateMachine.transition({ actor: engineer, entity: stale, to: 'off' });

    await expect(
      flagStateMachine.transition({ actor: engineer, entity: stale, to: 'off' }),
    ).rejects.toThrow(TransitionRefusedError);

    const entries = await readAuditLog(admin, { entityType: 'flag_state', entityId: stale.id });
    expect(entries).toHaveLength(1);
  });
});

describe('setRolloutPercentage', () => {
  it('records a percentage edit without touching enabled', async () => {
    const flagId = await insertFlag({ key: 'fraud-model-v3', kind: 'percentage' });
    const before = await stateOf(flagId, 'prod');

    const after = await setRolloutPercentage(engineer, before, 25);

    expect(after).toMatchObject({ rolloutPercentage: 25, enabled: true });
    const [entry] = await readAuditLog(admin, { entityType: 'flag_state', entityId: before.id });
    expect(entry).toMatchObject({ action: 'flag_state.rollout', actorId: engineer.id });
    expect(entry?.before).toMatchObject({ rolloutPercentage: 0 });
    expect(entry?.after).toMatchObject({ rolloutPercentage: 25 });
  });

  it('refuses an actor who cannot write flags, and writes nothing', async () => {
    const flagId = await insertFlag({ key: 'sepa-instant', kind: 'percentage' });
    const before = await stateOf(flagId, 'prod');

    await expect(setRolloutPercentage(viewer, before, 25)).rejects.toThrow(AuthorizationError);

    expect(await findFlagStateById(admin, before.id)).toMatchObject({ rolloutPercentage: 0 });
    expect(await readAuditLog(admin, { entityType: 'flag_state' })).toHaveLength(0);
  });

  it('refuses a percentage on a flag that is a plain on/off switch', async () => {
    const flagId = await insertFlag({ key: 'dashboard-dark-mode' });
    const before = await stateOf(flagId, 'prod');

    await expect(setRolloutPercentage(engineer, before, 25)).rejects.toThrow(
      new FlagChangeRefusedError('not_a_percentage_rollout'),
    );
    expect(await readAuditLog(admin, { entityType: 'flag_state' })).toHaveLength(0);
  });
});

describe('killFlag', () => {
  it('turns every environment off in one audited mutation over the flag', async () => {
    const flagId = await insertFlag({ key: 'ledger-rewrite' });

    const states = await killFlag(engineer, flagId);

    expect(states.map((state) => state.enabled)).toEqual([false, false, false]);
    const row = await findFlagRowById(admin, flagId);
    expect(row?.states.every((state) => !state.enabled)).toBe(true);

    const entries = await readAuditLog(admin, { entityType: 'flag' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: 'flag.kill_switch', entityId: flagId });
    expect(entries[0]?.before).toEqual({ dev: true, staging: true, prod: true });
    expect(entries[0]?.after).toEqual({ dev: false, staging: false, prod: false });
  });

  it('is gated on flags.kill_switch, not on the button', async () => {
    const flagId = await insertFlag({ key: 'card-3ds-step-up' });

    await expect(killFlag(viewer, flagId)).rejects.toThrow(AuthorizationError);

    const row = await findFlagRowById(admin, flagId);
    expect(row?.states.every((state) => state.enabled)).toBe(true);
    expect(await readAuditLog(admin, { entityType: 'flag' })).toHaveLength(0);
  });
});
