'use client';

import clsx from 'clsx';
import { useState } from 'react';

/**
 * The app's only client island (spec 03): a production change is confirmed before it is posted.
 * The button lives inside its server-action form, so confirming is an ordinary submit and the
 * server re-checks the guards regardless.
 */
export function ConfirmSubmit({
  label,
  title,
  message,
  tone = 'accent',
  testId,
}: {
  label: string;
  title: string;
  message: string;
  tone?: 'accent' | 'danger';
  testId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testId}
        className={clsx(
          'rounded px-3 py-1.5 text-sm font-medium text-white hover:opacity-90',
          tone === 'danger' ? 'bg-red-600' : 'bg-accent',
        )}
      >
        {label}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={title}
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-6"
        >
          <div className="w-full max-w-sm rounded border border-line bg-surface p-6 shadow-xl">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-muted">{message}</p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-line px-3 py-1.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={clsx(
                  'rounded px-3 py-1.5 text-sm font-medium text-white',
                  tone === 'danger' ? 'bg-red-600' : 'bg-accent',
                )}
              >
                {label}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
