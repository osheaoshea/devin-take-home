import { z } from 'zod';
import { roleSchema, type Role } from './roles';

export type GroupRoleMap = Readonly<Record<string, readonly Role[]>>;

/**
 * Group names mirror the shape of the client's Entra groups. The demo IdP issues these
 * same names as claims so the real mapping path runs in dev/demo.
 */
export const DEMO_GROUP_MAP: GroupRoleMap = {
  'ENTRA-Internal-Tools-Viewers': ['viewer'],
  'ENTRA-KYC-Analysts': ['kyc_analyst'],
  'ENTRA-KYC-Managers': ['kyc_manager'],
  'ENTRA-Support-Agents': ['support_agent'],
  'ENTRA-Finance-Managers': ['finance_manager'],
  'ENTRA-Engineering': ['engineer'],
  'ENTRA-Platform-Admins': ['admin'],
};

const groupRoleMapSchema = z.record(z.string().min(1), z.array(roleSchema).min(1));

/** Parses `ENTRA_GROUP_MAP`; falls back to the documented demo map when unset. */
export function parseGroupRoleMap(raw: string | undefined): GroupRoleMap {
  if (raw === undefined || raw.trim() === '') return DEMO_GROUP_MAP;
  return groupRoleMapSchema.parse(JSON.parse(raw));
}

/** Resolves IdP groups to platform roles. Unknown groups are ignored, never fatal. */
export function resolveRoles(groups: readonly string[], map: GroupRoleMap): Role[] {
  const resolved = new Set<Role>();
  for (const group of groups) {
    for (const role of map[group] ?? []) resolved.add(role);
  }
  return [...resolved];
}
