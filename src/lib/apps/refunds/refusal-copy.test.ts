import { describe, expect, it } from 'vitest';
import { formatMoney, penceFromPounds } from './money';
import { parseActionError, refusalCopy } from './refusal-copy';

describe('refusalCopy', () => {
  it('explains a missing decision permission in the reader’s terms', () => {
    expect(refusalCopy('missing_permission:refunds.approve')).toBe(
      'Deciding refunds is the finance managers’ call — your role can read them only.',
    );
  });

  it('explains a refund that has already been decided', () => {
    expect(refusalCopy('transition_not_allowed:approved->rejected')).toBe(
      'This refund has already been decided, so it can no longer move.',
    );
  });

  it('explains a refund that moved while the drawer was open', () => {
    expect(refusalCopy('stale_state')).toBe(
      'This refund moved on while you had it open. Reopen it to see where it stands.',
    );
  });

  it('translates every branch of a composite refusal, without repeating itself', () => {
    expect(
      refusalCopy('missing_permission:refunds.approve|missing_permission:refunds.reject'),
    ).toBe('Deciding refunds is the finance managers’ call — your role can read them only.');
  });

  it('falls back to the raw reason so a new guard is never silently swallowed', () => {
    expect(refusalCopy('brand_new_guard')).toBe('brand_new_guard');
  });
});

describe('parseActionError', () => {
  it('splits the refused target from its reason', () => {
    expect(parseActionError('approved:missing_permission:refunds.approve')).toEqual({
      to: 'approved',
      reason: 'missing_permission:refunds.approve',
    });
  });

  it('ignores anything that is not a state-qualified refusal', () => {
    expect(parseActionError(undefined)).toBeUndefined();
    expect(parseActionError('stale_state')).toBeUndefined();
    expect(parseActionError('needs_second_approval:stale_state')).toBeUndefined();
    expect(parseActionError('approved:')).toBeUndefined();
  });
});

describe('money', () => {
  it('renders minor units as pounds, and never as a float sum', () => {
    expect(formatMoney(10_000)).toBe('£100.00');
    expect(formatMoney(500_001)).toBe('£5,000.01');
    expect(formatMoney(0)).toBe('£0.00');
  });

  it('takes a filter in pounds back to whole minor units', () => {
    expect(penceFromPounds(100)).toBe(10_000);
    expect(penceFromPounds(12.34)).toBe(1_234);
  });
});
