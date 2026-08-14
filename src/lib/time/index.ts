/**
 * The platform's single source of time. Domain code (mutations, seeds, SLA logic) asks this
 * module for the current time instead of calling `new Date()` directly, so tests can pin the
 * clock. Session-expiry code in lib/auth is deliberately out of scope.
 */

let clock: () => Date = () => new Date();

export function now(): Date {
  return clock();
}

/** Test hook: pin the clock to a fixed date or a custom function. Pass nothing to restore. */
export function setNow(next?: Date | (() => Date)): void {
  if (next === undefined) clock = () => new Date();
  else if (next instanceof Date) clock = () => next;
  else clock = next;
}
