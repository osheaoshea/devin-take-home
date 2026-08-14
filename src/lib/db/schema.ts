import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { ROLES } from '@/lib/rbac';

export const roleEnum = pgEnum('role', ROLES);
export const kycCaseStateEnum = pgEnum('kyc_case_state', [
  'pending',
  'in_review',
  'approved',
  'rejected',
  'escalated',
]);
export const refundStateEnum = pgEnum('refund_state', [
  'requested',
  'needs_second_approval',
  'approved',
  'rejected',
]);
export const environmentEnum = pgEnum('environment', ['dev', 'staging', 'prod']);
export const rolloutKindEnum = pgEnum('rollout_kind', ['boolean', 'percentage']);

// --- identity (Auth.js adapter tables + role snapshot) ---

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  image: text('image'),
  /** Fake Entra groups for demo accounts; production reads groups from the OIDC claim. */
  groups: text('groups').array().notNull().default([]),
  /** Roles resolved at sign-in, so audit entries record the roles held at the time. */
  roles: roleEnum('roles').array().notNull().default([]),
  /** Demo credentials provider only; null for Entra-authenticated users. */
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

// --- audit (append-only) ---

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    actorRolesSnapshot: roleEnum('actor_roles_snapshot').array().notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_entity_idx').on(table.entityType, table.entityId),
    index('audit_log_actor_idx').on(table.actorId),
    index('audit_log_created_at_idx').on(table.createdAt),
  ],
);

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

// --- refunds (spec 02) ---

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerEmail: text('customer_email').notNull(),
    paymentId: text('payment_id').notNull(),
    /** Minor units, so money never touches a float. */
    amountPence: integer('amount_pence').notNull(),
    currency: text('currency').notNull().default('GBP'),
    reasonCode: text('reason_code').notNull(),
    state: refundStateEnum('state').notNull().default('requested'),
    requestedById: uuid('requested_by_id')
      .notNull()
      .references(() => users.id),
    providerRefundId: text('provider_refund_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('refunds_state_idx').on(table.state)],
);

/** One row per approval, so dual approval needs no extra columns. */
export const refundApprovals = pgTable(
  'refund_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    refundId: uuid('refund_id')
      .notNull()
      .references(() => refunds.id, { onDelete: 'cascade' }),
    approverId: uuid('approver_id')
      .notNull()
      .references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('refund_approvals_unique').on(table.refundId, table.approverId)],
);

// --- feature flags (spec 03) ---

export const flags = pgTable('flags', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const flagStates = pgTable(
  'flag_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    flagId: uuid('flag_id')
      .notNull()
      .references(() => flags.id, { onDelete: 'cascade' }),
    environment: environmentEnum('environment').notNull(),
    kind: rolloutKindEnum('kind').notNull().default('boolean'),
    enabled: boolean('enabled').notNull().default(false),
    rolloutPercentage: integer('rollout_percentage').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('flag_states_unique').on(table.flagId, table.environment)],
);

export const flagsRelations = relations(flags, ({ many }) => ({ states: many(flagStates) }));
export const flagStatesRelations = relations(flagStates, ({ one }) => ({
  flag: one(flags, { fields: [flagStates.flagId], references: [flags.id] }),
}));
export const refundsRelations = relations(refunds, ({ many }) => ({
  approvals: many(refundApprovals),
}));
export const refundApprovalsRelations = relations(refundApprovals, ({ one }) => ({
  refund: one(refunds, { fields: [refundApprovals.refundId], references: [refunds.id] }),
}));

export type User = typeof users.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type KycCase = typeof kycCases.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type Flag = typeof flags.$inferSelect;
export type FlagState = typeof flagStates.$inferSelect;
