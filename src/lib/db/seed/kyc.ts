import { sql } from 'drizzle-orm';
import { now } from '@/lib/time';
import { type Database } from '../client';
import { kycCases, kycEvents } from '../schema';
import { makeRandom, pick } from './foundation';

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

export async function seedKyc(db: Database, ids: Record<string, string>): Promise<void> {
  await db.execute(sql`truncate table kyc_events, kyc_cases restart identity cascade`);

  const random = makeRandom(7);
  const manager = ids['manager1@demo.co']!;

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
        assignedToId: state === 'pending' ? null : manager,
        escalatedById: state === 'escalated' ? manager : null,
        resolutionReasonCode:
          state === 'approved'
            ? 'documents_verified'
            : state === 'rejected'
              ? 'document_mismatch'
              : null,
        slaDueAt: new Date(now().getTime() + (index - 8) * 3_600_000),
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
  }
}
