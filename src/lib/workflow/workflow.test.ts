import { describe, expect, it } from 'vitest';
import type { Actor } from '@/lib/rbac';
import {
  all,
  amountAtMost,
  any,
  defineMachine,
  distinctActor,
  hasPermission,
  hasRole,
  not,
  type Guard,
} from '@/lib/workflow';

const actor = (id: string, roles: Actor['roles']): Actor => ({
  id,
  email: `${id}@demo.co`,
  roles,
});

interface Case {
  id: string;
  state: 'pending' | 'in_review' | 'approved' | 'rejected' | 'escalated';
  escalatedBy: string | null;
}

const kycMachine = defineMachine<Case, Case['state']>({
  entityType: 'kyc_case',
  stateOf: (entity) => entity.state,
  transitions: {
    'pending->in_review': [hasPermission('kyc.claim')],
    'in_review->approved': [hasPermission('kyc.approve')],
    'in_review->escalated': [hasPermission('kyc.escalate')],
    'escalated->approved': [
      hasPermission('kyc.resolve_escalated'),
      distinctActor((entity) => entity.escalatedBy, 'four_eyes_same_actor'),
    ],
  },
  persist: async ({ entity, to }) => ({ ...entity, state: to }),
});

const pendingCase: Case = { id: 'c1', state: 'pending', escalatedBy: null };
const escalatedCase: Case = { id: 'c2', state: 'escalated', escalatedBy: 'analyst' };

describe('declared transitions', () => {
  it('allows a transition whose guards all pass', () => {
    expect(
      kycMachine.can({
        actor: actor('analyst', ['kyc_analyst']),
        entity: pendingCase,
        to: 'in_review',
      }),
    ).toEqual({ ok: true });
  });

  it('refuses a transition when a guard fails, and says which rule refused it', () => {
    expect(
      kycMachine.can({
        actor: actor('viewer', ['viewer']),
        entity: pendingCase,
        to: 'in_review',
      }),
    ).toEqual({ ok: false, reason: 'missing_permission:kyc.claim' });
  });

  it('refuses a transition that the machine does not declare', () => {
    expect(
      kycMachine.can({ actor: actor('admin', ['admin']), entity: pendingCase, to: 'approved' }),
    ).toEqual({ ok: false, reason: 'transition_not_allowed:pending->approved' });
  });

  it('treats a state with no outgoing transitions as terminal', () => {
    const approved: Case = { id: 'c3', state: 'approved', escalatedBy: null };
    expect(
      kycMachine.can({ actor: actor('admin', ['admin']), entity: approved, to: 'rejected' }),
    ).toEqual({ ok: false, reason: 'transition_not_allowed:approved->rejected' });
  });

  it('refuses a transition to the state the entity is already in', () => {
    expect(
      kycMachine.can({ actor: actor('admin', ['admin']), entity: pendingCase, to: 'pending' }),
    ).toEqual({ ok: false, reason: 'transition_not_allowed:pending->pending' });
  });

  it('lists the transitions available to this actor for this entity', () => {
    expect(
      kycMachine.availableTransitions({
        actor: actor('analyst', ['kyc_analyst']),
        entity: { id: 'c4', state: 'in_review', escalatedBy: null },
      }),
    ).toEqual(['approved', 'escalated']);
  });
});

describe('four-eyes (distinctActor)', () => {
  it('refuses the resolver who escalated the case', () => {
    expect(
      kycMachine.can({
        actor: actor('analyst', ['kyc_manager']),
        entity: escalatedCase,
        to: 'approved',
      }),
    ).toEqual({ ok: false, reason: 'four_eyes_same_actor' });
  });

  it('allows a different manager to resolve the escalated case', () => {
    expect(
      kycMachine.can({
        actor: actor('kmanager', ['kyc_manager']),
        entity: escalatedCase,
        to: 'approved',
      }),
    ).toEqual({ ok: true });
  });

  it('still requires the escalation-resolving permission from the second pair of eyes', () => {
    expect(
      kycMachine.can({
        actor: actor('other-analyst', ['kyc_analyst']),
        entity: escalatedCase,
        to: 'approved',
      }),
    ).toEqual({ ok: false, reason: 'missing_permission:kyc.resolve_escalated' });
  });
});

