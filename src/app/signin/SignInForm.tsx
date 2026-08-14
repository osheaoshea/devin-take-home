'use client';

import { z } from 'zod';
import { Form } from '@/lib/ui/Form';

const schema = z.object({
  email: z.string().email('Enter the demo account email'),
  password: z.string().min(1, 'Enter the demo password'),
});

const ERRORS: Record<string, string> = {
  invalid: 'Check the email and password.',
  rejected: 'Those demo credentials were rejected.',
  throttled: 'Too many failed attempts. Wait a few minutes and try again.',
};

/**
 * Zod schemas are not serialisable across the server/client boundary, so schema-driven forms
 * are composed in a client module and handed a server action.
 */
export function SignInForm({
  action,
  defaultPassword,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultPassword: string;
  error?: string;
}) {
  return (
    <Form
      schema={schema}
      action={action}
      submitLabel="Sign in"
      error={error === undefined ? undefined : ERRORS[error]}
      fields={[
        { name: 'email', label: 'Email', type: 'email', defaultValue: 'admin@demo.co' },
        { name: 'password', label: 'Password', type: 'password', defaultValue: defaultPassword },
      ]}
    />
  );
}
