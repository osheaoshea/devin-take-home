import clsx from 'clsx';
import {
  approvalStepsFor,
  declaredTargets,
  formatMoney,
  parseActionError,
  refundMachine,
  refusalCopy,
} from '@/lib/apps/refunds';
import type { AuditEntry } from '@/lib/audit';
import type { RefundRow } from '@/lib/db/queries';
import type { Actor } from '@/lib/rbac';
import { ApprovalFlow, DetailDrawer, JsonDiff, StatusBadge } from '@/lib/ui';
import { transitionRefundAction } from './actions';
import { actionLabel, stateTone } from './presentation';

export function RefundDrawer({
  actor,
  refund,
  auditEntries,
  closeHref,
  returnTo,
  error,
}: {
  actor: Actor;
  refund: RefundRow;
  auditEntries: AuditEntry[] | undefined;
  closeHref: string;
  returnTo: string;
  error?: string;
}) {
  const serverRefusal = parseActionError(error);
  const targets = declaredTargets(refund.state);

  return (
    <DetailDrawer
      title={`${formatMoney(refund.amountPence, refund.currency)} · ${refund.customerEmail}`}
      subtitle={`${refund.reasonCode} · payment ${refund.paymentId} · refund ${refund.id.slice(0, 8)}`}
      closeHref={closeHref}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={stateTone(refund.state)}>{refund.state}</StatusBadge>
        <StatusBadge>raised by {refund.requestedByEmail}</StatusBadge>
        {refund.providerRefundId !== null ? (
          <StatusBadge tone="info">provider {refund.providerRefundId}</StatusBadge>
        ) : null}
      </div>

      <Section title="Request">
        <Facts
          rows={[
            ['Amount', formatMoney(refund.amountPence, refund.currency)],
            ['Customer', refund.customerEmail],
            ['Payment', refund.paymentId],
            ['Reason', refund.reasonCode],
            ['Raised', refund.createdAt.toISOString().replace('T', ' ').slice(0, 19)],
            ['Provider refund', refund.providerRefundId ?? '—'],
          ]}
        />
      </Section>

      <Section title="Approvals">
        <ApprovalFlow steps={approvalStepsFor(refund)} actions={[]} />
      </Section>

      <Section title="Actions">
        {targets.length === 0 ? (
          <p className="text-muted">
            {refund.state} is terminal — this refund can no longer be acted on.
          </p>
        ) : (
          <div className="space-y-4">
            {targets.map((to) => {
              const decision = refundMachine.can({ actor, entity: refund, to });
              const refusal = decision.ok
                ? serverRefusal?.to === to
                  ? serverRefusal.reason
                  : undefined
                : decision.reason;
              const copy = refusal === undefined ? undefined : refusalCopy(refusal);
              return (
                <div
                  key={to}
                  data-testid={`refund-action-${to}`}
                  className={clsx('rounded border border-line p-3', !decision.ok && 'bg-canvas')}
                >
                  {/* One ApprovalFlow per action, so a refusal explains the action it blocked. */}
                  <ApprovalFlow
                    steps={[]}
                    actions={[
                      {
                        label: actionLabel(to),
                        formAction: transitionRefundAction.bind(null, {
                          refundId: refund.id,
                          to,
                          returnTo,
                        }),
                        ...(decision.ok ? {} : { refusedReason: copy }),
                      },
                    ]}
                  />
                  {copy !== undefined ? (
                    <p className="mt-2 text-sm text-red-700" role="alert">
                      {copy}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Audit trail">
        {auditEntries === undefined ? (
          <p className="text-muted">
            Viewing this refund&apos;s trail needs the audit.read permission.
          </p>
        ) : auditEntries.length === 0 ? (
          <p className="text-muted">Nothing has happened to this refund yet.</p>
        ) : (
          <ol className="space-y-3">
            {auditEntries.map((entry) => (
              <li key={entry.id} className="rounded border border-line p-3">
                <p className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="info">{entry.action}</StatusBadge>
                  <span className="text-muted">
                    {entry.actorEmail} ·{' '}
                    {entry.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
                  </span>
                </p>
                <div className="mt-2">
                  <JsonDiff before={entry.before} after={entry.after} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </DetailDrawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
