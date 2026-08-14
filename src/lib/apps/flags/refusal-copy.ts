import { ENVIRONMENTS } from './environments';

const COPY: Record<string, string> = {
  not_a_percentage_rollout: 'This flag is a simple on/off switch, so it has no rollout percentage.',
  invalid_percentage: 'Enter a whole number between 0 and 100.',
  stale_state:
    'This environment changed while you had the page open. Reload it to see where it stands.',
  flag_not_found: 'This flag no longer exists.',
};

/** Guard reasons are machine-facing; engineers get a sentence, and an unmapped code passes through. */
export function refusalCopy(reason: string): string {
  const mapped = COPY[reason];
  if (mapped !== undefined) return mapped;
  if (reason.startsWith('missing_permission:')) return "Your role can't perform this action.";
  if (reason.startsWith('transition_not_allowed:'))
    return 'This environment is already in that state.';
  return reason;
}

/** The controls a refusal can belong to: one per environment, plus the flag-wide kill switch. */
export const FLAG_CONTROLS: readonly string[] = [
  ...ENVIRONMENTS.map((environment) => `toggle-${environment}`),
  ...ENVIRONMENTS.map((environment) => `rollout-${environment}`),
  'kill',
];

/**
 * A server-side refusal comes back as `<control>:<reason>`, so the message lands under the
 * control that was actually blocked instead of under every control on the flag.
 */
export function parseActionError(
  error: string | undefined,
): { control: string; reason: string } | undefined {
  if (error === undefined) return undefined;
  const separator = error.indexOf(':');
  if (separator === -1) return undefined;
  const control = error.slice(0, separator);
  const reason = error.slice(separator + 1);
  if (!FLAG_CONTROLS.includes(control) || reason === '') return undefined;
  return { control, reason };
}
