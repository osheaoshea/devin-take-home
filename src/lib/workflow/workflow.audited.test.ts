import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readAuditLog } from '@/lib/audit';
import { closeDb } from '@/lib/db/client';
import { findKycCaseById } from '@/lib/db/queries';
import type { KycCase } from '@/lib/db/schema';
import type { Actor } from '@/lib/rbac';
import { defineMachine, hasPermission } from '@/lib/workflow';
import { createDemoUser, insertKycCase, resetDatabase } from '@/test/db';

const machine = defineMachine<KycCase, KycCase['state']>({
  entityType: 'kyc_case',
  stateOf: (entity) => entity.state,
  transitions: { 'pending->in_review': [hasPermission('kyc.claim')] },
  persist: (tx, entity, _to, context) =>
    tx.claimKycCase(entity.id, (context as { assigneeId: string }).assigneeId),
  action: (to) => `kyc.case.${to}`,
});

let analyst: Actor;
let admin: Actor;

beforeEach(async () => {
  await resetDatabase();
  analyst = await createDemoUser('analyst@demo.co', ['kyc_analyst']);
  admin = await createDemoUser('admin@demo.co', ['admin']);
});

afterAll(async () => {
  await closeDb();
});

describe('a transition executed through the workflow module', () => {
  it('persists the new state and audits it in one step', async () => {
    const caseId = await insertKycCase({ applicantName: 'Grace Hopper' });
    const entity = await findKycCaseById(analyst, caseId);

    const updated = await machine.transition({
      actor: analyst,
      entity: entity!,
      to: 'in_review',
      context: { assigneeId: analyst.id },
    });

    expect(updated.state).toBe('in_review');
    expect(await readAuditLog(admin, { entityId: caseId })).toMatchObject([
      {
        action: 'kyc.case.in_review',
        actorId: analyst.id,
        actorRolesSnapshot: ['kyc_analyst'],
        before: { state: 'pending' },
        after: { state: 'in_review' },
      },
    ]);
  });

  it('records nothing when the transition is refused', async () => {
    const caseId = await insertKycCase({ applicantName: 'Grace Hopper' });
    const entity = await findKycCaseById(admin, caseId);
    const viewer = await createDemoUser('viewer@demo.co', ['viewer']);

    await expect(
      machine.transition({
        actor: viewer,
        entity: entity!,
        to: 'in_review',
        context: { assigneeId: viewer.id },
      }),
    ).rejects.toThrow(/missing_permission/);

    expect(await readAuditLog(admin, { entityId: caseId })).toHaveLength(0);
    expect(await findKycCaseById(admin, caseId)).toMatchObject({ state: 'pending' });
  });
});
