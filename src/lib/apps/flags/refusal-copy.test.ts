import { describe, expect, it } from 'vitest';
import { parseActionError, refusalCopy } from './refusal-copy';

describe('refusalCopy', () => {
  it('collapses every missing permission into one sentence', () => {
    expect(refusalCopy('missing_permission:flags.write')).toBe(
      "Your role can't perform this action.",
    );
    expect(refusalCopy('missing_permission:flags.kill_switch')).toBe(
      "Your role can't perform this action.",
    );
  });

  it('explains a percentage edit on an on/off flag', () => {
    expect(refusalCopy('not_a_percentage_rollout')).toBe(
      'This flag is a simple on/off switch, so it has no rollout percentage.',
    );
  });

  it('explains a losing race against another engineer', () => {
    expect(refusalCopy('stale_state')).toBe(
      'This environment changed while you had the page open. Reload it to see where it stands.',
    );
  });

  it('explains a toggle that would not change anything', () => {
    expect(refusalCopy('transition_not_allowed:on->on')).toBe(
      'This environment is already in that state.',
    );
  });

  it('falls back to the raw reason so a new guard is never silently swallowed', () => {
    expect(refusalCopy('brand_new_guard')).toBe('brand_new_guard');
  });
});

describe('parseActionError', () => {
  it('splits the refused control from its reason', () => {
    expect(parseActionError('toggle-staging:missing_permission:flags.write')).toEqual({
      control: 'toggle-staging',
      reason: 'missing_permission:flags.write',
    });
    expect(parseActionError('rollout-prod:not_a_percentage_rollout')).toEqual({
      control: 'rollout-prod',
      reason: 'not_a_percentage_rollout',
    });
    expect(parseActionError('kill:missing_permission:flags.kill_switch')).toEqual({
      control: 'kill',
      reason: 'missing_permission:flags.kill_switch',
    });
  });

  it('ignores anything that is not a control-qualified refusal', () => {
    expect(parseActionError(undefined)).toBeUndefined();
    expect(parseActionError('stale_state')).toBeUndefined();
    expect(parseActionError('toggle-qa:stale_state')).toBeUndefined();
    expect(parseActionError('kill:')).toBeUndefined();
  });
});
