import { audited, type Tx } from '@/lib/audit';
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
  /** Applies the state change inside the audited transaction. */
  persist: (tx: Tx, entity: E, to: S, context: unknown) => Promise<E>;
  /** Audit action name; defaults to `<entityType>.<to>`. */
  action?: (to: S) => string;
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
      const transition = key(config.stateOf(request.entity), request.to);
      const result = evaluate(request);
      if (!result.ok) throw new TransitionRefusedError(result.reason, transition);
      const action = config.action?.(request.to) ?? `${config.entityType}.${request.to}`;
      return audited(
        {
          actor: request.actor,
          action,
          entityType: config.entityType,
          entityId: request.entity.id,
          before: request.entity,
        },
        (tx) => config.persist(tx, request.entity, request.to, request.context),
      );
    },
  };
}
