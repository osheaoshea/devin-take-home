import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { kycCases, users } from '@/lib/db/schema';
import type { Actor, Role } from '@/lib/rbac';

/** Truncates every table so each test starts from an empty database (migrated in global setup). */
export async function resetDatabase(): Promise<void> {
  await getDb().execute(
    sql`truncate table audit_log, kyc_events, kyc_cases, refund_approvals, refunds, flag_states, flags, sessions, accounts, users restart identity cascade`,
  );
}

export async function createDemoUser(email: string, roles: Role[]): Promise<Actor> {
  const [row] = await getDb().insert(users).values({ email, roles, name: email }).returning();
  if (row === undefined) throw new Error(`failed to create test user ${email}`);
  return { id: row.id, email: row.email, roles: row.roles };
}

export async function insertKycCase(fields: { applicantName: string }): Promise<string> {
  const [row] = await getDb()
    .insert(kycCases)
    .values({
      applicantName: fields.applicantName,
      applicantDob: '1990-01-01',
      country: 'GB',
      documentType: 'passport',
      documentImageUrls: ['https://example.invalid/doc-front.png'],
      providerRiskScore: 42,
      watchlistHits: [],
      slaDueAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  if (row === undefined) throw new Error('failed to insert test kyc case');
  return row.id;
}
