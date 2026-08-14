export { ROLES, PERMISSIONS, ROLE_PERMISSIONS, roleSchema } from './roles';
export type { Role, Permission } from './roles';
export { DEMO_GROUP_MAP, parseGroupRoleMap, resolveRoles } from './group-map';
export type { GroupRoleMap } from './group-map';

import { ROLE_PERMISSIONS, type Permission, type Role } from './roles';

export interface Actor {
  id: string;
  email: string;
  /** Snapshot of the roles resolved at sign-in, as persisted on the user row. */
  roles: readonly Role[];
  name?: string | null;
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const permissions = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) permissions.add(permission);
  }
  return permissions;
}

export function can(actor: Actor, permission: Permission): boolean {
  return permissionsFor(actor.roles).has(permission);
}

export function hasRole(actor: Actor, ...roles: readonly Role[]): boolean {
  return roles.some((role) => actor.roles.includes(role));
}

export function requireRole(actor: Actor, ...roles: readonly Role[]): void {
  if (!hasRole(actor, ...roles)) {
    throw new AuthorizationError(
      `requires one of the roles: ${roles.join(', ')} (actor holds: ${actor.roles.join(', ') || 'none'})`,
    );
  }
}

export function requirePermission(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new AuthorizationError(`requires permission: ${permission}`);
  }
}
