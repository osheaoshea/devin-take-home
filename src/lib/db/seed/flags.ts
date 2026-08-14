import { sql } from 'drizzle-orm';
import { type Database } from '../client';
import { flagStates, flags } from '../schema';
import { makeRandom } from './foundation';

export async function seedFlags(db: Database): Promise<void> {
  await db.execute(sql`truncate table flag_states, flags restart identity cascade`);

  const definitions = [
    ['checkout-v2', 'New checkout flow'],
    ['instant-payouts', 'Same-day payouts for verified merchants'],
    ['kyc-auto-approve', 'Auto-approve low-risk applicants'],
    ['refunds-dual-approval', 'Require two approvals above £5,000'],
    ['dashboard-dark-mode', 'Dark theme for the internal hub'],
    ['fraud-model-v3', 'Third-generation fraud scoring'],
    ['sepa-instant', 'SEPA instant credit transfers'],
    ['card-3ds-step-up', 'Step-up 3DS challenge on risky payments'],
    ['support-macros', 'Canned responses in the support console'],
    ['ledger-rewrite', 'Double-entry ledger migration'],
    ['merchant-onboarding-v2', 'Shortened merchant onboarding'],
    ['audit-export-csv', 'CSV export from the audit viewer'],
  ] as const;

  const random = makeRandom(13);
  for (const [key, description] of definitions) {
    const [flag] = await db
      .insert(flags)
      .values({ key, description })
      .onConflictDoUpdate({ target: flags.key, set: { description } })
      .returning();
    if (flag === undefined) continue;

    for (const environment of ['dev', 'staging', 'prod'] as const) {
      const percentage = Math.floor(random() * 100);
      const kind = percentage % 3 === 0 ? 'percentage' : 'boolean';
      await db
        .insert(flagStates)
        .values({
          flagId: flag.id,
          environment,
          kind,
          enabled: environment === 'dev' ? true : percentage > 40,
          rolloutPercentage: kind === 'percentage' ? percentage : 0,
        })
        .onConflictDoNothing();
    }
  }
}
