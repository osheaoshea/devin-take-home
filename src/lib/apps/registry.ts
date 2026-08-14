import { countFlags, countKycCasesByState, countRefundsByState } from '@/lib/db/queries';
import type { Actor, Permission } from '@/lib/rbac';

/**
 * One descriptor per app. The nav links (PageShell) and the hub cards (app/page.tsx) both
 * render from this registry, so adding an app is one entry here plus its own slice files.
 */
export interface AppDescriptor {
  /** Stable identifier, e.g. `kyc`. */
  key: string;
  /** Short label used in the header nav. */
  name: string;
  /** Hub card title. */
  cardTitle: string;
  description: string;
  href: string;
  permission: Permission;
  /** Hub card badge, e.g. `12 pending`; wraps the app's count query. */
  countBadge: (actor: Actor) => Promise<string>;
  /** False until the app's spec ships; the hub card offers no entry link. */
  available: boolean;
}

export const APP_REGISTRY: readonly AppDescriptor[] = [
  {
    key: 'kyc',
    name: 'KYC',
    cardTitle: 'KYC review queue',
    description: 'Work applicant checks: claim, review, approve, reject or escalate.',
    href: '/kyc',
    permission: 'kyc.read',
    countBadge: async (actor) => `${await countKycCasesByState(actor, 'pending')} pending`,
    available: true,
  },
  {
    key: 'refunds',
    name: 'Refunds',
    cardTitle: 'Refunds dashboard',
    description: 'Review seeded refund requests and decide each one: approve or reject.',
    href: '/refunds',
    permission: 'refunds.read',
    countBadge: async (actor) => `${await countRefundsByState(actor, 'requested')} open`,
    available: true,
  },
  {
    key: 'flags',
    name: 'Flags',
    cardTitle: 'Feature flags',
    description: 'Per-environment flag state, percentage rollout and a kill switch.',
    href: '/flags',
    permission: 'flags.read',
    countBadge: async (actor) => `${await countFlags(actor)} flags`,
    available: true,
  },
];

/** Permission-gated routes the foundation owns rather than an app: the audit reader. */
const FOUNDATION_ROUTES: readonly { href: string; permission: Permission }[] = [
  { href: '/admin/audit', permission: 'audit.read' },
];

const GATED_ROUTES: readonly { href: string; permission: Permission }[] = [
  ...APP_REGISTRY.map(({ href, permission }) => ({ href, permission })),
  ...FOUNDATION_ROUTES,
];

/**
 * The permission a path requires, or undefined when every signed-in actor may see it (the hub).
 * Lets a caller that is about to send an actor somewhere — the demo switcher — check the
 * destination against the roles the actor will hold, instead of landing them on a 403.
 */
export function permissionForPath(path: string): Permission | undefined {
  const pathname = path.split(/[?#]/)[0] ?? '';
  return GATED_ROUTES.find(
    (route) => pathname === route.href || pathname.startsWith(`${route.href}/`),
  )?.permission;
}
