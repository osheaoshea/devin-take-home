import { timingSafeEqual } from 'node:crypto';

export const WEBHOOK_SECRET_HEADER = 'x-webhook-secret';

/**
 * The provider holds no session, so a shared secret is the only thing separating a real callback
 * from an anonymous POST. An unset secret accepts nothing: a missing configuration closes the
 * route rather than opening it.
 */
export function webhookSecretAccepted(
  presented: string | null,
  expected = process.env.KYC_WEBHOOK_SECRET,
): boolean {
  if (expected === undefined || expected === '' || presented === null) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
