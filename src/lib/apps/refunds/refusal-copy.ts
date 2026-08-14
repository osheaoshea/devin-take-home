import { REFUND_STATES, type RefundState } from './machine';

const COPY: Record<string, string> = {
  stale_state: 'This refund moved on while you had it open. Reopen it to see where it stands.',
};

/**
 * Guard reasons are machine-facing; the person deciding gets a sentence. Composite guards report
 * every branch they refused joined by `|`, so each part is translated and an unmapped code still
 * passes through rather than being silently swallowed.
 */
export function refusalCopy(reason: string): string {
  const sentences = new Set(reason.split('|').map(copyForPart));
  return [...sentences].join(' ');
}

function copyForPart(reason: string): string {
  const mapped = COPY[reason];
  if (mapped !== undefined) return mapped;
  if (reason.startsWith('missing_permission:'))
    return 'Deciding refunds is the finance managers’ call — your role can read them only.';
  if (reason.startsWith('transition_not_allowed:'))
    return 'This refund has already been decided, so it can no longer move.';
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
