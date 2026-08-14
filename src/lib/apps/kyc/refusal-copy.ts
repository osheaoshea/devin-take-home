import { KYC_STATES } from './machine';
import type { KycState } from './machine';

const COPY: Record<string, string> = {
  same_actor_as_escalator:
    'You escalated this case, so a different manager must resolve it (four-eyes).',
  stale_state: 'This case moved on while you had it open. Reopen it to see where it stands.',
  invalid_transition: 'This case can no longer move to that state.',
  invalid_reason_code: 'Choose one of the listed reason codes.',
};

/** Guard reasons are machine-facing; reviewers get a sentence, and an unmapped code passes through. */
export function refusalCopy(reason: string): string {
  const mapped = COPY[reason];
  if (mapped !== undefined) return mapped;
  if (reason.startsWith('missing_permission:')) return "Your role can't perform this action.";
  return reason;
}

/**
 * A server-side refusal comes back as `<target>:<reason>`, so the message lands under the action
 * that was actually blocked instead of every action on the case.
 */
export function parseActionError(
  error: string | undefined,
): { to: KycState; reason: string } | undefined {
  if (error === undefined) return undefined;
  const separator = error.indexOf(':');
  if (separator === -1) return undefined;
  const to = error.slice(0, separator);
  const reason = error.slice(separator + 1);
  if (!isKycState(to) || reason === '') return undefined;
  return { to, reason };
}

function isKycState(value: string): value is KycState {
  return (KYC_STATES as readonly string[]).includes(value);
}
