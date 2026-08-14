import Link from 'next/link';
import { APP_REGISTRY } from '@/lib/apps/registry';
import { can, type Actor } from '@/lib/rbac';
import { StatusBadge } from './StatusBadge';

export function PageShell({
  actor,
  title,
  description,
  signOutAction,
  children,
}: {
  actor: Actor;
  title: string;
  description?: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="text-sm font-semibold">
            Internal Tools
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted">
            {APP_REGISTRY.filter((app) => can(actor, app.permission)).map((app) => (
              <Link key={app.href} href={app.href} className="hover:text-ink">
                {app.name}
              </Link>
            ))}
            {can(actor, 'audit.read') ? (
              <Link href="/admin/audit" className="hover:text-ink">
                Audit
              </Link>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted">{actor.email}</span>
            <span className="flex gap-1" data-testid="role-indicator">
              {actor.roles.length > 0 ? (
                actor.roles.map((role) => (
                  <StatusBadge key={role} tone="info">
                    {role}
                  </StatusBadge>
                ))
              ) : (
                <StatusBadge tone="warning">no roles</StatusBadge>
              )}
            </span>
            <form action={signOutAction}>
              <button type="submit" className="text-muted underline hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
