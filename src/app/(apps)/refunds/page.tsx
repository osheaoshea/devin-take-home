import Link from 'next/link';
import { signOutAction } from '@/app/actions';
import { formatMoney, penceFromPounds, REFUND_STATES } from '@/lib/apps/refunds';
import { readAuditLog, type AuditEntry } from '@/lib/audit';
import { requireActor } from '@/lib/auth';
import {
  countRefunds,
  findRefundRowById,
  refundTotals,
  selectRefunds,
  type RefundRow,
} from '@/lib/db/queries';
import { can, type Actor } from '@/lib/rbac';
import { enforcePermission } from '@/lib/rbac/enforce';
import { DataTable, PageShell, StatusBadge } from '@/lib/ui';
import {
  approvedSince,
  PAGE_SIZE,
  refundParamsSchema,
  singleValueParams,
} from './dashboard-params';
import { stateTone } from './presentation';
import { RefundDrawer } from './RefundDrawer';

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  enforcePermission(actor, 'refunds.read');

  const params = refundParamsSchema.parse(singleValueParams(await searchParams));
  const filter = {
    state: params.state,
    minAmountPence: params.minAmount === undefined ? undefined : penceFromPounds(params.minAmount),
    sort: params.sort,
    direction: params.dir,
    limit: PAGE_SIZE,
    offset: (params.page - 1) * PAGE_SIZE,
  };

  const [refunds, total, totals] = await Promise.all([
    selectRefunds(actor, filter),
    countRefunds(actor, filter),
    refundTotals(actor, approvedSince()),
  ]);

  const selected =
    params.refund === undefined ? undefined : await findRefundRowById(actor, params.refund);

  const query = queryOf(params);

  return (
    <PageShell
      actor={actor}
      title="Refunds"
      description="Review the refund requests raised against mock payments and decide each one: approving issues the refund with the payments provider."
      signOutAction={signOutAction}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Tile
          label="Open requests"
          value={String(totals.openCount)}
          hint="Requests still waiting on a decision"
        />
        <Tile
          label="Total exposure"
          value={formatMoney(totals.openExposurePence)}
          hint="Value of everything not yet settled"
        />
        <Tile
          label="Approved this week"
          value={String(totals.approvedSinceCount)}
          hint="Refunds issued to the provider in the last 7 days"
        />
      </div>

      <div className="mb-4">
        <form className="flex flex-wrap items-end gap-3 rounded border border-line bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-muted">
            State
            <select
              name="state"
              defaultValue={params.state ?? ''}
              className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Any state</option>
              {REFUND_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Min amount (£)
            <input
              name="minAmount"
              type="number"
              min={0}
              defaultValue={params.minAmount}
              className="w-28 rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <input type="hidden" name="sort" value={params.sort} />
          <input type="hidden" name="dir" value={params.dir} />
          <button
            type="submit"
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            Filter
          </button>
          <Link href="/refunds" className="text-sm text-muted underline">
            Clear
          </Link>
        </form>
      </div>

      <DataTable<RefundRow>
        basePath="/refunds"
        query={query}
        rows={refunds}
        rowHref={(row) => hrefOf({ ...query, refund: row.id })}
        sort={{ key: params.sort, direction: params.dir }}
        page={{ index: params.page, size: PAGE_SIZE, total }}
        emptyMessage="No refunds match this filter."
        columns={[
          {
            key: 'customer',
            header: 'Customer',
            sortable: true,
            render: (row) => row.customerEmail,
          },
          {
            key: 'amount',
            header: 'Amount',
            sortable: true,
            render: (row) => formatMoney(row.amountPence, row.currency),
          },
          {
            key: 'state',
            header: 'State',
            sortable: true,
            render: (row) => <StatusBadge tone={stateTone(row.state)}>{row.state}</StatusBadge>,
          },
          { key: 'reason', header: 'Reason', render: (row) => row.reasonCode },
          {
            key: 'decidedBy',
            header: 'Decided by',
            render: (row) => row.decidedByEmail ?? '—',
          },
          {
            key: 'created',
            header: 'Raised',
            sortable: true,
            render: (row) => row.createdAt.toISOString().slice(0, 10),
          },
        ]}
      />

      {selected !== undefined ? (
        <RefundDrawer
          actor={actor}
          refund={selected}
          auditEntries={await refundAuditTrail(actor, selected.id)}
          closeHref={hrefOf(query)}
          returnTo={hrefOf(query)}
          error={params.error}
        />
      ) : null}
    </PageShell>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div
      className="rounded border border-line bg-surface p-4"
      data-testid={`tile-${label.toLowerCase().replaceAll(' ', '-')}`}
    >
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-medium">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

function queryOf(params: {
  state?: string;
  minAmount?: number;
  sort: string;
  dir: string;
  page: number;
}): Record<string, string | undefined> {
  return {
    state: params.state,
    minAmount: params.minAmount === undefined ? undefined : String(params.minAmount),
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
  return search === '' ? '/refunds' : `/refunds?${search}`;
}

/** The per-refund trail, for actors allowed to read the log at all. */
async function refundAuditTrail(actor: Actor, refundId: string): Promise<AuditEntry[] | undefined> {
  if (!can(actor, 'audit.read')) return undefined;
  return readAuditLog(actor, { entityType: 'refund', entityId: refundId, limit: 20 });
}
