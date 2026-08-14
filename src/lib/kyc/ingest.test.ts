import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readAuditLog } from '@/lib/audit';
import { closeDb, getDb } from '@/lib/db/client';
import { countKycCases, selectKycCases } from '@/lib/db/queries';
import { kycEvents } from '@/lib/db/schema';
import { AuthorizationError, type Actor } from '@/lib/rbac';
import { createDemoUser, resetDatabase } from '@/test/db';
import { ingestKycCheck, KYC_WEBHOOK_ACTOR } from './ingest';
import { simulatedCheckPayload } from './simulate';

let analyst: Actor;
let admin: Actor;
let engineer: Actor;

beforeEach(async () => {
  await resetDatabase();
  analyst = await createDemoUser('analyst@demo.co', ['kyc_analyst']);
  admin = await createDemoUser('admin@demo.co', ['admin']);
  engineer = await createDemoUser('engineer@demo.co', ['engineer']);
});

afterAll(async () => {
  await closeDb();
});

describe('ingestKycCheck', () => {
  it('opens a pending case from the provider payload', async () => {
    const payload = simulatedCheckPayload(7);

    const kycCase = await ingestKycCheck(payload);

    const applicant = payload.payload.object.applicant;
    expect(kycCase).toMatchObject({
      state: 'pending',
      applicantName: `${applicant.first_name} ${applicant.last_name}`,
      country: applicant.country,
      providerRiskScore: payload.payload.object.risk_score,
      assignedToId: null,
    });
  });

  it('archives the payload against the case it created', async () => {
    const kycCase = await ingestKycCheck(simulatedCheckPayload(3));

    const events = await getDb().select().from(kycEvents).where(eq(kycEvents.caseId, kycCase.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: 'onfido' });
  });

  it('audits the case as opened by the webhook service identity', async () => {
    const kycCase = await ingestKycCheck(simulatedCheckPayload(1));

    const [entry] = await readAuditLog(admin, { entityId: kycCase.id });
    expect(entry).toMatchObject({
      action: 'kyc.case.created',
      entityType: 'kyc_case',
      actorId: KYC_WEBHOOK_ACTOR.id,
      actorEmail: KYC_WEBHOOK_ACTOR.email,
      actorRolesSnapshot: [],
    });
  });
});

describe('the queue accessors', () => {
  it('refuse an actor without kyc.read', async () => {
    await ingestKycCheck(simulatedCheckPayload(2));

    await expect(selectKycCases(engineer, {})).rejects.toThrow(AuthorizationError);
  });

  it('filter by state, risk and assignee', async () => {
    await ingestKycCheck(simulatedCheckPayload(90));
    await ingestKycCheck(simulatedCheckPayload(10));

    expect(await countKycCases(analyst, { state: 'pending' })).toBe(2);
    expect(await countKycCases(analyst, { minRisk: 50 })).toBe(1);
    expect(await countKycCases(analyst, { assignedToId: analyst.id })).toBe(0);
  });

  it('sorts and pages the queue', async () => {
    await ingestKycCheck(simulatedCheckPayload(90));
    await ingestKycCheck(simulatedCheckPayload(10));

    const page = await selectKycCases(analyst, {
      sort: 'risk',
      direction: 'desc',
      limit: 1,
      offset: 0,
    });
    expect(page).toHaveLength(1);
    expect(page[0]?.providerRiskScore).toBe(90);
  });
});
