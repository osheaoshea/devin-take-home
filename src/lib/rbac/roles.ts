import { z } from 'zod';

export const ROLES = [
  'viewer',
  'kyc_analyst',
  'kyc_manager',
  'support_agent',
  'finance_manager',
  'engineer',
  'admin',
] as const;

export type Role = (typeof ROLES)[number];

export const roleSchema = z.enum(ROLES);

/**
 * Permissions are flat strings namespaced by app. Apps add permissions here rather than
 * writing inline role checks (convention 2).
 */
export const PERMISSIONS = [
  'kyc.read',
  'kyc.claim',
  'kyc.review',
  'kyc.approve',
  'kyc.reject',
  'kyc.escalate',
  'kyc.resolve_escalated',
  'refunds.read',
  'refunds.create',
  'refunds.approve_small',
  'refunds.approve',
  'refunds.co_approve',
  'refunds.reject',
  'flags.read',
  'flags.write',
  'flags.kill_switch',
  'audit.read',
  'demo.tools',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * `viewer` is the read-only-across-the-platform role. Every other non-admin role reads only
 * the app it works in, so the hub and nav genuinely differ by role.
 */
const READ_EVERYWHERE: Permission[] = ['kyc.read', 'refunds.read', 'flags.read'];

const KYC_ANALYST: Permission[] = [
  'kyc.read',
  'kyc.claim',
  'kyc.review',
  'kyc.approve',
  'kyc.reject',
  'kyc.escalate',
];

const FINANCE_MANAGER: Permission[] = [
  'refunds.read',
  'refunds.create',
  'refunds.approve_small',
  'refunds.approve',
  'refunds.co_approve',
  'refunds.reject',
];

const NON_ADMIN_ROLE_PERMISSIONS: Record<Exclude<Role, 'admin'>, Permission[]> = {
  viewer: READ_EVERYWHERE,
  kyc_analyst: KYC_ANALYST,
  kyc_manager: [...KYC_ANALYST, 'kyc.resolve_escalated'],
  support_agent: ['refunds.read', 'refunds.create', 'refunds.approve_small'],
  finance_manager: FINANCE_MANAGER,
  engineer: ['flags.read', 'flags.write', 'flags.kill_switch'],
};

/**
 * `admin` is the union of every other role plus the operator-only permissions, computed
 * here so that no call site has to special-case it.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ...NON_ADMIN_ROLE_PERMISSIONS,
  admin: [
    ...new Set<Permission>([
      ...Object.values(NON_ADMIN_ROLE_PERMISSIONS).flat(),
      'audit.read',
      'demo.tools',
    ]),
  ],
};
