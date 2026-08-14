import { describe, expect, it } from 'vitest';
import type { Actor } from '@/lib/rbac';
import { enforcePermission, enforceRole } from '@/lib/rbac/enforce';

const actor = (roles: Actor['roles']): Actor => ({ id: 'u1', email: 'u1@demo.co', roles });

/** Next signals an HTTP interrupt through the error digest rather than a typed error. */
const digestOf = (fn: () => void): string => {
  try {
    fn();
  } catch (error) {
    return (error as { digest?: string }).digest ?? '';
  }
  return '';
};

describe('enforcePermission', () => {
  it('lets a permitted actor through', () => {
    expect(() => enforcePermission(actor(['admin']), 'audit.read')).not.toThrow();
  });

  it('interrupts an unpermitted actor with a 403 rather than an unhandled error', () => {
    expect(digestOf(() => enforcePermission(actor(['engineer']), 'audit.read'))).toBe(
      'NEXT_HTTP_ERROR_FALLBACK;403',
    );
  });
});

describe('enforceRole', () => {
  it('lets an actor holding an accepted role through', () => {
    expect(() => enforceRole(actor(['admin']), 'admin')).not.toThrow();
  });

  it('interrupts an actor missing every accepted role with a 403', () => {
    expect(digestOf(() => enforceRole(actor(['viewer']), 'admin'))).toBe(
      'NEXT_HTTP_ERROR_FALLBACK;403',
    );
  });
});