describe('threshold guards (amountAtMost)', () => {
  interface Refund {
    id: string;
    state: 'requested' | 'approved';
    amountPence: number;
  }

  const refundMachine = defineMachine<Refund, Refund['state']>({
    entityType: 'refund',
    stateOf: (entity) => entity.state,
    transitions: {
      'requested->approved': [
        any(
          all(
            hasRole('support_agent'),
            amountAtMost((entity) => entity.amountPence, 10_000),
          ),
          all(
            hasRole('finance_manager'),
            amountAtMost((entity) => entity.amountPence, 500_000),
          ),
        ),
      ],
    },
    persist: async ({ entity, to }) => ({ ...entity, state: to }),
  });

  const refund = (amountPence: number): Refund => ({ id: 'r1', state: 'requested', amountPence });
  const agent = actor('agent', ['support_agent']);
  const financeManager = actor('fmanager', ['finance_manager']);

  it('lets a support agent approve just under the £100 threshold', () => {
    expect(refundMachine.can({ actor: agent, entity: refund(9_999), to: 'approved' })).toEqual({
      ok: true,
    });
  });

  it('lets a support agent approve exactly £100', () => {
    expect(refundMachine.can({ actor: agent, entity: refund(10_000), to: 'approved' })).toEqual({
      ok: true,
    });
  });

  it('refuses a support agent one penny over £100', () => {
    expect(refundMachine.can({ actor: agent, entity: refund(10_001), to: 'approved' }).ok).toBe(
      false,
    );
  });

  it('lets a finance manager approve exactly £5,000 but not a penny more', () => {
    expect(
      refundMachine.can({ actor: financeManager, entity: refund(500_000), to: 'approved' }),
    ).toEqual({ ok: true });
    expect(
      refundMachine.can({ actor: financeManager, entity: refund(500_001), to: 'approved' }).ok,
    ).toBe(false);
  });
});

describe('guard combinators', () => {
  interface Doc {
    id: string;
    state: 'draft' | 'published';
  }
  const machineWith = (guards: Guard<Doc>[]) =>
    defineMachine<Doc, Doc['state']>({
      entityType: 'doc',
      stateOf: (entity) => entity.state,
      transitions: { 'draft->published': guards },
      persist: async ({ entity, to }) => ({ ...entity, state: to }),
    });

  const draft: Doc = { id: 'd1', state: 'draft' };
  const engineer = actor('engineer', ['engineer']);

  it('not() inverts a passing guard', () => {
    const machine = machineWith([not(hasRole('engineer'), 'must_not_be_engineer')]);
    expect(machine.can({ actor: engineer, entity: draft, to: 'published' })).toEqual({
      ok: false,
      reason: 'must_not_be_engineer',
    });
  });

  it('all() reports the first failing guard', () => {
    const machine = machineWith([all(hasRole('engineer'), hasRole('admin'))]);
    expect(machine.can({ actor: engineer, entity: draft, to: 'published' })).toEqual({
      ok: false,
      reason: 'missing_role:admin',
    });
  });

  it('any() passes when a single alternative passes', () => {
    const machine = machineWith([any(hasRole('admin'), hasRole('engineer'))]);
    expect(machine.can({ actor: engineer, entity: draft, to: 'published' })).toEqual({ ok: true });
  });

  it('any() fails with every alternative reason when none pass', () => {
    const machine = machineWith([any(hasRole('admin'), hasRole('viewer'))]);
    expect(machine.can({ actor: engineer, entity: draft, to: 'published' })).toEqual({
      ok: false,
      reason: 'missing_role:admin|missing_role:viewer',
    });
  });

  it('passes the caller context to guards', () => {
    const machine = machineWith([
      ({ context }) =>
        (context as { approvedBy?: string[] }).approvedBy?.length === 2
          ? true
          : { ok: false, reason: 'needs_two_approvals' },
    ]);
    expect(
      machine.can({
        actor: engineer,
        entity: draft,
        to: 'published',
        context: { approvedBy: ['a'] },
      }),
    ).toEqual({ ok: false, reason: 'needs_two_approvals' });
    expect(
      machine.can({
        actor: engineer,
        entity: draft,
        to: 'published',
        context: { approvedBy: ['a', 'b'] },
      }),
    ).toEqual({ ok: true });
  });
});

describe('transition', () => {
  it('refuses to execute a transition its guards reject', async () => {
    await expect(
      kycMachine.transition({
        actor: actor('viewer', ['viewer']),
        entity: pendingCase,
        to: 'in_review',
      }),
    ).rejects.toThrow(/missing_permission:kyc.claim/);
  });
});
