import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readAuditLog } from '@/lib/audit';
import { closeDb } from '@/lib/db/client';
import { findRefundRowById } from '@/lib/db/queries';
import { MockStripeProvider, paymentsProvider } from '@/lib/providers';
import type { Actor } from '@/lib/rbac';
import { createDemoUser, insertRefund, resetDatabase } from '@/test/db';
import { refundMachine } from './machine';

let agent: Actor;
let finance: Actor;
let admin: Actor;

beforeEach(async () => {
  await resetDatabase();
  agent = await createDemoUser('agent@demo.co', ['support_agent']);
  finance = await createDemoUser('fmanager@demo.co', ['finance_manager']);
  admin = await createDemoUser('admin@demo.co', ['admin']);
});

afterAll(async () => {
  await closeDb();
});

const rowFor = async (actor: Actor, refundId: string) => {
  const row = await findRefundRowById(actor, refundId);
  if (row === undefined) throw new Error(`refund ${refundId} not found`);
  return row;
};

const seedRequest = (amountPence: number): Promise<string> =>
  insertRefund({ requestedById: agent.id, amountPence });

const providerIssueCount = (): number => {
  const provider = paymentsProvider();
  if (!(provider instanceof MockStripeProvider)) throw new Error('expected the mock provider');
  return provider.issuedRefunds().length;
};

describe('approving a refund', () => {
  it('issues with the provider, records the decider and audits it in one transaction', async () => {
    const refundId = await seedRequest(780_000);

    await refundMachine.transition({
      actor: finance,
      entity: await rowFor(finance, refundId),
      to: 'approved',
      context: { actorId: finance.id },
    });

    const settled = await rowFor(admin, refundId);
    expect(settled).toMatchObject({ state: 'approved', decidedById: finance.id });
    expect(settled.decidedByEmail).toBe('fmanager@demo.co');
    expect(settled.decidedAt).toBeInstanceOf(Date);
    expect(settled.providerRefundId).toMatch(/^re_/);
    expect(
      (await readAuditLog(admin, { entityId: refundId })).map((entry) => entry.action),
    ).toEqual(['refund.approved']);
  });
});

describe('rejecting a refund', () => {
  it('never reaches the payments provider, but still records who decided it', async () => {
    const refundId = await seedRequest(4_500);

    await refundMachine.transition({
      actor: finance,
      entity: await rowFor(finance, refundId),
      to: 'rejected',
      context: { actorId: finance.id },
    });

    const rejected = await rowFor(admin, refundId);
    expect(rejected).toMatchObject({
      state: 'rejected',
      providerRefundId: null,
      decidedById: finance.id,
    });
    expect(
      (await readAuditLog(admin, { entityId: refundId })).map((entry) => entry.action),
    ).toEqual(['refund.rejected']);
  });
});

describe('a refusal', () => {
  it('leaves no state change, no provider call and no audit entry', async () => {
    const refundId = await seedRequest(4_500);

    await expect(
      refundMachine.transition({
        actor: agent,
        entity: await rowFor(agent, refundId),
        to: 'approved',
        context: { actorId: agent.id },
      }),
    ).rejects.toMatchObject({ reason: 'missing_permission:refunds.approve' });

    expect(await rowFor(admin, refundId)).toMatchObject({
      state: 'requested',
      providerRefundId: null,
      decidedById: null,
      decidedAt: null,
    });
    expect(await readAuditLog(admin, { entityId: refundId })).toHaveLength(0);
  });

  it('never reaches the provider when the compare-and-swap loses to a concurrent decision', async () => {
    const refundId = await seedRequest(780_000);
    const staleRead = await rowFor(finance, refundId);
    await refundMachine.transition({
      actor: finance,
      entity: staleRead,
      to: 'rejected',
      context: { actorId: finance.id },
    });

    const issuedBefore = providerIssueCount();
    await expect(
      refundMachine.transition({
        actor: finance,
        entity: staleRead,
        to: 'approved',
        context: { actorId: finance.id },
      }),
    ).rejects.toMatchObject({ reason: 'stale_state' });

    expect(providerIssueCount()).toBe(issuedBefore);
    expect(await rowFor(admin, refundId)).toMatchObject({
      state: 'rejected',
      providerRefundId: null,
    });
    expect(
      (await readAuditLog(admin, { entityId: refundId })).map((entry) => entry.action),
    ).toEqual(['refund.rejected']);
  });

  it('refuses a second decision on an already decided refund', async () => {
    const refundId = await seedRequest(4_500);
    const request = await rowFor(finance, refundId);
    await refundMachine.transition({
      actor: finance,
      entity: request,
      to: 'approved',
      context: { actorId: finance.id },
    });

    await expect(
      refundMachine.transition({
        actor: finance,
        entity: await rowFor(finance, refundId),
        to: 'rejected',
        context: { actorId: finance.id },
      }),
    ).rejects.toMatchObject({ reason: 'transition_not_allowed:approved->rejected' });

    expect(await readAuditLog(admin, { entityId: refundId })).toHaveLength(1);
  });
});
