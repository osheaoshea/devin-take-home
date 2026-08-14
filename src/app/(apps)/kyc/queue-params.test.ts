import { describe, expect, it } from 'vitest';
import { setNow } from '@/lib/time';
import { dueBeforeFor, kycQueueParamsSchema, singleValueParams } from './queue-params';

describe('kycQueueParamsSchema', () => {
  it('defaults to the SLA-ordered first page', () => {
    expect(kycQueueParamsSchema.parse({})).toEqual({ sort: 'sla', dir: 'asc', page: 1 });
  });

  it('coerces the numeric filters a URL carries as strings', () => {
    expect(kycQueueParamsSchema.parse({ minRisk: '70', page: '3' })).toMatchObject({
      minRisk: 70,
      page: 3,
    });
  });

  it('rejects a state that is not a KYC state', () => {
    expect(() => kycQueueParamsSchema.parse({ state: 'archived' })).toThrow();
  });
});

describe('singleValueParams', () => {
  it('drops empty values and keeps the first of a repeated one', () => {
    expect(singleValueParams({ state: '', sort: ['risk', 'sla'], page: '2' })).toEqual({
      sort: 'risk',
      page: '2',
    });
  });
});

describe('dueBeforeFor', () => {
  it('reads the clock through now()', () => {
    const pinned = new Date('2024-05-01T12:00:00.000Z');
    setNow(() => pinned);

    expect(dueBeforeFor(undefined)).toBeUndefined();
    expect(dueBeforeFor('overdue')).toEqual(pinned);
    expect(dueBeforeFor('due_soon')).toEqual(new Date('2024-05-01T16:00:00.000Z'));

    setNow(undefined);
  });
});
