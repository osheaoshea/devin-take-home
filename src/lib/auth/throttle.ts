/**
 * Attempt throttling for the demo credentials provider. The password is fixed and the account
 * emails are published on the sign-in page, so an unthrottled check is free to brute-force.
 *
 * Failures are counted per key in process memory: enough for a single-instance demo, and the
 * seam a shared store (Redis, Postgres) would replace when the app runs on more than one node.
 */
export interface ThrottlePolicy {
  maxFailures: number;
  windowMs: number;
}

export const DEMO_SIGN_IN_POLICY: ThrottlePolicy = { maxFailures: 5, windowMs: 15 * 60 * 1000 };

export class TooManyAttemptsError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('too many sign-in attempts; try again later');
    this.name = 'TooManyAttemptsError';
  }
}

interface AttemptWindow {
  failures: number;
  startedAt: number;
}

export class AttemptThrottle {
  private readonly windows = new Map<string, AttemptWindow>();

  constructor(private readonly policy: ThrottlePolicy = DEMO_SIGN_IN_POLICY) {}

  /** Throws when the key has spent its failure budget for the current window. */
  check(key: string, now: number = Date.now()): void {
    const attempt = this.current(key, now);
    if (attempt === undefined || attempt.failures < this.policy.maxFailures) return;
    throw new TooManyAttemptsError(attempt.startedAt + this.policy.windowMs - now);
  }

  recordFailure(key: string, now: number = Date.now()): void {
    const attempt = this.current(key, now) ?? { failures: 0, startedAt: now };
    attempt.failures += 1;
    this.windows.set(key, attempt);
  }

  recordSuccess(key: string): void {
    this.windows.delete(key);
  }

  private current(key: string, now: number): AttemptWindow | undefined {
    const attempt = this.windows.get(key);
    if (attempt === undefined) return undefined;
    if (now - attempt.startedAt >= this.policy.windowMs) {
      this.windows.delete(key);
      return undefined;
    }
    return attempt;
  }
}

export const demoSignInThrottle = new AttemptThrottle();
