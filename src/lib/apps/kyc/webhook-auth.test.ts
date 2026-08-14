import { describe, expect, it } from 'vitest';
import { webhookSecretAccepted } from './webhook-auth';

describe('webhookSecretAccepted', () => {
  it('accepts the configured secret', () => {
    expect(webhookSecretAccepted('s3cret', 's3cret')).toBe(true);
  });

  it('refuses a wrong, absent or differently sized secret', () => {
    expect(webhookSecretAccepted('nope', 's3cret')).toBe(false);
    expect(webhookSecretAccepted('s3cre', 's3cret')).toBe(false);
    expect(webhookSecretAccepted(null, 's3cret')).toBe(false);
  });

  it('refuses everything when no secret is configured, rather than opening the route', () => {
    expect(webhookSecretAccepted('anything', undefined)).toBe(false);
    expect(webhookSecretAccepted('', '')).toBe(false);
  });
});
