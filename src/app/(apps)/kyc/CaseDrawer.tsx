import clsx from 'clsx';
import {
  declaredTargets,
  kycMachine,
  parseActionError,
  reasonCodesFor,
  refusalCopy,
  watchlistHitsOf,
  type KycState,
} from '@/lib/apps/kyc';
import type { AuditEntry } from '@/lib/audit';
import type { KycCaseRow } from '@/lib/db/queries';
import type { Actor } from '@/lib/rbac';
import { DetailDrawer, JsonDiff, StatusBadge } from '@/lib/ui';
import { transitionKycCaseAction } from './actions';
import { CaseActionForm } from './CaseActionForm';
import { actionTone, slaBadge, stateTone } from './presentation';

const ACTION_LABELS: Partial<Record<KycState, string>> = {
  in_review: 'Claim case',
  approved: 'Approve',
  rejected: 'Reject',
  escalated: 'Escalate',
};

export function CaseDrawer({
  actor,
  kycCase,
  documents,
  auditEntries,
  closeHref,
  returnTo,
  error,
}: {
  actor: Actor;
  kycCase: KycCaseRow;
  documents: { url: string; contentType: string }[];
  auditEntries: AuditEntry[] | undefined;
  closeHref: string;
  returnTo: string;
  error?: string;
}) {
  const sla = slaBadge(kycCase.slaDueAt);
  const hits = watchlistHitsOf(kycCase);
  const serverRefusal = parseActionError(error);

  return (
    <DetailDrawer
      title={kycCase.applicantName}
      subtitle={`${kycCase.country} · ${kycCase.documentType} · case ${kycCase.id.slice(0, 8)}`}
      closeHref={closeHref}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={stateTone(kycCase.state)}>{kycCase.state}</StatusBadge>
        <StatusBadge tone={sla.tone}>{sla.label}</StatusBadge>
        {kycCase.assignedToEmail !== null ? (
          <StatusBadge>assigned to {kycCase.assignedToEmail}</StatusBadge>
        ) : null}
      </div>

      <Section title="Applicant">
        <Facts
          rows={[
            ['Name', kycCase.applicantName],
            ['Date of birth', kycCase.applicantDob],
            ['Country', kycCase.country],
            ['Document', kycCase.documentType],
          ]}
        />
      </Section>

      <Section title="Risk">
        <Facts
          rows={[
            ['Provider risk score', `${kycCase.providerRiskScore} / 100`],
            ['Watchlist hits', hits.length === 0 ? 'None' : `${hits.length}`],
            ['SLA due', kycCase.slaDueAt.toISOString()],
            ['Reason code', kycCase.resolutionReasonCode ?? '—'],
            ['Escalated by', kycCase.escalatedByEmail ?? '—'],
          ]}
        />
        {hits.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {hits.map((hit) => (
              <li key={`${hit.list}:${hit.match}`}>
                <StatusBadge tone="danger">{hit.list}</StatusBadge>{' '}
                <span className="text-muted">{hit.match}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Documents">
        {documents.length === 0 ? (
          <p className="text-muted">No documents supplied with this check.</p>
        ) : (
          <ul className="space-y-2">
            {documents.map((document) => (
              <li
                key={document.url}
                className="flex items-center justify-between gap-3 rounded border border-dashed border-line p-3"
              >
                <span className="truncate font-mono text-xs" title={document.url}>
                  {document.url}
                </span>
                <StatusBadge>{document.contentType}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          Placeholders: the mock provider resolves URLs without fetching image bytes.
        </p>
      </Section>

      <Section title="Actions">
        {declaredTargets(kycCase.state).length === 0 ? (
          <p className="text-muted">
            {kycCase.state} is terminal — this case can no longer be acted on.
          </p>
        ) : (
          <div className="space-y-4">
            {declaredTargets(kycCase.state).map((to) => {
              const label = ACTION_LABELS[to] ?? to;
              const decision = kycMachine.can({ actor, entity: kycCase, to });
              const refusal = decision.ok
                ? serverRefusal?.to === to
                  ? serverRefusal.reason
                  : undefined
                : decision.reason;
              return (
                <div
                  key={to}
                  data-testid={`kyc-action-${to}`}
                  className={clsx('rounded border border-line p-3', !decision.ok && 'bg-canvas')}
                >
                  {decision.ok ? (
                    <CaseActionForm
                      label={label}
                      target={to}
                      reasonCodes={reasonCodesFor(to)}
                      tone={actionTone(to)}
                      idPrefix={`kyc-${to}`}
                      action={transitionKycCaseAction.bind(null, {
                        caseId: kycCase.id,
                        to,
                        returnTo,
                      })}
                      error={refusal === undefined ? undefined : refusalCopy(refusal)}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="rounded bg-line px-3 py-1.5 text-sm font-medium text-muted disabled:cursor-not-allowed"
                    >
                      {label}
                    </button>
                  )}
                  {!decision.ok && refusal !== undefined ? (
                    <p className="mt-2 text-sm text-red-700" role="alert">
                      {refusalCopy(refusal)}
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
            Viewing this case&apos;s trail needs the audit.read permission.
          </p>
        ) : auditEntries.length === 0 ? (
          <p className="text-muted">Nothing has happened to this case yet.</p>
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
