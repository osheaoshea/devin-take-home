import { describe, expect, it } from 'vitest';
import { approvalStepsFor, approvalsRequired } from './steps';

const approval = (approverEmail: string, iso: string) => ({
  approverEmail,
  approvedAt: new Date(iso),
});

describe('approvalsRequired', () => {
  it('turns on four eyes only above £5,000, at the exact boundary', () => {
    expect(approvalsRequired(499_900)).toBe(1);
    expect(approvalsRequired(500_000)).toBe(1);
    expect(approvalsRequired(500_001)).toBe(2);
  });
});

describe('approvalStepsFor', () => {
  it('shows one pending step for a refund one approver can settle', () => {
    expect(approvalStepsFor({ amountPence: 48_000, approvals: [] })).toEqual([
      { label: 'Approval' },
    ]);
  });

  it('shows the second step still pending once the first approval is in', () => {
    expect(
      approvalStepsFor({
        amountPence: 780_000,
        approvals: [approval('fmanager@demo.co', '2026-01-05T09:00:00.000Z')],
      }),
    ).toEqual([
      {
        label: 'First approval (above £5,000.00)',
        approvedBy: 'fmanager@demo.co',
        approvedAt: new Date('2026-01-05T09:00:00.000Z'),
      },
      { label: 'Second approval (a different finance manager)' },
    ]);
  });

  it('attributes both approvals once four eyes have signed off', () => {
    const steps = approvalStepsFor({
      amountPence: 780_000,
      approvals: [
        approval('fmanager@demo.co', '2026-01-05T09:00:00.000Z'),
        approval('fmanager2@demo.co', '2026-01-05T10:00:00.000Z'),
      ],
    });
    expect(steps.map((step) => step.approvedBy)).toEqual(['fmanager@demo.co', 'fmanager2@demo.co']);
  });
});
