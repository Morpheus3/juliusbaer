/**
 * Derived schema: what the loader and the engines write. Iteration 0 creates the
 * load bookkeeping and the data-quality register; later iterations add vectors,
 * rubric scores, signals, insights, actions and the audit log.
 */
import {
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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

/** pgvector column. Stored as `vector(n)`; read back as a JSON-ish "[...]" string which we parse. */
const vector = (dims: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType: () => `vector(${dims})`,
    toDriver: (value) => `[${value.join(',')}]`,
    fromDriver: (value) => JSON.parse(value) as number[],
  });

export const NOTE_EMBEDDING_DIMS = 256;

export const vectorRuns = derived.table('vector_runs', {
  id: uuid().primaryKey().defaultRandom(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  datasetToday: text().notNull(),
  engineVersion: text().notNull(),
  /** Ordered feature manifest: name, label, unit, description, rubric dimension, direction. */
  manifest: jsonb().$type<FeatureManifestEntry[]>().notNull(),
  clientCount: integer().notNull(),
});

export interface FeatureManifestEntry {
  name: string;
  label: string;
  unit: string;
  description: string;
  rubric: 'capacity' | 'appetite' | 'horizon' | 'context';
  /** What a higher value means for the rubric dimension. */
  higherMeans: string;
  group: string;
}

export const clientFactual = derived.table('client_factual', {
  clientId: text().primaryKey(),
  runId: uuid()
    .notNull()
    .references(() => vectorRuns.id, { onDelete: 'cascade' }),
  facts: jsonb().$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const clientVectors = derived.table('client_vectors', {
  clientId: text().primaryKey(),
  runId: uuid()
    .notNull()
    .references(() => vectorRuns.id, { onDelete: 'cascade' }),
  /** Feature name → value (null where not computable, e.g. LTV for a client with no facility). */
  features: jsonb().$type<Record<string, number | null>>().notNull(),
  /** Feature name → percentile rank in the book, 0–100. */
  percentiles: jsonb().$type<Record<string, number | null>>().notNull(),
  /** Feature name → list of evidence references (table/row ids) used to compute it. */
  evidence: jsonb().$type<Record<string, unknown>>().notNull(),
  peers: jsonb().$type<PeerRef[]>().notNull(),
  noteEmbedding: vector(NOTE_EMBEDDING_DIMS)(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export interface PeerRef {
  clientId: string;
  distance: number;
  /** Features where this peer differs most from the subject, with both values. */
  differences: { feature: string; subject: number | null; peer: number | null }[];
}

/** Reference: what a structured product is exposed to, and which direct holdings share an issuer. */
export const lookthroughLegs = derived.table(
  'lookthrough_legs',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    instrumentId: text().notNull(),
    leg: text().notNull(),
    weight: numeric({ precision: 8, scale: 4, mode: 'number' }).notNull(),
    exposureName: text().notNull(),
    sector: text().notNull(),
    region: text().notNull(),
    matchedInstrumentId: text(),
    note: text().notNull(),
  },
  (t) => [index('lookthrough_instrument_idx').on(t.instrumentId)],
);

export const issuerGroups = derived.table('issuer_groups', {
  instrumentId: text().primaryKey(),
  exposureName: text().notNull(),
});

/** Reference: how each event reaches portfolios (match rules) and the factor shock it implies. */
export const signalRules = derived.table('signal_rules', {
  eventId: text().primaryKey(),
  match: jsonb().$type<Record<string, unknown>[]>().notNull(),
  shock: jsonb().$type<Record<string, unknown>>().notNull(),
  note: text().notNull(),
});

export const signalThresholds = derived.table('signal_thresholds', {
  seriesId: text().primaryKey(),
  threshold: numeric({ precision: 12, scale: 4, mode: 'number' }).notNull(),
});

/** Saved impact runs: the request that produced them and the full result, for audit and replay. */
export const impactRuns = derived.table(
  'impact_runs',
  {
    id: uuid().primaryKey().defaultRandom(),
    clientId: text().notNull(),
    snapshotDate: text().notNull(),
    label: text(),
    request: jsonb().$type<Record<string, unknown>>().notNull(),
    result: jsonb().$type<Record<string, unknown>>().notNull(),
    engineVersion: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('impact_runs_client_idx').on(t.clientId, t.createdAt)],
);
