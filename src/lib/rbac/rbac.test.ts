import { describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  can,
  DEMO_GROUP_MAP,
  parseGroupRoleMap,
  permissionsFor,
  requirePermission,
  requireRole,
  resolveRoles,
} from '@/lib/rbac';
import type { Actor } from '@/lib/rbac';

const actor = (roles: Actor['roles']): Actor => ({ id: 'u1', email: 'u1@demo.co', roles });

describe('resolveRoles', () => {
  it('maps an IdP group to the roles it grants', () => {
    expect(resolveRoles(['ENTRA-KYC-Analysts'], DEMO_GROUP_MAP)).toEqual(['kyc_analyst']);
  });

  it('maps several groups to the union of their roles', () => {
    expect(resolveRoles(['ENTRA-KYC-Analysts', 'ENTRA-Engineering'], DEMO_GROUP_MAP)).toEqual([
      'kyc_analyst',
      'engineer',
    ]);
  });

  it('ignores groups that are not in the map instead of failing sign-in', () => {
    expect(resolveRoles(['ENTRA-Sales-EMEA', 'ENTRA-Engineering'], DEMO_GROUP_MAP)).toEqual([
      'engineer',
    ]);
  });

  it('deduplicates roles granted by more than one group', () => {
    const map = {
      'group-a': ['kyc_analyst'],
      'group-b': ['kyc_analyst', 'viewer'],
    } as const;
    expect(resolveRoles(['group-a', 'group-b'], map)).toEqual(['kyc_analyst', 'viewer']);
  });

  it('resolves no roles when the user is in no mapped group', () => {
    expect(resolveRoles([], DEMO_GROUP_MAP)).toEqual([]);
  });
});

describe('parseGroupRoleMap', () => {
  it('reads a group map from JSON config', () => {
    expect(parseGroupRoleMap('{"My-Group":["engineer"]}')).toEqual({ 'My-Group': ['engineer'] });
  });

  it('falls back to the demo map when config is absent', () => {
    expect(parseGroupRoleMap(undefined)).toEqual(DEMO_GROUP_MAP);
  });

  it('rejects a map naming a role the platform does not have', () => {
    expect(() => parseGroupRoleMap('{"My-Group":["superuser"]}')).toThrow();
  });
});

describe('permissionsFor', () => {
  it('gives a viewer read access to every app and nothing else', () => {
    const permissions = permissionsFor(['viewer']);
    expect([...permissions].sort()).toEqual(['flags.read', 'kyc.read', 'refunds.read']);
  });

  it('lets a kyc_analyst work the queue but not resolve escalated cases', () => {
    const permissions = permissionsFor(['kyc_analyst']);
    expect(permissions.has('kyc.claim')).toBe(true);
    expect(permissions.has('kyc.resolve_escalated')).toBe(false);
  });

  it('lets a kyc_manager do everything an analyst can, plus resolve escalated cases', () => {
    const manager = permissionsFor(['kyc_manager']);
    for (const permission of permissionsFor(['kyc_analyst'])) {
      expect(manager.has(permission)).toBe(true);
    }
    expect(manager.has('kyc.resolve_escalated')).toBe(true);
  });

  it('unions the permissions of every role the actor holds', () => {
    const permissions = permissionsFor(['support_agent', 'engineer']);
    expect(permissions.has('refunds.create')).toBe(true);
    expect(permissions.has('flags.write')).toBe(true);
  });

  it('gives admin every permission plus the audit reader and demo tools', () => {
    const admin = permissionsFor(['admin']);
    const everyOtherRole = permissionsFor([
      'viewer',
      'kyc_analyst',
      'kyc_manager',
      'support_agent',
      'finance_manager',
      'engineer',
    ]);
    for (const permission of everyOtherRole) {
      expect(admin.has(permission)).toBe(true);
    }
    expect(admin.has('audit.read')).toBe(true);
    expect(admin.has('demo.tools')).toBe(true);
  });

  it('grants nothing to an actor with no roles', () => {
    expect(permissionsFor([]).size).toBe(0);
  });
});

describe('can', () => {
  it('answers true when one of the actor roles grants the permission', () => {
    expect(can(actor(['engineer']), 'flags.write')).toBe(true);
  });

  it('answers false when no role grants the permission', () => {
    expect(can(actor(['viewer']), 'flags.write')).toBe(false);
  });
});

describe('requireRole', () => {
  it('passes when the actor holds one of the accepted roles', () => {
    expect(() => requireRole(actor(['finance_manager']), 'admin', 'finance_manager')).not.toThrow();
  });

  it('throws AuthorizationError naming the missing roles', () => {
    expect(() => requireRole(actor(['viewer']), 'admin')).toThrow(AuthorizationError);
    expect(() => requireRole(actor(['viewer']), 'admin')).toThrow(/admin/);
  });
});

describe('requirePermission', () => {
  it('passes when the actor has the permission', () => {
    expect(() => requirePermission(actor(['admin']), 'audit.read')).not.toThrow();
  });

  it('throws AuthorizationError when the actor lacks the permission', () => {
    expect(() => requirePermission(actor(['kyc_analyst']), 'audit.read')).toThrow(
      AuthorizationError,
    );
  });
});
