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
  /** Human-readable list of the roles that work in this tool, shown on the hub card. */
  rolesLabel: string;
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
    rolesLabel: 'kyc_analyst, kyc_manager, viewer',
    countBadge: async (actor) => `${await countKycCasesByState(actor, 'pending')} pending`,
    available: true,
  },
  {
    key: 'refunds',
    name: 'Refunds',
    cardTitle: 'Refunds dashboard',
    description: 'Raise and approve refunds with threshold routing and dual approval.',
    href: '/refunds',
    permission: 'refunds.read',
    rolesLabel: 'support_agent, finance_manager, viewer',
    countBadge: async (actor) => `${await countRefundsByState(actor, 'requested')} open`,
    available: false,
  },
  {
    key: 'flags',
    name: 'Flags',
    cardTitle: 'Feature flags',
    description: 'Per-environment flag state, percentage rollout and a kill switch.',
    href: '/flags',
    permission: 'flags.read',
    rolesLabel: 'engineer, viewer',
    countBadge: async (actor) => `${await countFlags(actor)} flags`,
    available: true,
  },
];
