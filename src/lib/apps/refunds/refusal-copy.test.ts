import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';
import { parseActionError, refusalCopy } from './refusal-copy';

describe('refusalCopy', () => {
  it('explains the four-eyes refusal in the approver’s terms', () => {
    expect(refusalCopy('same_approver')).toBe(
      'You gave the first approval, so a second finance manager must complete it.',
    );
  });

  it('translates each threshold refusal a rejected branch reported', () => {
    expect(refusalCopy('amount_above_10000')).toBe('Refunds over £100.00 need a finance manager.');
    expect(refusalCopy('amount_above_500000')).toBe(
      'Refunds over £5,000.00 need two finance managers, so route this one on for a second approval.',
    );
  });

  it('translates every branch of a composite refusal, without repeating itself', () => {
    expect(refusalCopy('amount_above_10000|missing_permission:refunds.approve')).toBe(
      "Refunds over £100.00 need a finance manager. Your role can't perform this action.",
    );
    expect(
      refusalCopy('missing_permission:refunds.approve_small|missing_permission:refunds.approve'),
    ).toBe("Your role can't perform this action.");
  });

  it('falls back to the raw reason so a new guard is never silently swallowed', () => {
    expect(refusalCopy('brand_new_guard')).toBe('brand_new_guard');
  });
});

describe('parseActionError', () => {
  it('splits the refused target from its reason', () => {
    expect(parseActionError('approved:same_approver')).toEqual({
      to: 'approved',
      reason: 'same_approver',
    });
  });

  it('keeps the reason intact when it carries its own colon or several branches', () => {
    expect(
      parseActionError('approved:amount_above_10000|missing_permission:refunds.approve'),
    ).toEqual({ to: 'approved', reason: 'amount_above_10000|missing_permission:refunds.approve' });
  });

  it('ignores anything that is not a state-qualified refusal', () => {
    expect(parseActionError(undefined)).toBeUndefined();
    expect(parseActionError('stale_state')).toBeUndefined();
    expect(parseActionError('not_a_state:stale_state')).toBeUndefined();
    expect(parseActionError('approved:')).toBeUndefined();
  });
});

describe('formatMoney', () => {
  it('renders minor units as pounds, and never as a float sum', () => {
    expect(formatMoney(10_000)).toBe('£100.00');
    expect(formatMoney(500_001)).toBe('£5,000.01');
    expect(formatMoney(0)).toBe('£0.00');
  });
});
