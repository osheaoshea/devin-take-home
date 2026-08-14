import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readAuditLog } from '@/lib/audit';
import { closeDb } from '@/lib/db/client';
import { findRefundRowById } from '@/lib/db/queries';
import type { Actor } from '@/lib/rbac';
import { createDemoUser, resetDatabase } from '@/test/db';
import { refundMachine } from './machine';
import { raiseRefund } from './raise';

let agent: Actor;
let finance: Actor;
let otherFinance: Actor;
let admin: Actor;

beforeEach(async () => {
  await resetDatabase();
  agent = await createDemoUser('agent@demo.co', ['support_agent']);
  finance = await createDemoUser('fmanager@demo.co', ['finance_manager']);
  otherFinance = await createDemoUser('fmanager2@demo.co', ['finance_manager']);
  admin = await createDemoUser('admin@demo.co', ['admin']);
});

afterAll(async () => {
  await closeDb();
});

async function raise(amountPounds: number): Promise<string> {
  const refund = await raiseRefund(agent, {
    customerEmail: 'customer@example.com',
    paymentId: 'pi_mock_1000',
    amountPounds,
    reasonCode: 'duplicate_charge',
  });
  return refund.id;
}

const rowFor = async (actor: Actor, refundId: string) => {
  const row = await findRefundRowById(actor, refundId);
  if (row === undefined) throw new Error(`refund ${refundId} not found`);
  return row;
};

describe('a refund settled by one approver', () => {
  it('issues with the provider and stores the refund id it returned', async () => {
    const refundId = await raise(480);

    await refundMachine.transition({
      actor: finance,
      entity: await rowFor(finance, refundId),
      to: 'approved',
      context: { actorId: finance.id },
    });

    const settled = await rowFor(admin, refundId);
    expect(settled).toMatchObject({ state: 'approved' });
    expect(settled.providerRefundId).toMatch(/^re_/);
    expect(settled.approvals).toMatchObject([{ approverId: finance.id }]);
  });
});

describe('a refund above the single-approval limit', () => {
  it('records the first approval without sending money, then settles on the second', async () => {
    const refundId = await raise(7_800);

    await refundMachine.transition({
      actor: finance,
      entity: await rowFor(finance, refundId),
      to: 'needs_second_approval',
      context: { actorId: finance.id },
    });

    const routed = await rowFor(admin, refundId);
    expect(routed).toMatchObject({ state: 'needs_second_approval', providerRefundId: null });
    expect(routed.approvals).toMatchObject([{ approverEmail: 'fmanager@demo.co' }]);

    await refundMachine.transition({
      actor: otherFinance,
      entity: routed,
      to: 'approved',
      context: { actorId: otherFinance.id },
    });

    const settled = await rowFor(admin, refundId);
    expect(settled.state).toBe('approved');
    expect(settled.providerRefundId).toMatch(/^re_/);
    expect(settled.approvals.map((approval) => approval.approverEmail)).toEqual([
      'fmanager@demo.co',
      'fmanager2@demo.co',
    ]);
    expect(
      (await readAuditLog(admin, { entityId: refundId })).map((entry) => entry.action),
    ).toEqual(['refund.approved', 'refund.needs_second_approval', 'refund.created']);
  });

  it('leaves no approval row, no state change and no audit entry when four eyes refuse it', async () => {
    const refundId = await raise(7_800);
    await refundMachine.transition({
      actor: finance,
      entity: await rowFor(finance, refundId),
      to: 'needs_second_approval',
      context: { actorId: finance.id },
    });

    await expect(
      refundMachine.transition({
        actor: finance,
        entity: await rowFor(finance, refundId),
        to: 'approved',
        context: { actorId: finance.id },
      }),
    ).rejects.toMatchObject({ reason: 'same_approver' });

    const untouched = await rowFor(admin, refundId);
    expect(untouched).toMatchObject({ state: 'needs_second_approval', providerRefundId: null });
    expect(untouched.approvals).toHaveLength(1);
    expect(await readAuditLog(admin, { entityId: refundId })).toHaveLength(2);
  });
});

describe('a rejected refund', () => {
  it('never reaches the payments provider', async () => {
    const refundId = await raise(48);

    await refundMachine.transition({
      actor: finance,
      entity: await rowFor(finance, refundId),
      to: 'rejected',
      context: { actorId: finance.id },
    });

    const rejected = await rowFor(admin, refundId);
    expect(rejected).toMatchObject({ state: 'rejected', providerRefundId: null });
    expect(rejected.approvals).toHaveLength(0);
  });
});
