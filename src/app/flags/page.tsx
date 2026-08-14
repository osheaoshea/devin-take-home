import { requireActor } from '@/lib/auth';
import { enforcePermission } from '@/lib/rbac/enforce';
import { PageShell } from '@/lib/ui';

export default async function FlagsPage() {
  const actor = await requireActor();
  enforcePermission(actor, 'flags.read');

  return (
    <PageShell actor={actor} title="Feature flags" description="Delivered by spec 03.">
      <div className="rounded border border-line bg-surface p-6 text-sm text-muted">
        This tool is not built yet. The foundation it needs — identity, roles, audit, workflow and
        the shared UI primitives — is in place, and its tables already exist in the schema.
      </div>
    </PageShell>
  );
}
