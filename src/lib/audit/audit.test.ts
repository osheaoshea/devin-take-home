import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { audited, readAuditLog, readAuditLogPage } from '@/lib/audit';
import { closeDb, getDb } from '@/lib/db/client';
import { findKycCaseById } from '@/lib/db/queries';
import { AuthorizationError, type Actor } from '@/lib/rbac';
import { createDemoUser, insertKycCase, resetDatabase } from '@/test/db';

let analyst: Actor;
let manager: Actor;
let admin: Actor;

beforeEach(async () => {
  await resetDatabase();
  analyst = await createDemoUser('analyst@demo.co', ['kyc_analyst']);
  manager = await createDemoUser('kmanager@demo.co', ['kyc_manager']);
  admin = await createDemoUser('admin@demo.co', ['admin']);
});

afterAll(async () => {
  await closeDb();
});

describe('audited', () => {
  it('returns whatever the wrapped mutation returns', async () => {
    const caseId = await insertKycCase({ applicantName: 'Ada Lovelace' });

    const result = await audited(
      { actor: analyst, action: 'kyc.case.claim', entityType: 'kyc_case', entityId: caseId },
      async () => 'claimed',
    );

    expect(result).toBe('claimed');
  });

  it('records the actor, the roles they held, the action and the entity', async () => {
    const caseId = await insertKycCase({ applicantName: 'Ada Lovelace' });

    await audited(
      { actor: manager, action: 'kyc.case.approve', entityType: 'kyc_case', entityId: caseId },
      async () => undefined,
    );

    const [entry] = await readAuditLog(admin, {});
    expect(entry).toMatchObject({
      actorId: manager.id,
      actorRolesSnapshot: ['kyc_manager'],
      action: 'kyc.case.approve',
      entityType: 'kyc_case',
      entityId: caseId,
    });
  });

  it('records before and after states of the changed entity', async () => {
    const caseId = await insertKycCase({ applicantName: 'Ada Lovelace' });
    const before = await findKycCaseById(analyst, caseId);

    await audited(
      {
        actor: analyst,
        action: 'kyc.case.claim',
        entityType: 'kyc_case',
        entityId: caseId,
        before,
      },
      (tx) => tx.claimKycCase(caseId, analyst.id, 'pending'),
    );

    const [entry] = await readAuditLog(admin, {});
    expect(entry?.before).toMatchObject({ state: 'pending', assignedToId: null });
    expect(entry?.after).toMatchObject({ state: 'in_review', assignedToId: analyst.id });
  });

  it('writes exactly one entry per audited mutation', async () => {
    const caseId = await insertKycCase({ applicantName: 'Ada Lovelace' });

    await audited(
      { actor: analyst, action: 'kyc.case.claim', entityType: 'kyc_case', entityId: caseId },
      (tx) => tx.claimKycCase(caseId, analyst.id, 'pending'),
    );

    expect(await readAuditLog(admin, {})).toHaveLength(1);
  });

  it('leaves neither the change nor an audit entry when the mutation fails', async () => {
    const caseId = await insertKycCase({ applicantName: 'Ada Lovelace' });

    await expect(
      audited(
        { actor: analyst, action: 'kyc.case.claim', entityType: 'kyc_case', entityId: caseId },
        async (tx) => {
          await tx.claimKycCase(caseId, analyst.id, 'pending');
          throw new Error('provider exploded');
        },
      ),
    ).rejects.toThrow('provider exploded');

    expect(await findKycCaseById(analyst, caseId)).toMatchObject({ state: 'pending' });
    expect(await readAuditLog(admin, {})).toHaveLength(0);
  });
});

describe('append-only enforcement', () => {
  const anEntry = async (): Promise<string> => {
    await audited(
      { actor: analyst, action: 'kyc.case.claim', entityType: 'kyc_case', entityId: 'case-1' },
      async () => undefined,
    );
    const [entry] = await readAuditLog(admin, {});
    if (entry === undefined) throw new Error('expected an audit entry');
    return entry.id;
  };

  it('refuses to update an entry', async () => {
    const id = await anEntry();
    await expect(
      getDb().execute(sql`update audit_log set action = 'tampered' where id = ${id}`),
    ).rejects.toThrow(/append-only/);
    expect((await readAuditLog(admin, {}))[0]?.action).toBe('kyc.case.claim');
  });

  it('refuses to delete an entry', async () => {
    const id = await anEntry();
    await expect(getDb().execute(sql`delete from audit_log where id = ${id}`)).rejects.toThrow(
      /append-only/,
    );
    expect(await readAuditLog(admin, {})).toHaveLength(1);
  });

  it('still allows the test harness to truncate the table', async () => {
    await anEntry();
    await resetDatabase();
    admin = await createDemoUser('admin@demo.co', ['admin']);
    expect(await readAuditLog(admin, {})).toHaveLength(0);
  });
});

