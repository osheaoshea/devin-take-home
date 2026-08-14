import Link from 'next/link';
import { signOutAction, switchDemoUserAction } from '@/app/actions';
import { getActor } from '@/lib/auth';
import { PageShell } from '@/lib/ui';

/**
 * Rendered whenever route-level authorization interrupts with forbidden(). The actor is signed in
 * and stays signed in — this is a permissions answer, not an identity one.
 */
export default async function Forbidden() {
  const actor = await getActor();

  const body = (
    <div className="rounded border border-line bg-surface p-6" data-testid="forbidden">
      <p className="text-sm font-medium">403 — your roles do not grant access to this tool.</p>
      <p className="mt-2 text-sm text-muted">
        Access comes from your identity provider groups. Ask an administrator to add you to the
        group for this tool, then sign in again to pick up the new roles.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        Back to internal tools
      </Link>
    </div>
  );

  if (!actor) {
    return (
      <div className="min-h-screen bg-canvas p-6 text-ink">
        <div className="mx-auto max-w-2xl">{body}</div>
      </div>
    );
  }

  return (
    <PageShell
      actor={actor}
      title="Not permitted"
      description="403 — insufficient permissions."
      signOutAction={signOutAction}
      switchDemoUserAction={switchDemoUserAction}
    >
      {body}
    </PageShell>
  );
}
