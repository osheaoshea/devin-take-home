import { afterEach, describe, expect, it } from 'vitest';
import { demoAuthEnabled } from './demo-accounts';
import { AttemptThrottle, TooManyAttemptsError } from './throttle';

const ENV_KEYS = ['DEMO_AUTH_ENABLED', 'DEMO_AUTH_ALLOW_REMOTE_HOST', 'AUTH_URL', 'NEXTAUTH_URL'];
const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function env(values: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

describe('demoAuthEnabled', () => {
  it('is off unless the flag is explicitly true', () => {
    env({ AUTH_URL: 'http://localhost:3000' });
    expect(demoAuthEnabled()).toBe(false);
    env({ DEMO_AUTH_ENABLED: 'false', AUTH_URL: 'http://localhost:3000' });
    expect(demoAuthEnabled()).toBe(false);
  });

  it('is on for a locally served app', () => {
    env({ DEMO_AUTH_ENABLED: 'true', AUTH_URL: 'http://localhost:3000' });
    expect(demoAuthEnabled()).toBe(true);
    env({ DEMO_AUTH_ENABLED: 'true', AUTH_URL: 'http://127.0.0.1:3000' });
    expect(demoAuthEnabled()).toBe(true);
  });

  it('refuses a deployed host that inherited the flag', () => {
    env({ DEMO_AUTH_ENABLED: 'true', AUTH_URL: 'https://tools.example.com' });
    expect(demoAuthEnabled()).toBe(false);
  });

  it('allows a deployed host only with the explicit second opt-in', () => {
    env({
      DEMO_AUTH_ENABLED: 'true',
      AUTH_URL: 'https://demo.example.com',
      DEMO_AUTH_ALLOW_REMOTE_HOST: 'true',
    });
    expect(demoAuthEnabled()).toBe(true);
  });
});

describe('AttemptThrottle', () => {
  const policy = { maxFailures: 3, windowMs: 60_000 };

  it('allows attempts until the failure budget is spent', () => {
    const throttle = new AttemptThrottle(policy);
    for (let attempt = 0; attempt < policy.maxFailures; attempt += 1) {
      throttle.check('ip:admin@demo.co', 0);
      throttle.recordFailure('ip:admin@demo.co', 0);
    }

    expect(() => throttle.check('ip:admin@demo.co', 0)).toThrow(TooManyAttemptsError);
  });

  it('throttles one key without touching another', () => {
    const throttle = new AttemptThrottle(policy);
    for (let attempt = 0; attempt < policy.maxFailures; attempt += 1) {
      throttle.recordFailure('ip:admin@demo.co', 0);
    }

    expect(() => throttle.check('ip:viewer@demo.co', 0)).not.toThrow();
  });

  it('forgets failures once the window has passed', () => {
    const throttle = new AttemptThrottle(policy);
    for (let attempt = 0; attempt < policy.maxFailures; attempt += 1) {
      throttle.recordFailure('ip:admin@demo.co', 0);
    }

    expect(() => throttle.check('ip:admin@demo.co', policy.windowMs - 1)).toThrow();
    expect(() => throttle.check('ip:admin@demo.co', policy.windowMs)).not.toThrow();
  });

  it('clears the count on a successful sign-in', () => {
    const throttle = new AttemptThrottle(policy);
    throttle.recordFailure('ip:admin@demo.co', 0);
    throttle.recordFailure('ip:admin@demo.co', 0);
    throttle.recordSuccess('ip:admin@demo.co');

    for (let attempt = 0; attempt < policy.maxFailures; attempt += 1) {
      throttle.check('ip:admin@demo.co', 0);
      throttle.recordFailure('ip:admin@demo.co', 0);
    }
    expect(() => throttle.check('ip:admin@demo.co', 0)).toThrow(TooManyAttemptsError);
  });

  it('reports how long the caller must wait', () => {
    const throttle = new AttemptThrottle(policy);
    for (let attempt = 0; attempt < policy.maxFailures; attempt += 1) {
      throttle.recordFailure('ip:admin@demo.co', 1_000);
    }

    try {
      throttle.check('ip:admin@demo.co', 11_000);
      expect.unreachable('expected a throttle error');
    } catch (error) {
      expect(error).toBeInstanceOf(TooManyAttemptsError);
      expect((error as TooManyAttemptsError).retryAfterMs).toBe(50_000);
    }
  });
});
