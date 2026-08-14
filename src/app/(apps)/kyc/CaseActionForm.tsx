'use client';

import { z } from 'zod';
import { Form, type SubmitTone } from '@/lib/ui/Form';

const reasonCodeSchema = z.object({ reasonCode: z.string().min(1, 'Pick a reason code.') });
const noFieldsSchema = z.object({});

/**
 * A single guarded action. The schema lives on the client so `Form` can validate before posting;
 * the server action re-validates it, since the button is presentation and never the gate.
 */
export function CaseActionForm({
  label,
  target,
  reasonCodes,
  tone,
  action,
  error,
}: {
  label: string;
  /** The state being moved to, which is how the reason-code field is titled. */
  target: string;
  reasonCodes: readonly string[];
  tone: SubmitTone;
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
}) {
  const withReason = reasonCodes.length > 0;
  return (
    <Form
      schema={withReason ? reasonCodeSchema : noFieldsSchema}
      fields={
        withReason
          ? [
              {
                name: 'reasonCode',
                label: `Reason code (${target})`,
                type: 'select',
                options: reasonCodes.map((code) => ({ value: code, label: code })),
              },
            ]
          : []
      }
      action={action}
      submitLabel={label}
      submitTone={tone}
      error={error}
    />
  );
}
