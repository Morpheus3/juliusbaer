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

/** Reference: market-context series that become derived signals, with match rules and a shock template. */
export const signalSeriesRules = derived.table('signal_series_rules', {
  seriesId: text().primaryKey(),
  unit: text().notNull(),
  threshold: numeric({ precision: 12, scale: 4, mode: 'number' }).notNull(),
  match: jsonb().$type<Record<string, unknown>[]>().notNull(),
  shock: jsonb().$type<{ path: string; factor: number }[]>().notNull(),
});

/** Reference: named stress scenarios for this dataset's world. */
export const scenarios = derived.table('scenarios', {
  id: text().primaryKey(),
  ordinal: integer().notNull(),
  name: text().notNull(),
  description: text().notNull(),
  shock: jsonb().$type<Record<string, unknown>>().notNull(),
  horizonDays: integer().notNull(),
  probabilityNote: text().notNull(),
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

/** One rubric assessment per client per run: three dimensions, three assessors, the combined result. */
export const rubricAssessments = derived.table(
  'rubric_assessments',
  {
    id: uuid().primaryKey().defaultRandom(),
    clientId: text().notNull(),
    vectorRunId: uuid().references(() => vectorRuns.id, { onDelete: 'set null' }),
    clock: text().notNull(),
    status: text().notNull().default('draft'),
    result: jsonb().$type<Record<string, unknown>>().notNull(),
    engineVersions: jsonb().$type<Record<string, string>>().notNull(),
    lockedAt: timestamp({ withTimezone: true }),
    lockedBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rubric_client_idx').on(t.clientId, t.createdAt)],
);

export const rubricOverrides = derived.table(
  'rubric_overrides',
  {
    id: uuid().primaryKey().defaultRandom(),
    assessmentId: uuid()
      .notNull()
      .references(() => rubricAssessments.id, { onDelete: 'cascade' }),
    clientId: text().notNull(),
    dimension: text().notNull(),
    systemScore: integer().notNull(),
    overrideScore: integer().notNull(),
    reason: text().notNull(),
    rmId: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rubric_overrides_client_idx').on(t.clientId)],
);

/** Every Claude call: prompt id and hash, model, inputs hash, response, usage, latency. */
export const llmTraces = derived.table(
  'llm_traces',
  {
    id: uuid().primaryKey().defaultRandom(),
    promptId: text().notNull(),
    promptVersion: text().notNull(),
    promptHash: text().notNull(),
    model: text().notNull(),
    mode: text().notNull(),
    inputHash: text().notNull(),
    clientId: text(),
    request: jsonb().$type<Record<string, unknown>>().notNull(),
    response: jsonb().$type<Record<string, unknown>>(),
    usage: jsonb().$type<Record<string, unknown>>(),
    latencyMs: integer(),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('llm_traces_client_idx').on(t.clientId, t.createdAt)],
);

/** Append-only log of RM decisions and system actions. */
export const auditEvents = derived.table(
  'audit_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().notNull(),
    actor: text().notNull(),
    clientId: text(),
    entityType: text(),
    entityId: text(),
    summary: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_client_idx').on(t.clientId, t.createdAt),
    index('audit_kind_idx').on(t.kind),
  ],
);

/** RM decisions on generated actions and trade ideas. Generation is deterministic; this stores the human overlay. */
export const actionDecisions = derived.table(
  'action_decisions',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Deterministic id of the generated item (client + kind + entity). */
    actionId: text().notNull(),
    clientId: text().notNull(),
    entityType: text().notNull(),
    decision: text().notNull(),
    note: text(),
    actor: text().notNull(),
    snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('action_decisions_client_idx').on(t.clientId, t.createdAt),
    index('action_decisions_action_idx').on(t.actionId),
  ],
);
