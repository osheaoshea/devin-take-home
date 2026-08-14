import Link from 'next/link';
import { APP_REGISTRY } from '@/lib/apps/registry';
import { DEMO_ACCOUNTS, demoAuthEnabled } from '@/lib/auth/demo-accounts';
import { can, type Actor } from '@/lib/rbac';
import { StatusBadge } from './StatusBadge';

/**
 * The frame every page renders inside: a left sidebar carrying the nav the actor's roles allow
 * and their account block, with the page's own content filling the rest of the width.
 */
export function PageShell({
  actor,
  title,
  description,
  pathname,
  signOutAction,
  switchDemoUserAction,
  children,
}: {
  actor: Actor;
  title: string;
  description?: string;
  /** Where the demo switcher returns after switching; falls back to the hub. */
  pathname?: string;
  signOutAction: () => Promise<void>;
  switchDemoUserAction?: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <Link href="/" className="text-sm font-semibold">
            Internal Tools
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 text-sm text-muted">
          {APP_REGISTRY.filter((app) => can(actor, app.permission)).map((app) => (
            <Link key={app.href} href={app.href} className="rounded px-2 py-1 hover:text-ink">
              {app.name}
            </Link>
          ))}
          {can(actor, 'audit.read') ? (
            <Link href="/admin/audit" className="rounded px-2 py-1 hover:text-ink">
              Audit
            </Link>
          ) : null}
        </nav>
        <div className="shrink-0 border-t border-line px-4 py-4">
          <p className="text-sm font-medium">{actor.name ?? actor.email}</p>
          <p className="text-xs text-muted">{actor.email}</p>
          <span className="mt-2 flex flex-wrap gap-1" data-testid="role-indicator">
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
          {switchDemoUserAction !== undefined && demoAuthEnabled() ? (
            <DemoUserSwitcher
              action={switchDemoUserAction}
              current={actor.email}
              pathname={pathname}
            />
          ) : null}
          <form action={signOutAction} className="mt-3">
            <button type="submit" className="text-xs text-muted underline hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-8">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

/**
 * Demo-only account switcher: a `details` disclosure whose entries are submit buttons, so opening
 * the menu and picking an account both work without client JS. Each button posts to the server
 * action that re-runs the real sign-in path for that mock-IdP account.
 */
function DemoUserSwitcher({
  action,
  current,
  pathname,
}: {
  action: (formData: FormData) => Promise<void>;
  current: string;
  pathname?: string;
}) {
  const signedIn = DEMO_ACCOUNTS.find((account) => account.email === current);
  return (
    <details className="relative mt-3" data-testid="demo-switcher">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded border border-line px-2 py-1 text-xs hover:text-ink [&::-webkit-details-marker]:hidden">
        {signedIn?.label ?? current}
        <span aria-hidden="true" className="text-muted">
          ▾
        </span>
      </summary>
      <form
        action={action}
        className="absolute bottom-full left-0 z-10 mb-1 w-full overflow-hidden rounded border border-line bg-surface shadow-lg"
      >
        <input type="hidden" name="redirectTo" value={pathname ?? '/'} />
        {DEMO_ACCOUNTS.filter((account) => account.email !== current).map((account) => (
          <button
            key={account.email}
            type="submit"
            name="email"
            value={account.email}
            className="block w-full px-2 py-1.5 text-left text-xs hover:bg-canvas hover:text-ink"
          >
            {account.label}
          </button>
        ))}
      </form>
    </details>
  );
}
