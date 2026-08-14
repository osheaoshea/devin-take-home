import { describe, expect, it } from 'vitest';
import type { Refund } from '@/lib/db/schema';
import type { Actor } from '@/lib/rbac';
import { refundMachine, type RefundState } from './machine';

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const FINANCE_ID = '22222222-2222-4222-8222-222222222222';

const actor = (id: string, roles: Actor['roles']): Actor => ({ id, email: `${id}@demo.co`, roles });

const agent = actor(AGENT_ID, ['support_agent']);
const finance = actor(FINANCE_ID, ['finance_manager']);
const viewer = actor('44444444-4444-4444-8444-444444444444', ['viewer']);

function refund(state: RefundState): Refund {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    customerEmail: 'customer@example.com',
    paymentId: 'pi_mock_1000',
    amountPence: 780_000,
    currency: 'GBP',
    reasonCode: 'duplicate_charge',
    state,
    requestedById: AGENT_ID,
    decidedById: null,
    decidedAt: null,
    providerRefundId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('deciding a requested refund', () => {
  it('lets a finance manager approve or reject it, whatever the amount', () => {
    const entity = refund('requested');
    expect(refundMachine.can({ actor: finance, entity, to: 'approved' })).toEqual({ ok: true });
    expect(refundMachine.can({ actor: finance, entity, to: 'rejected' })).toEqual({ ok: true });
    expect(refundMachine.availableTransitions({ actor: finance, entity })).toEqual([
      'approved',
      'rejected',
    ]);
  });

  it('refuses a support agent, who may read refunds but not decide them', () => {
    const entity = refund('requested');
    expect(refundMachine.can({ actor: agent, entity, to: 'approved' })).toEqual({
      ok: false,
      reason: 'missing_permission:refunds.approve',
    });
    expect(refundMachine.can({ actor: agent, entity, to: 'rejected' })).toEqual({
      ok: false,
      reason: 'missing_permission:refunds.reject',
    });
    expect(refundMachine.availableTransitions({ actor: agent, entity })).toEqual([]);
  });

  it('offers a viewer no action at all', () => {
    const entity = refund('requested');
    expect(refundMachine.availableTransitions({ actor: viewer, entity })).toEqual([]);
    expect(refundMachine.can({ actor: viewer, entity, to: 'approved' })).toEqual({
      ok: false,
      reason: 'missing_permission:refunds.approve',
    });
  });
});

describe('terminal states', () => {
  it.each(['approved', 'rejected'] as const)(
    'offers no transition out of %s, even to an admin',
    (state) => {
      const admin = actor('66666666-6666-4666-8666-666666666666', ['admin']);
      const entity = refund(state);
      expect(refundMachine.availableTransitions({ actor: admin, entity })).toEqual([]);
      expect(refundMachine.can({ actor: admin, entity, to: 'rejected' })).toEqual({
        ok: false,
        reason: `transition_not_allowed:${state}->rejected`,
      });
    },
  );
});
