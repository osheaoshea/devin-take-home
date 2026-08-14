import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const environmentEnum = pgEnum('environment', ['dev', 'staging', 'prod']);
export const rolloutKindEnum = pgEnum('rollout_kind', ['boolean', 'percentage']);

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

export type Flag = typeof flags.$inferSelect;
export type FlagState = typeof flagStates.$inferSelect;
