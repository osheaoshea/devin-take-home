import Link from 'next/link';
import { signOutAction } from '@/app/actions';
import { readAuditLogPage, type AuditEntry } from '@/lib/audit';
import { requireActor } from '@/lib/auth';
import { enforcePermission } from '@/lib/rbac/enforce';
import { DataTable, DetailDrawer, JsonDiff, PageShell, StatusBadge } from '@/lib/ui';
import { auditFilterSchema, PAGE_SIZE } from './filter';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  enforcePermission(actor, 'audit.read');

  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) =>
      value === undefined || value === '' ? [] : [[key, Array.isArray(value) ? value[0] : value]],
    ),
  );
  const filter = auditFilterSchema.parse(params);
  const { entries, total } = await readAuditLogPage(actor, {
    ...filter,
    limit: PAGE_SIZE,
    offset: (filter.page - 1) * PAGE_SIZE,
  });
  const selected = entries.find((entry) => entry.id === filter.entry);

  const query: Record<string, string | undefined> = {
    actorId: filter.actorId,
    entityType: filter.entityType,
    entityId: filter.entityId,
    action: filter.action,
    from: params.from,
    to: params.to,
    // Keeps the position in the log when opening or closing an entry; the pager overrides it.
    page: filter.page > 1 ? String(filter.page) : undefined,
  };

  return (
    <PageShell
      actor={actor}
      title="Audit log"
      description="Append-only record of every mutation, with the roles the actor held at the time."
      signOutAction={signOutAction}
    >
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded border border-line bg-surface p-4">
        <Field name="action" label="Action" defaultValue={filter.action} />
        <Field name="entityType" label="Entity type" defaultValue={filter.entityType} />
        <Field name="entityId" label="Entity id" defaultValue={filter.entityId} />
        <Field name="from" label="From" type="date" defaultValue={params.from} />
        <Field name="to" label="To" type="date" defaultValue={params.to} />
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          Filter
        </button>
        <Link href="/admin/audit" className="text-sm text-muted underline">
          Clear
        </Link>
      </form>

      <DataTable<AuditEntry>
        basePath="/admin/audit"
        query={query}
        rows={entries}
        rowHref={(entry) =>
          `/admin/audit?${new URLSearchParams({ ...cleaned(query), entry: entry.id }).toString()}`
        }
        page={{ index: filter.page, size: PAGE_SIZE, total }}
        emptyMessage="No audit entries match this filter."
        columns={[
          {
            key: 'createdAt',
            header: 'When',
            render: (entry) => entry.createdAt.toISOString().replace('T', ' ').slice(0, 19),
          },
          { key: 'actor', header: 'Actor', render: (entry) => entry.actorEmail },
          {
            key: 'roles',
            header: 'Roles held',
            render: (entry) => (
              <span className="flex flex-wrap gap-1">
                {entry.actorRolesSnapshot.map((role) => (
                  <StatusBadge key={role}>{role}</StatusBadge>
                ))}
              </span>
            ),
          },
          { key: 'action', header: 'Action', render: (entry) => entry.action },
          {
            key: 'entity',
            header: 'Entity',
            render: (entry) => `${entry.entityType} · ${entry.entityId.slice(0, 8)}`,
          },
        ]}
      />

      {selected !== undefined ? (
        <DetailDrawer
          title={selected.action}
          subtitle={`${selected.actorEmail} · ${selected.createdAt.toISOString()}`}
          closeHref={`/admin/audit?${new URLSearchParams(cleaned(query)).toString()}`}
        >
          <div>
            <h3 className="mb-2 font-medium">Changes</h3>
            <JsonDiff before={selected.before} after={selected.after} />
          </div>
          <div>
            <h3 className="mb-2 font-medium">Entity</h3>
            <p className="font-mono text-xs">
              {selected.entityType} / {selected.entityId}
            </p>
          </div>
        </DetailDrawer>
      ) : null}
    </PageShell>
  );
}

function cleaned(query: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
  );
}

function Field({
  name,
  label,
  type = 'text',
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
      />
    </label>
  );
}
