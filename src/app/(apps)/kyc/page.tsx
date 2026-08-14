import Link from 'next/link';
import { signOutAction } from '@/app/actions';
import { documentUrlsOf, KYC_STATES } from '@/lib/apps/kyc';
import { readAuditLog, type AuditEntry } from '@/lib/audit';
import { requireActor } from '@/lib/auth';
import {
  countKycCases,
  findKycCaseRowById,
  selectKycCases,
  type KycCaseRow,
} from '@/lib/db/queries';
import { kycProvider } from '@/lib/providers';
import { can, type Actor } from '@/lib/rbac';
import { enforcePermission } from '@/lib/rbac/enforce';
import { DataTable, PageShell, StatusBadge } from '@/lib/ui';
import { simulateApplicantAction } from './actions';
import { CaseDrawer } from './CaseDrawer';
import { slaBadge, stateTone } from './presentation';
import { dueBeforeFor, kycQueueParamsSchema, PAGE_SIZE, singleValueParams } from './queue-params';

export default async function KycPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  enforcePermission(actor, 'kyc.read');

  const params = kycQueueParamsSchema.parse(singleValueParams(await searchParams));
  const filter = {
    state: params.state,
    minRisk: params.minRisk,
    dueBefore: dueBeforeFor(params.sla),
    assignedToId: params.mine === '1' ? actor.id : undefined,
    sort: params.sort,
    direction: params.dir,
    limit: PAGE_SIZE,
    offset: (params.page - 1) * PAGE_SIZE,
  };

  const [cases, total] = await Promise.all([
    selectKycCases(actor, filter),
    countKycCases(actor, filter),
  ]);

  const selected =
    params.case === undefined ? undefined : await findKycCaseRowById(actor, params.case);

  const query = queryOf(params);

  return (
    <PageShell
      actor={actor}
      title="KYC review queue"
      description="Claim applicant checks, work them against the SLA, and approve, reject or escalate."
      signOutAction={signOutAction}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-3 rounded border border-line bg-surface p-4">
          <Select name="state" label="State" value={params.state} options={[...KYC_STATES]} />
          <Select
            name="sla"
            label="SLA"
            value={params.sla}
            options={['overdue', 'due_soon']}
            anyLabel="Any deadline"
          />
          <label className="flex flex-col gap-1 text-xs text-muted">
            Min risk
            <input
              name="minRisk"
              type="number"
              min={0}
              max={100}
              defaultValue={params.minRisk}
              className="w-24 rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex items-center gap-2 py-2 text-xs text-muted">
            <input
              name="mine"
              type="checkbox"
              value="1"
              defaultChecked={params.mine === '1'}
              className="size-4"
            />
            My cases
          </label>
          <input type="hidden" name="sort" value={params.sort} />
          <input type="hidden" name="dir" value={params.dir} />
          <button
            type="submit"
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            Filter
          </button>
          <Link href="/kyc" className="text-sm text-muted underline">
            Clear
          </Link>
        </form>

        {can(actor, 'demo.tools') ? (
          <form action={simulateApplicantAction.bind(null, hrefOf(query))}>
            <button
              type="submit"
              className="rounded border border-line bg-surface px-3 py-1.5 text-sm font-medium"
            >
              Simulate new applicant
            </button>
          </form>
        ) : null}
      </div>

      <DataTable<KycCaseRow>
        basePath="/kyc"
        query={query}
        rows={cases}
        rowHref={(row) => hrefOf({ ...query, case: row.id })}
        sort={{ key: params.sort, direction: params.dir }}
        page={{ index: params.page, size: PAGE_SIZE, total }}
        emptyMessage="No cases match this filter."
        columns={[
          {
            key: 'applicant',
            header: 'Applicant',
            sortable: true,
            render: (row) => row.applicantName,
          },
          { key: 'country', header: 'Country', render: (row) => row.country },
          {
            key: 'state',
            header: 'State',
            sortable: true,
            render: (row) => <StatusBadge tone={stateTone(row.state)}>{row.state}</StatusBadge>,
          },
          {
            key: 'risk',
            header: 'Risk',
            sortable: true,
            render: (row) => row.providerRiskScore,
          },
          {
            key: 'sla',
            header: 'SLA',
            sortable: true,
            render: (row) => {
              const sla = slaBadge(row.slaDueAt);
              return <StatusBadge tone={sla.tone}>{sla.label}</StatusBadge>;
            },
          },
          {
            key: 'assignee',
            header: 'Assignee',
            render: (row) => row.assignedToEmail ?? '—',
          },
        ]}
      />

      {selected !== undefined ? (
        <CaseDrawer
          actor={actor}
          kycCase={selected}
          documents={await resolveDocuments(selected)}
          auditEntries={await caseAuditTrail(actor, selected.id)}
          closeHref={hrefOf(query)}
          returnTo={hrefOf(query)}
          error={params.error}
        />
      ) : null}
    </PageShell>
  );
}

function queryOf(params: {
  state?: string;
  sla?: string;
  minRisk?: number;
  mine?: string;
  sort: string;
  dir: string;
  page: number;
}): Record<string, string | undefined> {
  return {
    state: params.state,
    sla: params.sla,
    minRisk: params.minRisk === undefined ? undefined : String(params.minRisk),
    mine: params.mine,
    sort: params.sort,
    dir: params.dir,
    page: params.page > 1 ? String(params.page) : undefined,
  };
}

function hrefOf(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  const search = params.toString();
  return search === '' ? '/kyc' : `/kyc?${search}`;
}

/** The mock provider resolves document URLs; production would fetch the bytes here. */
function resolveDocuments(kycCase: KycCaseRow): Promise<{ url: string; contentType: string }[]> {
  const provider = kycProvider();
  return Promise.all(documentUrlsOf(kycCase).map((url) => provider.fetchDocument(url)));
}

/** The per-case trail, for actors allowed to read the log at all. */
async function caseAuditTrail(actor: Actor, caseId: string): Promise<AuditEntry[] | undefined> {
  if (!can(actor, 'audit.read')) return undefined;
  return readAuditLog(actor, { entityType: 'kyc_case', entityId: caseId, limit: 20 });
}

function Select({
  name,
  label,
  value,
  options,
  anyLabel = 'Any',
}: {
  name: string;
  label: string;
  value?: string;
  options: string[];
  anyLabel?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select
        name={name}
        defaultValue={value ?? ''}
        className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
