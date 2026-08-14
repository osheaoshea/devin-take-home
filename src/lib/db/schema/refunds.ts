import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './foundation';

export const refundStateEnum = pgEnum('refund_state', ['requested', 'approved', 'rejected']);

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
    /** Who approved or rejected it: one decision per refund, so no separate approvals table. */
    decidedById: uuid('decided_by_id').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    providerRefundId: text('provider_refund_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('refunds_state_idx').on(table.state)],
);

export type Refund = typeof refunds.$inferSelect;
