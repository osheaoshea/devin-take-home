import { audited, type Tx } from '@/lib/audit';
import { StaleStateError } from '@/lib/db/mutations';
import type { Actor } from '@/lib/rbac';
import type { Guard, TransitionResult, WorkflowEntity } from './types';

export class TransitionRefusedError extends Error {
  constructor(
    readonly reason: string,
    readonly transition: string,
  ) {
    super(`transition refused (${transition}): ${reason}`);
    this.name = 'TransitionRefusedError';
  }
}

interface MachineConfig<E extends WorkflowEntity, S extends string> {
  /** Audit entity type, e.g. `kyc_case`. */
  entityType: string;
  stateOf: (entity: E) => S;
  /** Declared transitions keyed `from->to`. Undeclared pairs are refused. */
  transitions: Partial<Record<string, readonly Guard<E>[]>>;
  /**
   * Applies the state change inside the audited transaction. `from` is the state the guards
   * were evaluated against; pass it to the mutation so the write is a compare-and-swap.
   */
  persist: (args: PersistArgs<E, S>) => Promise<E>;
  /** Audit action name; defaults to `<entityType>.<to>`. */
  action?: (to: S) => string;
}

export interface PersistArgs<E, S> {
  tx: Tx;
  entity: E;
  from: S;
  to: S;
  context: unknown;
}

export interface TransitionRequest<E, S> {
  actor: Actor;
  entity: E;
  to: S;
  context?: unknown;
}

export interface Machine<E extends WorkflowEntity, S extends string> {
  can(request: TransitionRequest<E, S>): TransitionResult;
  availableTransitions(request: { actor: Actor; entity: E; context?: unknown }): S[];
  /** Executes the transition through `audited()`, so no state change escapes the log. */
  transition(request: TransitionRequest<E, S>): Promise<E>;
}

export function defineMachine<E extends WorkflowEntity, S extends string>(
  config: MachineConfig<E, S>,
): Machine<E, S> {
  const key = (from: S, to: S) => `${from}->${to}`;

  const evaluate = (request: TransitionRequest<E, S>): TransitionResult => {
    const transition = key(config.stateOf(request.entity), request.to);
    const guards = config.transitions[transition];
    if (guards === undefined) {
      return { ok: false, reason: `transition_not_allowed:${transition}` };
    }
    for (const guard of guards) {
      const result = guard({
        actor: request.actor,
        entity: request.entity,
        transition,
        context: request.context,
      });
      if (result !== true) return result;
    }
    return { ok: true };
  };

  return {
    can: evaluate,
    availableTransitions({ actor, entity, context }) {
      const from = config.stateOf(entity);
      const prefix = `${from}->`;
      return Object.keys(config.transitions)
        .filter((transition) => transition.startsWith(prefix))
        .map((transition) => transition.slice(prefix.length) as S)
        .filter((to) => evaluate({ actor, entity, to, context }).ok);
    },
    async transition(request) {
      const from = config.stateOf(request.entity);
      const transition = key(from, request.to);
      const result = evaluate(request);
      if (!result.ok) throw new TransitionRefusedError(result.reason, transition);
      const action = config.action?.(request.to) ?? `${config.entityType}.${request.to}`;
      try {
        return await audited(
          {
            actor: request.actor,
            action,
            entityType: config.entityType,
            entityId: request.entity.id,
            before: request.entity,
          },
          (tx) =>
            config.persist({
              tx,
              entity: request.entity,
              from,
              to: request.to,
              context: request.context,
            }),
        );
      } catch (error) {
        // The guards ran against an entity read outside the transaction; another writer moved
        // it first, so the transaction rolled back and no audit entry was written.
        if (error instanceof StaleStateError)
          throw new TransitionRefusedError('stale_state', transition);
        throw error;
      }
    },
  };
}
