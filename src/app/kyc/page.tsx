import { requireActor } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { PageShell } from '@/lib/ui';

export default async function KycPage() {
  const actor = await requireActor();
  requirePermission(actor, 'kyc.read');

  return (
    <PageShell actor={actor} title="KYC review queue" description="Delivered by spec 01.">
      <div className="rounded border border-line bg-surface p-6 text-sm text-muted">
        This tool is not built yet. The foundation it needs — identity, roles, audit, workflow and
        the shared UI primitives — is in place, and its tables already exist in the schema.
      </div>
    </PageShell>
  );
}
