import Link from 'next/link';
import { APP_REGISTRY } from '@/lib/apps/registry';
import { DEMO_ACCOUNTS, demoAuthEnabled } from '@/lib/auth/demo-accounts';
import { can, parseGroupRoleMap, resolveRoles, type Actor } from '@/lib/rbac';
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
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <Link href="/" className="text-sm font-semibold">
            Internal Tools
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2 text-sm text-muted">
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
        <div className="border-t border-line px-4 py-4">
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
 * Demo-only account switcher: a plain form, so it works without client JS, posting to the server
 * action that re-runs the real sign-in path for the chosen mock-IdP account.
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
  return (
    <form action={action} className="mt-3 flex flex-col gap-1" data-testid="demo-switcher">
      <label htmlFor="demo-switcher-email" className="text-xs text-muted">
        Demo user
      </label>
      <input type="hidden" name="redirectTo" value={pathname ?? '/'} />
      <div className="flex gap-1">
        <select
          id="demo-switcher-email"
          name="email"
          defaultValue={current}
          className="min-w-0 flex-1 rounded border border-line bg-canvas px-1 py-1 text-xs"
        >
          {DEMO_ACCOUNTS.map((account) => (
            <option key={account.email} value={account.email}>
              {account.email} — {rolesOf(account.groups)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded border border-line px-2 py-1 text-xs hover:text-ink"
        >
          Switch
        </button>
      </div>
    </form>
  );
}

/** Labels each option with the roles its groups map to, so the choice is a role choice. */
function rolesOf(groups: readonly string[]): string {
  return resolveRoles(groups, parseGroupRoleMap(process.env.ENTRA_GROUP_MAP)).join(', ');
}
