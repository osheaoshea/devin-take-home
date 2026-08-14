import { describe, expect, it } from 'vitest';
import { permissionForPath } from './registry';

describe('permissionForPath', () => {
  it('reports the permission an app route is gated on', () => {
    expect(permissionForPath('/kyc')).toBe('kyc.read');
    expect(permissionForPath('/refunds?state=requested')).toBe('refunds.read');
    expect(permissionForPath('/flags/some-flag')).toBe('flags.read');
  });

  it('reports the audit reader, which no app owns', () => {
    expect(permissionForPath('/admin/audit')).toBe('audit.read');
    expect(permissionForPath('/admin/audit?entry=abc')).toBe('audit.read');
  });

  it('leaves paths open when nothing gates them', () => {
    expect(permissionForPath('/')).toBeUndefined();
    expect(permissionForPath('/signin')).toBeUndefined();
    // A sibling path is not a prefix match.
    expect(permissionForPath('/flagsmith')).toBeUndefined();
  });
});
