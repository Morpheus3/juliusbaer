/**
 * Ingest schema: the landing zone for messages from Kafka or a batch drop, and the change log the
 * analytics service and the alerts read to know which clients moved.
 */
import { index, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ingest = pgSchema('ingest');

export const stagingMessages = ingest.table(
  'staging_messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    topic: text().notNull(),
    type: text().notNull(),
    /** source system + sequence; the same message twice is a no-op. */
    idempotencyKey: text().notNull().unique(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    /** received | applied | rejected */
    status: text().notNull().default('received'),
    error: text(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp({ withTimezone: true }),
    loadRunId: uuid(),
  },
  (t) => [index('staging_status_idx').on(t.status, t.receivedAt)],
);

export const changeLog = ingest.table(
  'change_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    clientId: text(),
    entity: text().notNull(),
    entityId: text().notNull(),
    /** insert | update | delete | snapshot | assignment */
    kind: text().notNull(),
    loadRunId: uuid(),
    appliedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('change_log_client_idx').on(t.clientId, t.appliedAt)],
);
