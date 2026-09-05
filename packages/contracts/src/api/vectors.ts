import { z } from 'zod';

export const RubricDimension = z.enum(['capacity', 'appetite', 'horizon', 'context']);
export type RubricDimension = z.infer<typeof RubricDimension>;

export const FeatureManifestEntry = z.object({
  name: z.string(),
  label: z.string(),
  unit: z.string(),
  description: z.string(),
  rubric: RubricDimension,
  higherMeans: z.string(),
  group: z.string(),
});
export type FeatureManifestEntry = z.infer<typeof FeatureManifestEntry>;

export const PeerRef = z.object({
  clientId: z.string(),
  name: z.string(),
  distance: z.number(),
  differences: z.array(
    z.object({ feature: z.string(), subject: z.number().nullable(), peer: z.number().nullable() }),
  ),
});
export type PeerRef = z.infer<typeof PeerRef>;

export const FeatureValue = z.object({
  name: z.string(),
  value: z.number().nullable(),
  percentile: z.number().nullable(),
  evidence: z.record(z.string(), z.unknown()),
});
export type FeatureValue = z.infer<typeof FeatureValue>;

/** The factual record is a JSON document produced by the analytics service. */
export const ClientFactual = z.object({
  client_id: z.string(),
  name: z.string(),
  is_entity: z.boolean(),
  age: z.number().nullable(),
  gender: z.string().nullable(),
  nationality: z.string(),
  country_of_residence: z.string(),
  tax_domicile: z.string(),
  domicile_differs_from_residence: z.boolean(),
  booking_centre: z.string(),
  base_currency: z.string(),
  reporting_language: z.string(),
  wealth_band: z.string(),
  life_stage: z.string(),
  source_of_wealth: z.string(),
  objectives: z.array(z.string()),
  stated_risk_profile: z.string(),
  stated_risk_score: z.number(),
  stated_horizon_years: z.number(),
  stated_liquidity_needs: z.string(),
  client_since: z.string(),
  relationship_years: z.number(),
  kyc_review_due: z.string(),
  kyc_days_to_due: z.number(),
  kyc_status: z.enum(['overdue', 'due_soon', 'current']),
  pep: z.boolean(),
  aum_usd_current: z.number(),
  aum_usd_baseline: z.number(),
  portfolios: z.array(
    z.object({
      portfolio_id: z.string(),
      name: z.string(),
      mandate_code: z.string(),
      mandate_name: z.string(),
      service_model: z.string(),
      base_currency: z.string(),
      aum_usd_current: z.number(),
      managed: z.boolean(),
    }),
  ),
  credit_facilities: z.array(
    z.object({
      facility_id: z.string(),
      type: z.string(),
      currency: z.string(),
      limit: z.number(),
      drawn: z.number(),
      ltv_pct: z.number(),
      margin_call_ltv_pct: z.number(),
      headroom: z.number(),
    }),
  ),
  commitments_uncalled_usd: z.number(),
  planned_cash_needs: z.array(
    z.object({
      need_id: z.string(),
      description: z.string(),
      currency: z.string(),
      amount: z.number(),
      amount_usd: z.number(),
      due_from: z.string(),
      due_to: z.string(),
      recurrence: z.string(),
      certainty: z.string(),
      days_until_due_from: z.number(),
    }),
  ),
  notes_count: z.number(),
  last_contact_date: z.string().nullable(),
  days_since_last_contact: z.number().nullable(),
  last_contact_channel: z.string().nullable(),
});
export type ClientFactual = z.infer<typeof ClientFactual>;

export const ClientVectorResponse = z.object({
  run: z.object({
    id: z.string(),
    createdAt: z.string(),
    engineVersion: z.string(),
    datasetToday: z.string(),
  }),
  manifest: z.array(FeatureManifestEntry),
  factual: ClientFactual,
  features: z.array(FeatureValue),
  peers: z.array(PeerRef),
});
export type ClientVectorResponse = z.infer<typeof ClientVectorResponse>;

export const VectorBookRow = z.object({
  clientId: z.string(),
  name: z.string(),
  features: z.record(z.string(), z.number().nullable()),
  percentiles: z.record(z.string(), z.number().nullable()),
});
export const VectorBookResponse = z.object({
  run: z.object({ id: z.string(), createdAt: z.string(), engineVersion: z.string() }),
  manifest: z.array(FeatureManifestEntry),
  rows: z.array(VectorBookRow),
});
export type VectorBookResponse = z.infer<typeof VectorBookResponse>;

export const VectorRebuildResponse = z.object({
  runId: z.string(),
  engineVersion: z.string(),
  clientCount: z.number(),
  featureCount: z.number(),
});
export type VectorRebuildResponse = z.infer<typeof VectorRebuildResponse>;
