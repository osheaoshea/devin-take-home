import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Demo-account passwords only; production identities live in Entra. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (stored === null) return false;
  const [salt, digest] = stored.split(':');
  if (salt === undefined || digest === undefined) return false;
  const expected = Buffer.from(digest, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}
