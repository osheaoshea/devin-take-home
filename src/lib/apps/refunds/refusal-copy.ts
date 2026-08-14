import {
  REFUND_STATES,
  SINGLE_AGENT_LIMIT_PENCE,
  SINGLE_APPROVAL_LIMIT_PENCE,
  type RefundState,
} from './machine';
import { formatMoney } from './money';

const COPY: Record<string, string> = {
  same_approver: 'You gave the first approval, so a second finance manager must complete it.',
  amount_within_single_approval: `This refund is within one approver’s ${formatMoney(SINGLE_APPROVAL_LIMIT_PENCE)} limit, so approve it outright.`,
  [`amount_above_${SINGLE_AGENT_LIMIT_PENCE}`]: `Refunds over ${formatMoney(SINGLE_AGENT_LIMIT_PENCE)} need a finance manager.`,
  [`amount_above_${SINGLE_APPROVAL_LIMIT_PENCE}`]: `Refunds over ${formatMoney(SINGLE_APPROVAL_LIMIT_PENCE)} need two finance managers, so route this one on for a second approval.`,
  stale_state: 'This refund moved on while you had it open. Reopen it to see where it stands.',
};

/**
 * Guard reasons are machine-facing; approvers get a sentence. `any(...)` reports every branch it
 * refused, joined by `|`, so each part is translated and an unmapped code still passes through.
 */
export function refusalCopy(reason: string): string {
  const sentences = new Set(reason.split('|').map(copyForPart));
  return [...sentences].join(' ');
}

function copyForPart(reason: string): string {
  const mapped = COPY[reason];
  if (mapped !== undefined) return mapped;
  if (reason.startsWith('missing_permission:')) return "Your role can't perform this action.";
  if (reason.startsWith('transition_not_allowed:'))
    return 'This refund can no longer move to that state.';
  return reason;
}

/**
 * A server-side refusal comes back as `<target>:<reason>`, so the message lands under the action
 * that was actually blocked instead of every action on the refund.
 */
export function parseActionError(
  error: string | undefined,
): { to: RefundState; reason: string } | undefined {
  if (error === undefined) return undefined;
  const separator = error.indexOf(':');
  if (separator === -1) return undefined;
  const to = error.slice(0, separator);
  const reason = error.slice(separator + 1);
  if (!isRefundState(to) || reason === '') return undefined;
  return { to, reason };
}

function isRefundState(value: string): value is RefundState {
  return (REFUND_STATES as readonly string[]).includes(value);
}
