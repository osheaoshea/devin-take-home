import { signOutAction } from '@/app/actions';
import { ENVIRONMENTS } from '@/lib/apps/flags';
import { readAuditLog, type AuditEntry } from '@/lib/audit';
import { requireActor } from '@/lib/auth';
import { findFlagRowById, selectFlagRows, type FlagRow } from '@/lib/db/queries';
import { can, type Actor } from '@/lib/rbac';
import { enforcePermission } from '@/lib/rbac/enforce';
import { DataTable, PageShell, StatusBadge } from '@/lib/ui';
import { FlagDrawer } from './FlagDrawer';
import { flagsHref, flagsParamsSchema, singleValueParams } from './flags-params';
import { stateLabel, stateTone } from './presentation';

export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  enforcePermission(actor, 'flags.read');

  const params = flagsParamsSchema.parse(singleValueParams(await searchParams));
  const rows = await selectFlagRows(actor);
  const selected =
    params.flag === undefined ? undefined : await findFlagRowById(actor, params.flag);

  return (
    <PageShell
      actor={actor}
      title="Feature flags"
      description="Per-environment flag state, percentage rollout and a one-click kill switch."
      signOutAction={signOutAction}
    >
      <DataTable<FlagRow>
        basePath="/flags"
        rows={rows}
        rowHref={(row) => flagsHref(row.id)}
        emptyMessage="No flags are defined."
        columns={[
          { key: 'key', header: 'Flag', render: (row) => row.key },
          { key: 'description', header: 'Description', render: (row) => row.description },
          ...ENVIRONMENTS.map((environment) => ({
            key: environment,
            header: environment,
            render: (row: FlagRow) => {
              const state = row.states.find((candidate) => candidate.environment === environment);
              if (state === undefined) return '—';
              return <StatusBadge tone={stateTone(state)}>{stateLabel(state)}</StatusBadge>;
            },
          })),
        ]}
      />

      {selected !== undefined ? (
        <FlagDrawer
          actor={actor}
          flag={selected}
          auditEntries={await flagHistory(actor, selected)}
          closeHref="/flags"
          error={params.error}
        />
      ) : null}
    </PageShell>
  );
}

/**
 * The change history is the foundation's audit reader, filtered by entity: the kill switch is
 * logged against the flag and every other change against the environment it touched.
 */
async function flagHistory(actor: Actor, flag: FlagRow): Promise<AuditEntry[] | undefined> {
  if (!can(actor, 'audit.read')) return undefined;
  const pages = await Promise.all([
    readAuditLog(actor, { entityType: 'flag', entityId: flag.id }),
    ...flag.states.map((state) =>
      readAuditLog(actor, { entityType: 'flag_state', entityId: state.id }),
    ),
  ]);
  return pages.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
