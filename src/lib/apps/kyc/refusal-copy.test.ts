import { describe, expect, it } from 'vitest';
import { parseActionError, refusalCopy } from './refusal-copy';

describe('refusalCopy', () => {
  it('explains the four-eyes refusal in the reviewer\u2019s terms', () => {
    expect(refusalCopy('same_actor_as_escalator')).toBe(
      'You escalated this case, so a different manager must resolve it.',
    );
  });

  it('collapses every missing permission into one sentence', () => {
    expect(refusalCopy('missing_permission:kyc.resolve_escalated')).toBe(
      "Your role can't perform this action.",
    );
    expect(refusalCopy('missing_permission:kyc.claim')).toBe(
      "Your role can't perform this action.",
    );
  });

  it('falls back to the raw reason so a new guard is never silently swallowed', () => {
    expect(refusalCopy('brand_new_guard')).toBe('brand_new_guard');
  });
});

describe('parseActionError', () => {
  it('splits the refused target from its reason', () => {
    expect(parseActionError('approved:same_actor_as_escalator')).toEqual({
      to: 'approved',
      reason: 'same_actor_as_escalator',
    });
  });

  it('keeps the reason intact when it carries its own colon', () => {
    expect(parseActionError('rejected:missing_permission:kyc.reject')).toEqual({
      to: 'rejected',
      reason: 'missing_permission:kyc.reject',
    });
  });

  it('ignores anything that is not a state-qualified refusal', () => {
    expect(parseActionError(undefined)).toBeUndefined();
    expect(parseActionError('stale_state')).toBeUndefined();
    expect(parseActionError('not_a_state:stale_state')).toBeUndefined();
    expect(parseActionError('approved:')).toBeUndefined();
  });
});
