import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { DEMO_ACCOUNTS } from '@/lib/auth/demo-accounts';
import { hashPassword } from '@/lib/auth/password';
import { parseGroupRoleMap, resolveRoles } from '@/lib/rbac';
import { createClient, type Database } from './client';
import { flagStates, flags, kycCases, kycEvents, refundApprovals, refunds, users } from './schema';

config({ path: '.env' });

const COUNTRIES = ['GB', 'IE', 'DE', 'FR', 'ES', 'NL', 'US'];
const DOC_TYPES = ['passport', 'driving_licence', 'national_id'];
const FIRST_NAMES = ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus', 'Margaret', 'Dennis', 'Barbara'];
const LAST_NAMES = [
  'Lovelace',
  'Hopper',
  'Turing',
  'Johnson',
  'Torvalds',
  'Hamilton',
  'Ritchie',
  'Liskov',
];
const KYC_STATES = ['pending', 'in_review', 'approved', 'rejected', 'escalated'] as const;
const REFUND_STATES = ['requested', 'needs_second_approval', 'approved', 'rejected'] as const;
const REFUND_REASONS = ['duplicate_charge', 'item_not_received', 'goodwill', 'fraud_claim'];

/** Deterministic pseudo-randomness keeps re-seeded demos identical. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('empty list');
  return item;
}

async function seedDemoUsers(db: Database): Promise<Record<string, string>> {
  const groupMap = parseGroupRoleMap(process.env.ENTRA_GROUP_MAP);
  const ids: Record<string, string> = {};
  for (const account of DEMO_ACCOUNTS) {
    const [row] = await db
      .insert(users)
      .values({
        email: account.email,
        name: account.name,
        groups: account.groups,
        roles: resolveRoles(account.groups, groupMap),
        passwordHash: hashPassword(account.password),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: account.name,
          groups: account.groups,
          roles: resolveRoles(account.groups, groupMap),
          passwordHash: hashPassword(account.password),
        },
      })
      .returning();
    if (row === undefined) throw new Error(`failed to seed ${account.email}`);
    ids[account.email] = row.id;
  }
  return ids;
}

async function seedKyc(db: Database, ids: Record<string, string>): Promise<void> {
  const random = makeRandom(7);
  const analyst = ids['analyst@demo.co']!;
  const manager = ids['kmanager@demo.co']!;

  for (let index = 0; index < 40; index += 1) {
    const state = index < 14 ? 'pending' : pick(random, KYC_STATES);
    const riskScore = Math.floor(random() * 100);
    const applicantName = `${pick(random, FIRST_NAMES)} ${pick(random, LAST_NAMES)}`;
    const [row] = await db
      .insert(kycCases)
      .values({
        applicantName,
        applicantDob: `19${60 + Math.floor(random() * 39)}-0${1 + Math.floor(random() * 8)}-1${Math.floor(random() * 9)}`,
        country: pick(random, COUNTRIES),
        documentType: pick(random, DOC_TYPES),
        documentImageUrls: [
          `https://placeholder.invalid/doc/${index}-front.png`,
          `https://placeholder.invalid/doc/${index}-back.png`,
        ],
        providerRiskScore: riskScore,
        watchlistHits: riskScore > 80 ? [{ list: 'OFAC-SDN', match: applicantName }] : [],
        state,
        assignedToId: state === 'pending' ? null : analyst,
        escalatedById: state === 'escalated' ? analyst : null,
        resolutionReasonCode:
          state === 'approved'
            ? 'documents_verified'
            : state === 'rejected'
              ? 'document_mismatch'
              : null,
        slaDueAt: new Date(Date.now() + (index - 8) * 3_600_000),
      })
      .returning();
    if (row === undefined) continue;

    await db.insert(kycEvents).values({
      caseId: row.id,
      provider: 'onfido',
      payload: {
        payload: {
          resource_type: 'check',
          action: 'check.completed',
          object: {
            id: `chk_${index}`,
            status: 'complete',
            result: riskScore > 60 ? 'consider' : 'clear',
            risk_score: riskScore,
            watchlist_hits: [],
            applicant: {
              first_name: applicantName.split(' ')[0],
              last_name: applicantName.split(' ')[1],
              dob: '1985-04-12',
              country: row.country,
              document_type: row.documentType,
              document_image_urls: row.documentImageUrls,
            },
          },
        },
      },
    });
    void manager;
  }
}

async function seedRefunds(db: Database, ids: Record<string, string>): Promise<void> {
  const random = makeRandom(11);
  const agent = ids['agent@demo.co']!;
  const financeManager = ids['fmanager@demo.co']!;
  const financeManager2 = ids['fmanager2@demo.co']!;

  for (let index = 0; index < 30; index += 1) {
    // A spread across the £100 and £5,000 thresholds so the routing rules are visible.
    const amountPence = [4_500, 9_900, 12_500, 48_000, 499_900, 780_000][index % 6]!;
    const state =
      amountPence > 500_000
        ? pick(random, ['requested', 'needs_second_approval', 'approved'] as const)
        : pick(random, REFUND_STATES);
    const [row] = await db
      .insert(refunds)
      .values({
        customerEmail: `customer${index}@example.com`,
        paymentId: `pi_mock_${1000 + index}`,
        amountPence,
        currency: 'GBP',
        reasonCode: pick(random, REFUND_REASONS),
        state,
        requestedById: agent,
        providerRefundId: state === 'approved' ? `re_mock_${index}` : null,
      })
      .returning();
    if (row === undefined) continue;

    if (state === 'needs_second_approval' || state === 'approved') {
      await db.insert(refundApprovals).values({ refundId: row.id, approverId: financeManager });
    }
    if (state === 'approved' && amountPence > 500_000) {
      await db.insert(refundApprovals).values({ refundId: row.id, approverId: financeManager2 });
    }
  }
}

async function seedFlags(db: Database): Promise<void> {
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

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '')
    throw new Error('DATABASE_URL is not set (see .env.example)');
  const { sql: connection, db } = createClient(url);

  // Idempotent: demo data is replaced wholesale, demo accounts are upserted.
  await db.execute(
    sql`truncate table kyc_events, kyc_cases, refund_approvals, refunds, flag_states, flags restart identity cascade`,
  );

  const ids = await seedDemoUsers(db);
  await seedKyc(db, ids);
  await seedRefunds(db, ids);
  await seedFlags(db);
  await connection.end();

  console.log(`seeded ${DEMO_ACCOUNTS.length} demo accounts, 40 KYC cases, 30 refunds, 12 flags`);
}

void main();
