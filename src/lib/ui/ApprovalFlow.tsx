import { StatusBadge } from './StatusBadge';

export interface ApprovalStep {
  label: string;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface ApprovalAction {
  label: string;
  formAction: (formData: FormData) => void | Promise<void>;
  /** Refusal reason from `lib/workflow`; when present the button is disabled and explained. */
  refusedReason?: string;
}

/**
 * Renders the approvals a decision requires, who has given them, and the actions this actor
 * may take — gated by the workflow guards rather than by hiding buttons.
 */
export function ApprovalFlow({
  steps,
  actions,
}: {
  steps: ApprovalStep[];
  actions: ApprovalAction[];
}) {
  return (
    <section className="space-y-4">
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="text-sm">{step.label}</span>
            {step.approvedBy === undefined ? (
              <StatusBadge tone="warning">pending</StatusBadge>
            ) : (
              <StatusBadge tone="success">
                {step.approvedBy}
                {step.approvedAt ? ` · ${step.approvedAt.toISOString().slice(0, 16)}` : ''}
              </StatusBadge>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <form key={action.label} action={action.formAction}>
            <button
              type="submit"
              disabled={action.refusedReason !== undefined}
              title={action.refusedReason}
              className="rounded border border-line px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.label}
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
