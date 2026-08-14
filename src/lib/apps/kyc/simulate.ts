import { randomUUID } from 'node:crypto';
import { onfidoCheckPayloadSchema, type OnfidoCheckPayload } from '@/lib/providers';

const APPLICANTS = [
  { first_name: 'Ada', last_name: 'Lovelace', dob: '1815-12-10', country: 'GB' },
  { first_name: 'Grace', last_name: 'Hopper', dob: '1906-12-09', country: 'US' },
  { first_name: 'Katherine', last_name: 'Johnson', dob: '1918-08-26', country: 'US' },
  { first_name: 'Barbara', last_name: 'Liskov', dob: '1939-11-07', country: 'NL' },
] as const;

const DOCUMENT_TYPES = ['passport', 'driving_licence', 'national_id'] as const;

/**
 * The payload the demo's "simulate new applicant" button sends. Schema and data are real; only
 * the sender is fake, so it goes through the same validation as a genuine provider callback.
 */
export function simulatedCheckPayload(seed = Date.now()): OnfidoCheckPayload {
  const applicant = APPLICANTS[seed % APPLICANTS.length] ?? APPLICANTS[0];
  const riskScore = seed % 101;
  return onfidoCheckPayloadSchema.parse({
    payload: {
      resource_type: 'check',
      action: 'check.completed',
      object: {
        id: `chk_${randomUUID()}`,
        status: 'complete',
        result: riskScore > 60 ? 'consider' : 'clear',
        risk_score: riskScore,
        watchlist_hits:
          riskScore > 80
            ? [{ list: 'OFAC-SDN', match: `${applicant.first_name} ${applicant.last_name}` }]
            : [],
        applicant: {
          ...applicant,
          document_type: DOCUMENT_TYPES[seed % DOCUMENT_TYPES.length] ?? 'passport',
          document_image_urls: [
            `https://placeholder.invalid/doc/${seed}-front.png`,
            `https://placeholder.invalid/doc/${seed}-back.png`,
          ],
        },
      },
    },
  });
}
