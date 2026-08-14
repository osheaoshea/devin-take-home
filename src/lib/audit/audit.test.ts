import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { audited, readAuditLog } from '@/lib/audit';
import { closeDb } from '@/lib/db/client';
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
      (tx) => tx.claimKycCase(caseId, analyst.id),
    );

    const [entry] = await readAuditLog(admin, {});
    expect(entry?.before).toMatchObject({ state: 'pending', assignedToId: null });
    expect(entry?.after).toMatchObject({ state: 'in_review', assignedToId: analyst.id });
  });

  it('writes exactly one entry per audited mutation', async () => {
    const caseId = await insertKycCase({ applicantName: 'Ada Lovelace' });

    await audited(
      { actor: analyst, action: 'kyc.case.claim', entityType: 'kyc_case', entityId: caseId },
      (tx) => tx.claimKycCase(caseId, analyst.id),
    );

    expect(await readAuditLog(admin, {})).toHaveLength(1);
  });

  it('leaves neither the change nor an audit entry when the mutation fails', async () => {
    const caseId = await insertKycCase({ applicantName: 'Ada Lovelace' });

    await expect(
      audited(
        { actor: analyst, action: 'kyc.case.claim', entityType: 'kyc_case', entityId: caseId },
        async (tx) => {
          await tx.claimKycCase(caseId, analyst.id);
          throw new Error('provider exploded');
        },
      ),
    ).rejects.toThrow('provider exploded');

    expect(await findKycCaseById(analyst, caseId)).toMatchObject({ state: 'pending' });
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