describe('readAuditLog', () => {
  const write = (actor: Actor, action: string, entityType: string, entityId: string) =>
    audited({ actor, action, entityType, entityId }, async () => undefined);

  it('returns entries newest first', async () => {
    await write(analyst, 'kyc.case.claim', 'kyc_case', 'case-1');
    await write(manager, 'kyc.case.approve', 'kyc_case', 'case-1');

    expect((await readAuditLog(admin, {})).map((entry) => entry.action)).toEqual([
      'kyc.case.approve',
      'kyc.case.claim',
    ]);
  });

  it('filters by actor', async () => {
    await write(analyst, 'kyc.case.claim', 'kyc_case', 'case-1');
    await write(manager, 'kyc.case.approve', 'kyc_case', 'case-1');

    const entries = await readAuditLog(admin, { actorId: analyst.id });
    expect(entries.map((entry) => entry.action)).toEqual(['kyc.case.claim']);
  });

  it('filters by entity type and id', async () => {
    await write(analyst, 'kyc.case.claim', 'kyc_case', 'case-1');
    await write(analyst, 'flag.update', 'flag', 'flag-1');

    expect((await readAuditLog(admin, { entityType: 'flag' })).map((e) => e.entityId)).toEqual([
      'flag-1',
    ]);
    expect((await readAuditLog(admin, { entityId: 'case-1' })).map((e) => e.action)).toEqual([
      'kyc.case.claim',
    ]);
  });

  it('filters by action', async () => {
    await write(analyst, 'kyc.case.claim', 'kyc_case', 'case-1');
    await write(manager, 'kyc.case.approve', 'kyc_case', 'case-1');

    expect(
      (await readAuditLog(admin, { action: 'kyc.case.approve' })).map((e) => e.actorId),
    ).toEqual([manager.id]);
  });

  it('filters by date range', async () => {
    await write(analyst, 'kyc.case.claim', 'kyc_case', 'case-1');

    expect(await readAuditLog(admin, { from: new Date(Date.now() + 60_000) })).toHaveLength(0);
    expect(await readAuditLog(admin, { to: new Date(Date.now() - 60_000) })).toHaveLength(0);
    expect(
      await readAuditLog(admin, {
        from: new Date(Date.now() - 60_000),
        to: new Date(Date.now() + 60_000),
      }),
    ).toHaveLength(1);
  });

  it('refuses to show the log to an actor without audit.read', async () => {
    await expect(readAuditLog(analyst, {})).rejects.toThrow(AuthorizationError);
  });
});

describe('readAuditLogPage', () => {
  const write = (action: string, entityId: string) =>
    audited({ actor: analyst, action, entityType: 'kyc_case', entityId }, async () => undefined);

  it('pages through the whole log with offset, reporting the unpaged total', async () => {
    for (let index = 0; index < 5; index += 1) await write(`kyc.case.step-${index}`, 'case-1');

    const first = await readAuditLogPage(admin, { limit: 2, offset: 0 });
    const last = await readAuditLogPage(admin, { limit: 2, offset: 4 });

    expect(first.total).toBe(5);
    expect(first.entries.map((entry) => entry.action)).toEqual([
      'kyc.case.step-4',
      'kyc.case.step-3',
    ]);
    expect(last.total).toBe(5);
    expect(last.entries.map((entry) => entry.action)).toEqual(['kyc.case.step-0']);
  });

  it('counts only the entries the filter matches', async () => {
    await write('kyc.case.claim', 'case-1');
    await write('kyc.case.claim', 'case-2');
    await write('kyc.case.approve', 'case-1');

    const page = await readAuditLogPage(admin, { action: 'kyc.case.claim', limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.entries).toHaveLength(1);
  });

  it('refuses an actor without audit.read', async () => {
    await expect(readAuditLogPage(analyst, {})).rejects.toThrow(AuthorizationError);
  });
});
