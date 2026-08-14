import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './foundation';

export const kycCaseStateEnum = pgEnum('kyc_case_state', [
  'pending',
  'in_review',
  'approved',
  'rejected',
  'escalated',
]);

// --- KYC (spec 01) ---

export const kycCases = pgTable(
  'kyc_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicantName: text('applicant_name').notNull(),
    applicantDob: date('applicant_dob').notNull(),
    country: text('country').notNull(),
    documentType: text('document_type').notNull(),
    documentImageUrls: jsonb('document_image_urls').notNull(),
    providerRiskScore: integer('provider_risk_score').notNull(),
    watchlistHits: jsonb('watchlist_hits').notNull(),
    state: kycCaseStateEnum('state').notNull().default('pending'),
    assignedToId: uuid('assigned_to_id').references(() => users.id),
    escalatedById: uuid('escalated_by_id').references(() => users.id),
    resolutionReasonCode: text('resolution_reason_code'),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('kyc_cases_state_idx').on(table.state)],
);

/** Archive of inbound provider webhook payloads. */
export const kycEvents = pgTable('kyc_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => kycCases.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

export type KycCase = typeof kycCases.$inferSelect;
