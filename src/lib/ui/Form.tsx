'use client';

import { useState } from 'react';
import type { z } from 'zod';

export interface FieldConfig {
  name: string;
  label: string;
  type?: 'text' | 'password' | 'email' | 'number' | 'date' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: string;
}

/**
 * Zod-schema-driven form: the same schema validates on the client for inline errors and on
 * the server inside the action (convention 4).
 */
export function Form({
  schema,
  fields,
  action,
  submitLabel = 'Save',
  error,
}: {
  schema: z.ZodType<unknown>;
  fields: FieldConfig[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel?: string;
  error?: string;
}) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        const result = schema.safeParse(Object.fromEntries(formData));
        if (result.success) {
          setFieldErrors({});
          return;
        }
        event.preventDefault();
        const errors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const key = issue.path[0];
          if (typeof key === 'string' && errors[key] === undefined) errors[key] = issue.message;
        }
        setFieldErrors(errors);
      }}
      className="space-y-4"
      noValidate
    >
      {fields.map((field) => (
        <div key={field.name} className="space-y-1">
          <label className="block text-sm font-medium" htmlFor={field.name}>
            {field.label}
          </label>
          {field.type === 'select' ? (
            <select
              id={field.name}
              name={field.name}
              defaultValue={field.defaultValue}
              className="w-full rounded border border-line bg-surface px-2 py-1.5 text-sm"
            >
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={field.name}
              name={field.name}
              type={field.type ?? 'text'}
              placeholder={field.placeholder}
              defaultValue={field.defaultValue}
              className="w-full rounded border border-line bg-surface px-2 py-1.5 text-sm"
            />
          )}
          {fieldErrors[field.name] !== undefined ? (
            <p className="text-xs text-red-600" role="alert">
              {fieldErrors[field.name]}
            </p>
          ) : null}
        </div>
      ))}
      {error !== undefined ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
      >
        {submitLabel}
      </button>
    </form>
  );
}
