import { SINGLE_APPROVAL_LIMIT_PENCE } from './machine';
import { formatMoney } from './money';

/** Above the single-approval limit a refund needs four eyes, so two rows rather than one. */
export const APPROVALS_REQUIRED_ABOVE_LIMIT = 2;

export interface RefundApprovalStep {
  label: string;
  approvedBy?: string;
  approvedAt?: Date;
}

interface ApprovalGiven {
  approverEmail: string;
  approvedAt: Date;
}

export function approvalsRequired(amountPence: number): number {
  return amountPence > SINGLE_APPROVAL_LIMIT_PENCE ? APPROVALS_REQUIRED_ABOVE_LIMIT : 1;
}

/**
 * The approvals this refund's amount demands, matched up with the ones it has — which is what
 * `ApprovalFlow` renders. Derived from the amount, so the chain shown is the chain the guards
 * will actually enforce.
 */
export function approvalStepsFor(refund: {
  amountPence: number;
  approvals: readonly ApprovalGiven[];
}): RefundApprovalStep[] {
  const required = approvalsRequired(refund.amountPence);
  return Array.from({ length: required }, (_, index) => {
    const given = refund.approvals[index];
    return {
      label: labelFor(index, required),
      ...(given === undefined
        ? {}
        : { approvedBy: given.approverEmail, approvedAt: given.approvedAt }),
    };
  });
}

function labelFor(index: number, required: number): string {
  if (required === 1) return 'Approval';
  return index === 0
    ? `First approval (above ${formatMoney(SINGLE_APPROVAL_LIMIT_PENCE)})`
    : 'Second approval (a different finance manager)';
}
