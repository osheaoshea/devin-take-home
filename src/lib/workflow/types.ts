import type { Actor } from '@/lib/rbac';

export interface WorkflowEntity {
  id: string;
}

export type GuardResult = true | { ok: false; reason: string };

export interface GuardContext<E> {
  actor: Actor;
  entity: E;
  /** `from->to`, e.g. `escalated->approved`. */
  transition: string;
  context?: unknown;
}

export type Guard<E> = (ctx: GuardContext<E>) => GuardResult;

export type TransitionResult = { ok: true } | { ok: false; reason: string };
