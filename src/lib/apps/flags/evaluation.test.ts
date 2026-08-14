import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db/client';
import { closeDb } from '@/lib/db/client';
import { flagStates, flags } from '@/lib/db/schema';
import { setNow } from '@/lib/time';
import { resetDatabase } from '@/test/db';
import { environmentSchema } from './environments';
import { evaluateFlags } from './evaluation';

const AT = new Date('2026-03-01T09:00:00.000Z');

beforeEach(async () => {
  await resetDatabase();
  setNow(AT);
});

afterEach(() => {
  setNow();
});

afterAll(async () => {
  await closeDb();
});

async function insertFlag(fields: {
  key: string;
  environment: 'dev' | 'staging' | 'prod';
  enabled: boolean;
  kind?: 'boolean' | 'percentage';
  rolloutPercentage?: number;
}): Promise<void> {
  const [flag] = await getDb()
    .insert(flags)
    .values({ key: fields.key, description: `${fields.key} description` })
    .onConflictDoUpdate({ target: flags.key, set: { description: fields.key } })
    .returning();
  if (flag === undefined) throw new Error('failed to insert test flag');
  await getDb()
    .insert(flagStates)
    .values({
      flagId: flag.id,
      environment: fields.environment,
      kind: fields.kind ?? 'boolean',
      enabled: fields.enabled,
      rolloutPercentage: fields.rolloutPercentage ?? 0,
    });
}

describe('environmentSchema', () => {
  it('accepts the three environments and nothing else', () => {
    expect(environmentSchema.parse('prod')).toBe('prod');
    expect(environmentSchema.safeParse('qa').success).toBe(false);
    expect(environmentSchema.safeParse('PROD').success).toBe(false);
  });
});

describe('evaluateFlags', () => {
  it('returns one entry per flag in the environment, keyed and ordered by flag key', async () => {
    await insertFlag({ key: 'instant-payouts', environment: 'staging', enabled: true });
    await insertFlag({
      key: 'checkout-v2',
      environment: 'staging',
      enabled: true,
      kind: 'percentage',
      rolloutPercentage: 30,
    });
    await insertFlag({ key: 'ledger-rewrite', environment: 'prod', enabled: true });

    expect(await evaluateFlags('staging')).toEqual({
      environment: 'staging',
      evaluatedAt: '2026-03-01T09:00:00.000Z',
      flags: [
        { key: 'checkout-v2', enabled: true, kind: 'percentage', rolloutPercentage: 30 },
        { key: 'instant-payouts', enabled: true, kind: 'boolean', rolloutPercentage: 0 },
      ],
    });
  });

  it('reports an environment with no flags as an empty evaluation', async () => {
    expect(await evaluateFlags('dev')).toEqual({
      environment: 'dev',
      evaluatedAt: '2026-03-01T09:00:00.000Z',
      flags: [],
    });
  });
});
