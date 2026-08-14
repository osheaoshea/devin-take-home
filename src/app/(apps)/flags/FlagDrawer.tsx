import clsx from 'clsx';
import { flagStateMachine, parseActionError, refusalCopy, switchStateOf } from '@/lib/apps/flags';
import type { AuditEntry } from '@/lib/audit';
import type { FlagRow } from '@/lib/db/queries';
import type { FlagState } from '@/lib/db/schema';
import { can, type Actor } from '@/lib/rbac';
import { DetailDrawer, JsonDiff, StatusBadge } from '@/lib/ui';
import { killFlagAction, setFlagRolloutAction, toggleFlagEnvironmentAction } from './actions';
import { ConfirmSubmit } from './ConfirmSubmit';
import { stateLabel, stateTone } from './presentation';

export function FlagDrawer({
  actor,
  flag,
  auditEntries,
  closeHref,
  error,
}: {
  actor: Actor;
  flag: FlagRow;
  /** Undefined when the actor may not read the log; the history section says so. */
  auditEntries: AuditEntry[] | undefined;
  closeHref: string;
  error?: string;
}) {
  const refusal = parseActionError(error);
  const refusalFor = (control: string): string | undefined =>
    refusal?.control === control ? refusalCopy(refusal.reason) : undefined;

  return (
    <DetailDrawer title={flag.key} subtitle={flag.description} closeHref={closeHref}>
      <Section title="Environments">
        <div className="space-y-4">
          {flag.states.map((state) => (
            <div
              key={state.id}
              data-testid={`flag-env-${state.environment}`}
              className="space-y-3 rounded border border-line p-3"
            >
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{state.environment}</span>
                <StatusBadge tone={stateTone(state)}>{stateLabel(state)}</StatusBadge>
                <StatusBadge tone="info">{state.kind}</StatusBadge>
              </p>
              <ToggleControl
                actor={actor}
                flagId={flag.id}
                state={state}
                error={refusalFor(`toggle-${state.environment}`)}
              />
              <RolloutControl
                actor={actor}
                flagId={flag.id}
                state={state}
                error={refusalFor(`rollout-${state.environment}`)}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Kill switch">
        <div data-testid="flag-kill" className="rounded border border-line p-3">
          <p className="mb-3 text-muted">
            Turns this flag off in every environment, in one change.
          </p>
          {can(actor, 'flags.kill_switch') ? (
            <form action={killFlagAction.bind(null, { flagId: flag.id })}>
              <ConfirmSubmit
                label="Kill everywhere"
                tone="danger"
                title={`Kill ${flag.key} everywhere?`}
                message="Every environment, production included, goes off immediately."
              />
            </form>
          ) : (
            <DisabledButton label="Kill everywhere" />
          )}
          <Refusal
            message={
              can(actor, 'flags.kill_switch')
                ? refusalFor('kill')
                : refusalCopy('missing_permission:flags.kill_switch')
            }
          />
        </div>
      </Section>

      <Section title="Change history">
        {auditEntries === undefined ? (
          <p className="text-muted">
            Reading this flag&apos;s history needs the audit.read permission.
          </p>
        ) : auditEntries.length === 0 ? (
          <p className="text-muted">Nothing has changed on this flag yet.</p>
        ) : (
          <ol data-testid="flag-history" className="space-y-3">
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

/** The on/off flip, which is the machine's transition and so is offered only when it is allowed. */
function ToggleControl({
  actor,
  flagId,
  state,
  error,
}: {
  actor: Actor;
  flagId: string;
  state: FlagState;
  error?: string;
}) {
  const to = switchStateOf(state) === 'on' ? 'off' : 'on';
  const label = to === 'on' ? 'Turn on' : 'Turn off';
  const decision = flagStateMachine.can({ actor, entity: state, to });
  const target = { flagId, stateId: state.id, environment: state.environment };

  return (
    <div data-testid={`flag-toggle-${state.environment}`}>
      {decision.ok ? (
        <form action={toggleFlagEnvironmentAction.bind(null, target)}>
          <input type="hidden" name="to" value={to} />
          {state.environment === 'prod' ? (
            <ConfirmSubmit
              label={label}
              title={`${label} in production?`}
              message="This changes behaviour for live traffic as soon as you confirm."
            />
          ) : (
            <SubmitButton label={label} />
          )}
        </form>
      ) : (
        <DisabledButton label={label} />
      )}
      <Refusal message={decision.ok ? error : refusalCopy(decision.reason)} />
    </div>
  );
}

/** A percentage edit moves no state, so it is its own form behind the same write permission. */
function RolloutControl({
  actor,
  flagId,
  state,
  error,
}: {
  actor: Actor;
  flagId: string;
  state: FlagState;
  error?: string;
}) {
  if (state.kind !== 'percentage') {
    return <p className="text-xs text-muted">An on/off switch, so it has no rollout percentage.</p>;
  }

  const allowed = can(actor, 'flags.write');
  const fieldId = `flag-rollout-${state.environment}-percentage`;

  return (
    <div data-testid={`flag-rollout-${state.environment}`}>
      <form
        action={setFlagRolloutAction.bind(null, {
          flagId,
          stateId: state.id,
          environment: state.environment,
        })}
        className="flex items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-xs text-muted" htmlFor={fieldId}>
          Rollout %
          <input
            id={fieldId}
            name="percentage"
            type="number"
            min={0}
            max={100}
            defaultValue={state.rolloutPercentage}
            disabled={!allowed}
            className="w-24 rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        {!allowed ? (
          <DisabledButton label="Save rollout" />
        ) : state.environment === 'prod' ? (
          <ConfirmSubmit
            label="Save rollout"
            title={`Change the production rollout for this flag?`}
            message="Live traffic moves to the new percentage as soon as you confirm."
          />
        ) : (
          <SubmitButton label="Save rollout" />
        )}
      </form>
      <Refusal message={allowed ? error : refusalCopy('missing_permission:flags.write')} />
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
    >
      {label}
    </button>
  );
}

/** A blocked action stays visible but disabled, with its reason in prose underneath. */
function DisabledButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className={clsx(
        'rounded bg-line px-3 py-1.5 text-sm font-medium text-muted',
        'disabled:cursor-not-allowed',
      )}
    >
      {label}
    </button>
  );
}

function Refusal({ message }: { message?: string }) {
  if (message === undefined) return null;
  return (
    <p className="mt-2 text-sm text-red-700" role="alert">
      {message}
    </p>
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
