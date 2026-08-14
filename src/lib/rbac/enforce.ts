import { forbidden } from 'next/navigation';
import { can, hasRole, type Actor } from '@/lib/rbac';
import type { Permission, Role } from '@/lib/rbac/roles';

/**
 * Route-level authorization. Where `requirePermission` throws — the right behaviour for Server
 * Actions and accessors, which have no way to render — these interrupt rendering so Next serves
 * `app/forbidden.tsx` with a real 403 instead of an unhandled server exception.
 */
export function enforcePermission(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) forbidden();
}

export function enforceRole(actor: Actor, ...roles: readonly Role[]): void {
  if (!hasRole(actor, ...roles)) forbidden();
}
