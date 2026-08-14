import { describe, expect, it } from 'vitest';
import type { Actor } from '@/lib/rbac';
import { refundMachine, type RefundState, type RefundWithApprovals } from './machine';

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const FINANCE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_FINANCE_ID = '33333333-3333-4333-8333-333333333333';

const actor = (id: string, roles: Actor['roles']): Actor => ({ id, email: `${id}@demo.co`, roles });

const agent = actor(AGENT_ID, ['support_agent']);
const finance = actor(FINANCE_ID, ['finance_manager']);
const otherFinance = actor(OTHER_FINANCE_ID, ['finance_manager']);
const viewer = actor('44444444-4444-4444-8444-444444444444', ['viewer']);

/** Amounts are minor units throughout: £100 = 10_000, £5,000 = 500_000. */
function refund(fields: {
  state: RefundState;
  amountPence: number;
  approvedBy?: string;
}): RefundWithApprovals {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    customerEmail: 'customer@example.com',
    paymentId: 'pi_mock_1000',
    amountPence: fields.amountPence,
    currency: 'GBP',
    reasonCode: 'duplicate_charge',
    state: fields.state,
    requestedById: AGENT_ID,
    providerRefundId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    approvals:
      fields.approvedBy === undefined
        ? []
        : [{ approverId: fields.approvedBy, approvedAt: new Date('2026-01-01T01:00:00.000Z') }],
  };
}

describe('the £100 threshold a support agent may approve alone', () => {
  it('lets an agent approve a refund just under £100', () => {
    expect(
      refundMachine.can({
        actor: agent,
        entity: refund({ state: 'requested', amountPence: 9_999 }),
        to: 'approved',
      }),
    ).toEqual({ ok: true });
  });

  it('lets an agent approve a refund of exactly £100', () => {
    expect(
      refundMachine.can({
        actor: agent,
        entity: refund({ state: 'requested', amountPence: 10_000 }),
        to: 'approved',
      }),
    ).toEqual({ ok: true });
  });

  it('refuses an agent a refund a penny over £100, and names both thresholds it missed', () => {
    expect(
      refundMachine.can({
        actor: agent,
        entity: refund({ state: 'requested', amountPence: 10_001 }),
        to: 'approved',
      }),
    ).toEqual({
      ok: false,
      reason: 'amount_above_10000|missing_permission:refunds.approve',
    });
  });

  it('offers an agent nothing at all on a refund over £100', () => {
    expect(
      refundMachine.availableTransitions({
        actor: agent,
        entity: refund({ state: 'requested', amountPence: 10_001 }),
      }),
    ).toEqual([]);
  });
});

describe('the £5,000 threshold a finance manager may approve alone', () => {
  it('lets a finance manager approve a refund just under £5,000', () => {
    expect(
      refundMachine.can({
        actor: finance,
        entity: refund({ state: 'requested', amountPence: 499_999 }),
        to: 'approved',
      }),
    ).toEqual({ ok: true });
  });

  it('lets a finance manager approve a refund of exactly £5,000', () => {
    expect(
      refundMachine.can({
        actor: finance,
        entity: refund({ state: 'requested', amountPence: 500_000 }),
        to: 'approved',
      }),
    ).toEqual({ ok: true });
  });

  it('refuses a single approval a penny over £5,000', () => {
    expect(
      refundMachine.can({
        actor: finance,
        entity: refund({ state: 'requested', amountPence: 500_001 }),
        to: 'approved',
      }),
    ).toEqual({
      ok: false,
      reason: 'amount_above_10000|amount_above_500000',
    });
  });

  it('routes a refund over £5,000 to a second approval instead', () => {
    expect(
      refundMachine.can({
        actor: finance,
        entity: refund({ state: 'requested', amountPence: 500_001 }),
        to: 'needs_second_approval',
      }),
    ).toEqual({ ok: true });
  });

  it('refuses the dual-approval route at exactly £5,000, which one approver may settle', () => {
    expect(
      refundMachine.can({
        actor: finance,
        entity: refund({ state: 'requested', amountPence: 500_000 }),
        to: 'needs_second_approval',
      }),
    ).toEqual({ ok: false, reason: 'amount_within_single_approval' });
  });

  it('offers a finance manager exactly one route per side of the threshold', () => {
    expect(
      refundMachine.availableTransitions({
        actor: finance,
        entity: refund({ state: 'requested', amountPence: 500_000 }),
      }),
    ).toEqual(['approved', 'rejected']);
    expect(
      refundMachine.availableTransitions({
        actor: finance,
        entity: refund({ state: 'requested', amountPence: 500_001 }),
      }),
    ).toEqual(['needs_second_approval', 'rejected']);
  });
});

describe('four eyes on the second approval', () => {
  const awaitingSecond = refund({
    state: 'needs_second_approval',
    amountPence: 780_000,
    approvedBy: FINANCE_ID,
  });

  it('refuses the manager who gave the first approval', () => {
    expect(refundMachine.can({ actor: finance, entity: awaitingSecond, to: 'approved' })).toEqual({
      ok: false,
      reason: 'same_approver',
    });
  });

  it('allows a second, distinct finance manager to complete it', () => {
    expect(
      refundMachine.can({ actor: otherFinance, entity: awaitingSecond, to: 'approved' }),
    ).toEqual({ ok: true });
  });

  it('refuses an actor without the co-approval permission', () => {
    expect(refundMachine.can({ actor: agent, entity: awaitingSecond, to: 'approved' })).toEqual({
      ok: false,
      reason: 'missing_permission:refunds.co_approve',
    });
  });
});

describe('rejection and read-only actors', () => {
  it('lets a finance manager reject from either open state', () => {
    for (const state of ['requested', 'needs_second_approval'] as const) {
      expect(
        refundMachine.can({
          actor: finance,
          entity: refund({ state, amountPence: 780_000, approvedBy: OTHER_FINANCE_ID }),
          to: 'rejected',
        }),
      ).toEqual({ ok: true });
    }
  });

  it('refuses an agent the rejection, which is a finance decision', () => {
    expect(
      refundMachine.can({
        actor: agent,
        entity: refund({ state: 'requested', amountPence: 4_500 }),
        to: 'rejected',
      }),
    ).toEqual({ ok: false, reason: 'missing_permission:refunds.reject' });
  });

  it('offers a viewer no action on any refund', () => {
    expect(
      refundMachine.availableTransitions({
        actor: viewer,
        entity: refund({ state: 'requested', amountPence: 4_500 }),
      }),
    ).toEqual([]);
    expect(
      refundMachine.can({
        actor: viewer,
        entity: refund({ state: 'requested', amountPence: 4_500 }),
        to: 'approved',
      }),
    ).toEqual({
      ok: false,
      reason: 'missing_permission:refunds.approve_small|missing_permission:refunds.approve',
    });
  });
});

describe('terminal states', () => {
  it.each(['approved', 'rejected'] as const)(
    'offers no transition out of %s, even to an admin',
    (state) => {
      const admin = actor('66666666-6666-4666-8666-666666666666', ['admin']);
      const entity = refund({ state, amountPence: 4_500 });
      expect(refundMachine.availableTransitions({ actor: admin, entity })).toEqual([]);
      expect(refundMachine.can({ actor: admin, entity, to: 'rejected' })).toEqual({
        ok: false,
        reason: `transition_not_allowed:${state}->rejected`,
      });
    },
  );
});
