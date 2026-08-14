import type { FlagState } from '@/lib/db/schema';
import type { BadgeTone } from '@/lib/ui';

/** How one environment reads at a glance: `on 30%` for a rollout, `on` / `off` for a switch. */
export function stateLabel(state: FlagState): string {
  const switched = state.enabled ? 'on' : 'off';
  return state.kind === 'percentage' ? `${switched} ${state.rolloutPercentage}%` : switched;
}

export function stateTone(state: FlagState): BadgeTone {
  return state.enabled ? 'success' : 'neutral';
}
