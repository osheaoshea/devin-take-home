import { afterEach, describe, expect, it } from 'vitest';
import { setNow } from '@/lib/time';
import { slaCountdown, slaDueAtFor, slaStatus } from './sla';

const AT = new Date('2026-01-01T12:00:00.000Z');

afterEach(() => {
  setNow();
});

describe('sla due-at', () => {
  it('gives a new case 24 hours from when its check arrived', () => {
    expect(slaDueAtFor(AT).toISOString()).toBe('2026-01-02T12:00:00.000Z');
  });

  it('reads the clock through lib/time when no time is given', () => {
    setNow(AT);
    expect(slaDueAtFor().toISOString()).toBe('2026-01-02T12:00:00.000Z');
  });
});

describe('sla status', () => {
  it.each([
    ['2026-01-01T11:59:00.000Z', 'overdue'],
    ['2026-01-01T12:00:00.000Z', 'overdue'],
    ['2026-01-01T15:59:00.000Z', 'due_soon'],
    ['2026-01-01T16:00:00.000Z', 'due_soon'],
    ['2026-01-01T16:01:00.000Z', 'on_track'],
  ] as const)('reports %s as %s', (dueAt, expected) => {
    expect(slaStatus(new Date(dueAt), AT)).toBe(expected);
  });
});

describe('sla countdown', () => {
  it('counts down to the due-at', () => {
    expect(slaCountdown(new Date('2026-01-01T15:12:00.000Z'), AT)).toBe('3h 12m left');
  });

  it('counts up once the due-at has passed', () => {
    expect(slaCountdown(new Date('2026-01-01T10:55:00.000Z'), AT)).toBe('1h 5m overdue');
  });
});
