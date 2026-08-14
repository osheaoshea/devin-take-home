'use client';

import { z } from 'zod';
import { Form, type SubmitTone } from '@/lib/ui/Form';

const noFieldsSchema = z.object({});

/**
 * A single guarded decision. The button is presentation: the machine's guards decide, and this only
 * posts the bound target back to the server action.
 */
export function RefundActionForm({
  label,
  tone,
  idPrefix,
  action,
  error,
}: {
  label: string;
  tone: SubmitTone;
  /** Namespaces the form's ids, since one refund renders several of these side by side. */
  idPrefix: string;
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
}) {
  return (
    <Form
      schema={noFieldsSchema}
      fields={[]}
      action={action}
      submitLabel={label}
      submitTone={tone}
      idPrefix={idPrefix}
      error={error}
    />
  );
}
