import { can, hasRole as actorHasRole, type Permission, type Role } from '@/lib/rbac';
import type { Guard } from './types';

/** Actor must hold the permission (never inline role checks — convention 2). */
export function hasPermission<E>(permission: Permission): Guard<E> {
  return ({ actor }) =>
    can(actor, permission) ? true : { ok: false, reason: `missing_permission:${permission}` };
}

/** Actor must hold the role. Prefer `hasPermission` unless the rule is genuinely role-shaped. */
export function hasRole<E>(role: Role): Guard<E> {
  return ({ actor }) =>
    actorHasRole(actor, role) ? true : { ok: false, reason: `missing_role:${role}` };
}

/**
 * Four-eyes: the acting user must differ from the user recorded in `actorOf`
 * (e.g. whoever escalated the case, or gave the first approval).
 */
export function distinctActor<E>(
  actorOf: (entity: E) => string | null | undefined,
  reason: string,
): Guard<E> {
  return ({ actor, entity }) => (actorOf(entity) === actor.id ? { ok: false, reason } : true);
}

/** Threshold routing: the amount must not exceed `max` (inclusive). */
export function amountAtMost<E>(amountOf: (entity: E) => number, max: number): Guard<E> {
  return ({ entity }) =>
    amountOf(entity) <= max ? true : { ok: false, reason: `amount_above_${max}` };
}

export function not<E>(guard: Guard<E>, reason: string): Guard<E> {
  return (ctx) => (guard(ctx) === true ? { ok: false, reason } : true);
}

/** Every guard must pass; reports the first refusal. */
export function all<E>(...guards: readonly Guard<E>[]): Guard<E> {
  return (ctx) => {
    for (const guard of guards) {
      const result = guard(ctx);
      if (result !== true) return result;
    }
    return true;
  };
}

/** At least one guard must pass; reports every refusal when none do. */
export function any<E>(...guards: readonly Guard<E>[]): Guard<E> {
  return (ctx) => {
    const reasons: string[] = [];
    for (const guard of guards) {
      const result = guard(ctx);
      if (result === true) return true;
      reasons.push(result.reason);
    }
    return { ok: false, reason: reasons.join('|') };
  };
}
