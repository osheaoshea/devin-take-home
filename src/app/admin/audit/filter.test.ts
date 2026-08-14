import { describe, expect, it } from 'vitest';
import { auditFilterSchema } from './filter';

describe('auditFilterSchema', () => {
  it('reads a date-only lower bound as the start of that day', () => {
    expect(auditFilterSchema.parse({ from: '2026-08-14' }).from?.toISOString()).toBe(
      '2026-08-14T00:00:00.000Z',
    );
  });

  it('reads a date-only upper bound as the end of that day, so today is included', () => {
    expect(auditFilterSchema.parse({ to: '2026-08-14' }).to?.toISOString()).toBe(
      '2026-08-14T23:59:59.999Z',
    );
  });

  it('leaves a full timestamp upper bound alone', () => {
    expect(auditFilterSchema.parse({ to: '2026-08-14T09:30:00.000Z' }).to?.toISOString()).toBe(
      '2026-08-14T09:30:00.000Z',
    );
  });

  it('defaults to the first page', () => {
    expect(auditFilterSchema.parse({}).page).toBe(1);
    expect(auditFilterSchema.parse({ page: '3' }).page).toBe(3);
  });
});
