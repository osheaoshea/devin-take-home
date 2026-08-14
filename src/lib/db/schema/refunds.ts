import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './foundation';

export const refundStateEnum = pgEnum('refund_state', [
  'requested',
  'needs_second_approval',
  'approved',
  'rejected',
]);

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

export const refundsRelations = relations(refunds, ({ many }) => ({
  approvals: many(refundApprovals),
}));
export const refundApprovalsRelations = relations(refundApprovals, ({ one }) => ({
  refund: one(refunds, { fields: [refundApprovals.refundId], references: [refunds.id] }),
}));

export type Refund = typeof refunds.$inferSelect;
