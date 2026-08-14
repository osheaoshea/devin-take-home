import type { FlagState } from '@/lib/db/schema';
import { defineMachine, hasPermission, type Machine } from '@/lib/workflow';

/** A flag environment is a two-state machine; `enabled` is where that state is stored. */
export type SwitchState = 'off' | 'on';

export function switchStateOf(state: FlagState): SwitchState {
  return state.enabled ? 'on' : 'off';
}

/**
 * Only the two flips are declared, so a toggle that would change nothing is refused as an
 * undeclared transition rather than written as a no-op audit entry.
 */
export const flagStateMachine: Machine<FlagState, SwitchState> = defineMachine<
  FlagState,
  SwitchState
>({
  entityType: 'flag_state',
  stateOf: switchStateOf,
  transitions: {
    'off->on': [hasPermission('flags.write')],
    'on->off': [hasPermission('flags.write')],
  },
  persist: ({ tx, entity, from, to }) => tx.setFlagEnabled(entity.id, from === 'on', to === 'on'),
});
