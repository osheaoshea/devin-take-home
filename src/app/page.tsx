import Link from 'next/link';
import { requireActor } from '@/lib/auth';
import { countFlags, countKycCasesByState, countRefundsByState } from '@/lib/db/queries';
import { can, type Permission } from '@/lib/rbac';
import { PageShell, StatusBadge } from '@/lib/ui';

interface AppCard {
  href: string;
  name: string;
  description: string;
  permission: Permission;
  roles: string;
  badge: string;
  available: boolean;
}

export default async function HubPage() {
  const actor = await requireActor();
  const readsKyc = can(actor, 'kyc.read');
  const readsRefunds = can(actor, 'refunds.read');
  const readsFlags = can(actor, 'flags.read');

  const [pendingCases, openRefunds, flagCount] = await Promise.all([
    readsKyc ? countKycCasesByState(actor, 'pending') : Promise.resolve(0),
    readsRefunds ? countRefundsByState(actor, 'requested') : Promise.resolve(0),
    readsFlags ? countFlags(actor) : Promise.resolve(0),
  ]);

  const cards: AppCard[] = [
    {
      href: '/kyc',
      name: 'KYC review queue',
      description: 'Work applicant checks: claim, review, approve, reject or escalate.',
      permission: 'kyc.read',
      roles: 'kyc_analyst, kyc_manager, viewer',
      badge: `${pendingCases} pending`,
      available: false,
    },
    {
      href: '/refunds',
      name: 'Refunds dashboard',
      description: 'Raise and approve refunds with threshold routing and dual approval.',
      permission: 'refunds.read',
      roles: 'support_agent, finance_manager, viewer',
      badge: `${openRefunds} open`,
      available: false,
    },
    {
      href: '/flags',
      name: 'Feature flags',
      description: 'Per-environment flag state, percentage rollout and a kill switch.',
      permission: 'flags.read',
      roles: 'engineer, viewer',
      badge: `${flagCount} flags`,
      available: false,
    },
  ];

  return (
    <PageShell
      actor={actor}
      title="Internal tools"
      description="One platform, many tools. Identity, roles, audit and workflow are shared."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const permitted = can(actor, card.permission);
          const enterable = permitted && card.available;
          return (
            <article
              key={card.href}
              className="flex flex-col gap-3 rounded border border-line bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium">{card.name}</h2>
                <StatusBadge tone={permitted ? 'info' : 'neutral'}>{card.badge}</StatusBadge>
              </div>
              <p className="text-sm text-muted">{card.description}</p>
              <p className="text-xs text-muted">Roles: {card.roles}</p>
              {enterable ? (
                <Link href={card.href} className="text-sm text-accent underline">
                  Open
                </Link>
              ) : (
                <span className="text-xs text-muted">
                  {permitted ? 'Ships with its own spec' : 'You do not have a role for this tool'}
                </span>
              )}
            </article>
          );
        })}
      </div>

      {can(actor, 'audit.read') ? (
        <div className="mt-8 rounded border border-line bg-surface p-4">
          <h2 className="font-medium">Operator</h2>
          <p className="mt-1 text-sm text-muted">
            Every mutation in every tool is recorded with the roles the actor held at the time.
          </p>
          <Link href="/admin/audit" className="mt-2 inline-block text-sm text-accent underline">
            Audit log
          </Link>
        </div>
      ) : null}
    </PageShell>
  );
}
