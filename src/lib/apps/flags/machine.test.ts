import { describe, expect, it } from 'vitest';
import type { FlagState } from '@/lib/db/schema';
import type { Actor } from '@/lib/rbac';
import { flagStateMachine, switchStateOf } from './machine';

const actor = (id: string, roles: Actor['roles']): Actor => ({ id, email: `${id}@demo.co`, roles });

const engineer = actor('11111111-1111-4111-8111-111111111111', ['engineer']);
const viewer = actor('22222222-2222-4222-8222-222222222222', ['viewer']);
const admin = actor('33333333-3333-4333-8333-333333333333', ['admin']);

function flagState(fields: { enabled: boolean }): FlagState {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    flagId: '55555555-5555-4555-8555-555555555555',
    environment: 'staging',
    kind: 'boolean',
    enabled: fields.enabled,
    rolloutPercentage: 0,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('switchStateOf', () => {
  it('reads the two states off the enabled column', () => {
    expect(switchStateOf(flagState({ enabled: false }))).toBe('off');
    expect(switchStateOf(flagState({ enabled: true }))).toBe('on');
  });
});

describe('toggling an environment', () => {
  it('lets an engineer turn an environment on and off', () => {
    expect(
      flagStateMachine.can({ actor: engineer, entity: flagState({ enabled: false }), to: 'on' }),
    ).toEqual({ ok: true });
    expect(
      flagStateMachine.can({ actor: engineer, entity: flagState({ enabled: true }), to: 'off' }),
    ).toEqual({ ok: true });
  });

  it('refuses an actor who cannot write flags, in either direction', () => {
    expect(
      flagStateMachine.can({ actor: viewer, entity: flagState({ enabled: false }), to: 'on' }),
    ).toEqual({ ok: false, reason: 'missing_permission:flags.write' });
    expect(
      flagStateMachine.can({ actor: viewer, entity: flagState({ enabled: true }), to: 'off' }),
    ).toEqual({ ok: false, reason: 'missing_permission:flags.write' });
  });

  it('offers only the opposite state, so a no-op toggle is not a transition', () => {
    expect(
      flagStateMachine.availableTransitions({
        actor: engineer,
        entity: flagState({ enabled: false }),
      }),
    ).toEqual(['on']);
    expect(
      flagStateMachine.availableTransitions({
        actor: engineer,
        entity: flagState({ enabled: true }),
      }),
    ).toEqual(['off']);
    expect(
      flagStateMachine.can({ actor: admin, entity: flagState({ enabled: true }), to: 'on' }),
    ).toEqual({ ok: false, reason: 'transition_not_allowed:on->on' });
  });

  it('offers a viewer nothing at all', () => {
    expect(
      flagStateMachine.availableTransitions({
        actor: viewer,
        entity: flagState({ enabled: true }),
      }),
    ).toEqual([]);
  });
});
