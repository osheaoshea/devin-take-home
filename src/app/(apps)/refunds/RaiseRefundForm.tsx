'use client';

import { raiseRefundFormSchema } from '@/lib/apps/refunds/raise-form';
import { REFUND_REASON_CODES } from '@/lib/apps/refunds/reason-codes';
import { Form } from '@/lib/ui/Form';

/**
 * Raising a refund. The schema is the one the server action re-validates, so the client's inline
 * errors and the server's refusal cannot drift apart.
 */
export function RaiseRefundForm({
  action,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
}) {
  return (
    <Form
      schema={raiseRefundFormSchema}
      idPrefix="refund-raise"
      fields={[
        {
          name: 'customerEmail',
          label: 'Customer email',
          type: 'email',
          placeholder: 'customer@example.com',
        },
        { name: 'paymentId', label: 'Original payment id', placeholder: 'pi_mock_1000' },
        { name: 'amountPounds', label: 'Amount (£)', type: 'number', placeholder: '5000.00' },
        {
          name: 'reasonCode',
          label: 'Reason',
          type: 'select',
          options: REFUND_REASON_CODES.map((code) => ({ value: code, label: code })),
        },
      ]}
      action={action}
      submitLabel="Raise refund"
      error={error}
    />
  );
}
