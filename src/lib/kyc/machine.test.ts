import { describe, expect, it } from 'vitest';
import type { KycCase } from '@/lib/db/schema';
import type { Actor } from '@/lib/rbac';
import { kycMachine, type KycState } from './machine';

const ANALYST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ANALYST_ID = '22222222-2222-4222-8222-222222222222';
const MANAGER_ID = '33333333-3333-4333-8333-333333333333';

const actor = (id: string, roles: Actor['roles']): Actor => ({ id, email: `${id}@demo.co`, roles });

const analyst = actor(ANALYST_ID, ['kyc_analyst']);
const otherAnalyst = actor(OTHER_ANALYST_ID, ['kyc_analyst']);
const manager = actor(MANAGER_ID, ['kyc_manager']);
const viewer = actor('44444444-4444-4444-8444-444444444444', ['viewer']);

function kycCase(fields: { state: KycState; escalatedById?: string | null }): KycCase {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    applicantName: 'Grace Hopper',
    applicantDob: '1906-12-09',
    country: 'US',
    documentType: 'passport',
    documentImageUrls: ['https://placeholder.invalid/doc-front.png'],
    providerRiskScore: 42,
    watchlistHits: [],
    state: fields.state,
    assignedToId: null,
    escalatedById: fields.escalatedById ?? null,
    resolutionReasonCode: null,
    slaDueAt: new Date('2026-01-02T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('claiming and reviewing a standard case', () => {
  it('lets an analyst claim a pending case', () => {
    expect(
      kycMachine.can({ actor: analyst, entity: kycCase({ state: 'pending' }), to: 'in_review' }),
    ).toEqual({
      ok: true,
    });
  });

  it('refuses a claim from an actor without the claim permission', () => {
    expect(
      kycMachine.can({ actor: viewer, entity: kycCase({ state: 'pending' }), to: 'in_review' }),
    ).toEqual({
      ok: false,
      reason: 'missing_permission:kyc.claim',
    });
  });

  it('lets an analyst approve, reject or escalate a case under review', () => {
    expect(
      kycMachine
        .availableTransitions({ actor: analyst, entity: kycCase({ state: 'in_review' }) })
        .sort(),
    ).toEqual(['approved', 'escalated', 'rejected']);
  });

  it('refuses a viewer every action on a case under review', () => {
    expect(
      kycMachine.availableTransitions({ actor: viewer, entity: kycCase({ state: 'in_review' }) }),
    ).toEqual([]);
  });

  it('refuses a decision on a pending case that nobody has claimed', () => {
    expect(
      kycMachine.can({ actor: analyst, entity: kycCase({ state: 'pending' }), to: 'approved' }),
    ).toEqual({
      ok: false,
      reason: 'transition_not_allowed:pending->approved',
    });
  });
});

describe('four-eyes resolution of an escalated case', () => {
  const escalatedByAnalyst = kycCase({ state: 'escalated', escalatedById: ANALYST_ID });

  it('refuses an analyst, who cannot resolve escalations at all', () => {
    expect(
      kycMachine.can({ actor: otherAnalyst, entity: escalatedByAnalyst, to: 'approved' }),
    ).toEqual({
      ok: false,
      reason: 'missing_permission:kyc.resolve_escalated',
    });
  });

  it('refuses the manager who escalated the case themselves', () => {
    const escalatedByManager = kycCase({ state: 'escalated', escalatedById: MANAGER_ID });
    expect(kycMachine.can({ actor: manager, entity: escalatedByManager, to: 'approved' })).toEqual({
      ok: false,
      reason: 'same_actor_as_escalator',
    });
  });

  it('allows a manager who did not escalate the case to approve it', () => {
    expect(kycMachine.can({ actor: manager, entity: escalatedByAnalyst, to: 'approved' })).toEqual({
      ok: true,
    });
  });

  it('applies the same four-eyes rule to rejection', () => {
    const escalatedByManager = kycCase({ state: 'escalated', escalatedById: MANAGER_ID });
    expect(kycMachine.can({ actor: manager, entity: escalatedByManager, to: 'rejected' })).toEqual({
      ok: false,
      reason: 'same_actor_as_escalator',
    });
    expect(kycMachine.can({ actor: manager, entity: escalatedByAnalyst, to: 'rejected' })).toEqual({
      ok: true,
    });
  });

  it('offers a manager both resolutions and nothing else', () => {
    expect(
      kycMachine.availableTransitions({ actor: manager, entity: escalatedByAnalyst }).sort(),
    ).toEqual(['approved', 'rejected']);
  });
});

describe('terminal states', () => {
  it.each(['approved', 'rejected'] as const)(
    'offers no transition out of %s, even to an admin',
    (state) => {
      const admin = actor('66666666-6666-4666-8666-666666666666', ['admin']);
      const entity = kycCase({ state });
      expect(kycMachine.availableTransitions({ actor: admin, entity })).toEqual([]);
      expect(kycMachine.can({ actor: admin, entity, to: 'in_review' })).toEqual({
        ok: false,
        reason: `transition_not_allowed:${state}->in_review`,
      });
    },
  );
});
