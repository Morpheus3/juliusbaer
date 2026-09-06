/**
 * Access schema: who may act, and as whom. Holds no client data, so it carries no row-level
 * security; the entitlement function reads raw.rm_assignments and raw.rms.
 */
import { pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { rms } from './raw.js';

export const access = pgSchema('access');

export const users = access.table('users', {
  userId: uuid().primaryKey().defaultRandom(),
  /** The identity provider's subject claim; in development, a short handle. */
  subject: text().notNull().unique(),
  displayName: text().notNull(),
  email: text(),
  rmId: text().references(() => rms.rmId),
  status: text().notNull().default('active'),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** rm → own book · team_head → the team's books · checker → own book, may approve as second pair of eyes · admin → everything */
export const roles = access.table('roles', {
  role: text().primaryKey(),
  scope: text().notNull(),
  description: text().notNull().default(''),
});

export const userRoles = access.table(
  'user_roles',
  {
    userId: uuid()
      .notNull()
      .references(() => users.userId),
    role: text()
      .notNull()
      .references(() => roles.role),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);
