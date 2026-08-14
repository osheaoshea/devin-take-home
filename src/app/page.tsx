import Link from 'next/link';
import { signOutAction, switchDemoUserAction } from '@/app/actions';
import { APP_REGISTRY } from '@/lib/apps/registry';
import { requireActor } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { PageShell, StatusBadge } from '@/lib/ui';

export default async function HubPage() {
  const actor = await requireActor();

  const badges = await Promise.all(
    APP_REGISTRY.map((app) =>
      can(actor, app.permission) ? app.countBadge(actor) : Promise.resolve(''),
    ),
  );

  const cards = APP_REGISTRY.map((app, index) => ({
    href: app.href,
    name: app.cardTitle,
    description: app.description,
    permission: app.permission,
    roles: app.rolesLabel,
    badge: badges[index] ?? '',
    available: app.available,
  }));

  return (
    <PageShell
      actor={actor}
      title="Internal tools"
      description="One platform, many tools. Identity, roles, audit and workflow are shared."
      pathname="/"
      signOutAction={signOutAction}
      switchDemoUserAction={switchDemoUserAction}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const permitted = can(actor, card.permission);
          const enterable = permitted && card.available;
          return (
            <article
              key={card.href}
              className="flex flex-col gap-3 rounded border border-line bg-surface p-4"
              data-testid={`card-${card.href}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium">{card.name}</h2>
                <StatusBadge tone={permitted ? 'info' : 'neutral'}>
                  {permitted ? card.badge : 'no access'}
                </StatusBadge>
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
