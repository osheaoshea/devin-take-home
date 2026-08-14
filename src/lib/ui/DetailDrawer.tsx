'use client';

import { useRouter } from 'next/navigation';

/** Slide-over detail panel. Open/closed state lives in the URL so it is server-renderable. */
export function DetailDrawer({
  title,
  subtitle,
  closeHref,
  children,
}: {
  title: string;
  subtitle?: string;
  closeHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="fixed inset-0 z-20 flex justify-end" role="dialog" aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        className="flex-1 bg-ink/20"
        onClick={() => router.push(closeHref)}
      />
      <aside className="flex w-full max-w-xl flex-col overflow-y-auto border-l border-line bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="text-sm text-muted underline"
            onClick={() => router.push(closeHref)}
          >
            Close
          </button>
        </div>
        <div className="mt-6 space-y-6 text-sm">{children}</div>
      </aside>
    </div>
  );
}
