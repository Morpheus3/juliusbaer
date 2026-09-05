/**
 * Derived schema: what the loader and the engines write. Iteration 0 creates the
 * load bookkeeping and the data-quality register; later iterations add vectors,
 * rubric scores, signals, insights, actions and the audit log.
 */
import { index, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const derived = pgSchema('derived');

export const loadRuns = derived.table('load_runs', {
  id: uuid().primaryKey().defaultRandom(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp({ withTimezone: true }),
  status: text().notNull().default('running'),
  datasetToday: text().notNull(),
  sourceDir: text().notNull(),
  rowCounts: jsonb().$type<Record<string, number>>().notNull().default({}),
  issueCount: integer().notNull().default(0),
  error: text(),
});

export const dataQualityIssues = derived.table(
  'data_quality_issues',
  {
    id: uuid().primaryKey().defaultRandom(),
    loadRunId: uuid()
      .notNull()
      .references(() => loadRuns.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    severity: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    clientId: text(),
    message: text().notNull(),
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    detectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('dq_issues_run_idx').on(t.loadRunId),
    index('dq_issues_client_idx').on(t.clientId),
    index('dq_issues_code_idx').on(t.code),
  ],
);
