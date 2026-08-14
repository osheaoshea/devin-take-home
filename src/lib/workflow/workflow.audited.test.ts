import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readAuditLog } from '@/lib/audit';
import { closeDb } from '@/lib/db/client';
import { findKycCaseById } from '@/lib/db/queries';
import type { KycCase } from '@/lib/db/schema';
import type { Actor } from '@/lib/rbac';
import { defineMachine, hasPermission, TransitionRefusedError } from '@/lib/workflow';
import { createDemoUser, insertKycCase, resetDatabase } from '@/test/db';

const machine = defineMachine<KycCase, KycCase['state']>({
  entityType: 'kyc_case',
  stateOf: (entity) => entity.state,
  transitions: { 'pending->in_review': [hasPermission('kyc.claim')] },
  persist: ({ tx, entity, from, context }) =>
    tx.claimKycCase(entity.id, (context as { assigneeId: string }).assigneeId, from),
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

  it('refuses a transition whose entity was moved by someone else since it was read', async () => {
    const caseId = await insertKycCase({ applicantName: 'Grace Hopper' });
    const stale = await findKycCaseById(analyst, caseId);
    const other = await createDemoUser('analyst2@demo.co', ['kyc_analyst']);

    // The first analyst claims the case; the second still holds the pending read.
    await machine.transition({
      actor: other,
      entity: (await findKycCaseById(other, caseId))!,
      to: 'in_review',
      context: { assigneeId: other.id },
    });

    await expect(
      machine.transition({
        actor: analyst,
        entity: stale!,
        to: 'in_review',
        context: { assigneeId: analyst.id },
      }),
    ).rejects.toThrow(TransitionRefusedError);

    // The winner's claim stands and the refused attempt left no trace.
    expect(await findKycCaseById(admin, caseId)).toMatchObject({
      state: 'in_review',
      assignedToId: other.id,
    });
    const entries = await readAuditLog(admin, { entityId: caseId });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorId: other.id });
  });

  it('reports stale_state as the refusal reason', async () => {
    const caseId = await insertKycCase({ applicantName: 'Grace Hopper' });
    const stale = await findKycCaseById(analyst, caseId);
    await machine.transition({
      actor: analyst,
      entity: stale!,
      to: 'in_review',
      context: { assigneeId: analyst.id },
    });

    await expect(
      machine.transition({
        actor: analyst,
        entity: stale!,
        to: 'in_review',
        context: { assigneeId: analyst.id },
      }),
    ).rejects.toMatchObject({ reason: 'stale_state', transition: 'pending->in_review' });
  });
});
