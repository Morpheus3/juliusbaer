import { z } from 'zod';

export const Dimension = z.enum(['capacity', 'appetite', 'horizon']);
export type Dimension = z.infer<typeof Dimension>;
export const DIMENSIONS: Dimension[] = ['capacity', 'appetite', 'horizon'];

export const RubricScore = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type RubricScore = z.infer<typeof RubricScore>;

/** The wireframe's rubric text, served so the UI and the LLM prompt share one definition. */
export const RubricLevel = z.object({
  score: RubricScore,
  label: z.string(),
  description: z.string(),
});
export const RubricDefinition = z.object({
  dimension: Dimension,
  title: z.string(),
  subtitle: z.string(),
  levels: z.array(RubricLevel).length(3),
});
export type RubricDefinition = z.infer<typeof RubricDefinition>;

export const RuleContribution = z.object({
  rule: z.string(),
  feature: z.string(),
  value: z.number().nullable(),
  effect: z.number(),
  note: z.string(),
});

export const RulesAssessment = z.object({
  score: RubricScore,
  raw: z.number(),
  contributions: z.array(RuleContribution),
});

export const StatAssessment = z.object({
  score: RubricScore,
  probabilities: z.record(z.string(), z.number()),
  calibrated_confidence: z.number(),
  top_features: z.array(z.object({ feature: z.string(), importance: z.number() })),
  model: z.string(),
  training: z.object({
    archetype_samples: z.number(),
    seed: z.number(),
    holdout_accuracy: z.number(),
  }),
});

export const LlmAssessment = z.object({
  status: z.enum(['ok', 'unavailable', 'invalid']),
  score: RubricScore.nullable(),
  rationale: z.string().nullable(),
  evidence: z.array(z.string()),
  caveats: z.array(z.string()),
  traceId: z.string().nullable(),
  model: z.string().nullable(),
  note: z.string().nullable(),
});
export type LlmAssessment = z.infer<typeof LlmAssessment>;

export const ConfidenceParts = z.object({
  agreement: z.number(),
  statistical: z.number(),
  dataQuality: z.number(),
  freshness: z.number(),
  overall: z.number(),
  assessorsAvailable: z.number(),
  notes: z.array(z.string()),
});
export type ConfidenceParts = z.infer<typeof ConfidenceParts>;

export const DimensionResult = z.object({
  dimension: Dimension,
  systemScore: RubricScore,
  overrideScore: RubricScore.nullable(),
  effectiveScore: RubricScore,
  rules: RulesAssessment,
  statistical: StatAssessment,
  llm: LlmAssessment,
  confidence: ConfidenceParts,
  observedEvidence: z.array(z.string()),
});
export type DimensionResult = z.infer<typeof DimensionResult>;

export const Mismatch = z.object({
  kind: z.enum([
    'PORTFOLIO_RISK_EXCEEDS_APPETITE',
    'STATED_VS_OBSERVED_APPETITE',
    'HORIZON_VS_CASH_NEEDS',
    'CAPACITY_VS_LEVERAGE',
  ]),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  evidence: z.record(z.string(), z.unknown()),
});
export type Mismatch = z.infer<typeof Mismatch>;

export const RubricOverrideView = z.object({
  id: z.string(),
  dimension: Dimension,
  systemScore: RubricScore,
  overrideScore: RubricScore,
  reason: z.string(),
  rmId: z.string(),
  createdAt: z.string(),
});

export const RubricAssessmentResponse = z.object({
  assessmentId: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  clock: z.string(),
  createdAt: z.string(),
  status: z.enum(['draft', 'locked']),
  lockedAt: z.string().nullable(),
  lockedBy: z.string().nullable(),
  definitions: z.array(RubricDefinition),
  dimensions: z.array(DimensionResult).length(3),
  mismatches: z.array(Mismatch),
  stated: z.object({
    riskProfile: z.string(),
    riskScore: z.number(),
    horizonYears: z.number(),
    impliedAppetite: RubricScore,
  }),
  overrides: z.array(RubricOverrideView),
  engineVersions: z.record(z.string(), z.string()),
  llmMode: z.enum(['live', 'recorded', 'unavailable']),
});
export type RubricAssessmentResponse = z.infer<typeof RubricAssessmentResponse>;

export const OverrideRequest = z.object({
  dimension: Dimension,
  score: RubricScore,
  reason: z.string().min(10).max(500),
});
export type OverrideRequest = z.infer<typeof OverrideRequest>;

export const AuditEventView = z.object({
  id: z.string(),
  kind: z.string(),
  actor: z.string(),
  clientId: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type AuditEventView = z.infer<typeof AuditEventView>;
export const AuditResponse = z.object({ events: z.array(AuditEventView) });
export type AuditResponse = z.infer<typeof AuditResponse>;

export const RubricBookRow = z.object({
  clientId: z.string(),
  name: z.string(),
  capacity: RubricScore,
  appetite: RubricScore,
  horizon: RubricScore,
  confidence: z.number(),
  mismatches: z.number(),
  status: z.enum(['draft', 'locked']),
  assessedAt: z.string(),
});
export const RubricBookResponse = z.object({
  rows: z.array(RubricBookRow),
  missing: z.array(z.string()),
});
export type RubricBookResponse = z.infer<typeof RubricBookResponse>;
