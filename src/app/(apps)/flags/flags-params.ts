import { z } from 'zod';

/** The flags page keeps its whole state in the URL: which flag is open, and any refusal to show. */
export const flagsParamsSchema = z.object({
  flag: z.string().uuid().optional(),
  error: z.string().optional(),
});

export type FlagsParams = z.infer<typeof flagsParamsSchema>;

export function singleValueParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const single = Array.isArray(value) ? value[0] : value;
      return single === undefined || single === '' ? [] : [[key, single]];
    }),
  );
}

/** Rebuilds the flags URL, optionally opening a flag and reporting a control-qualified refusal. */
export function flagsHref(flagId?: string, error?: string): string {
  const params = new URLSearchParams();
  if (flagId !== undefined) params.set('flag', flagId);
  if (error !== undefined) params.set('error', error);
  const query = params.toString();
  return query === '' ? '/flags' : `/flags?${query}`;
}
