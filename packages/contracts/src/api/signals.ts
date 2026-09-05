import { z } from 'zod';
import { SnapshotDateSchema } from '../dataset/common.js';

/** Factor shock vector shared by the signal engine (TS) and the impact engine (Python). */
export const Shock = z.object({
  rates_bps: z.record(z.string(), z.number()).default({}),
  credit_spread_bps: z.partialRecord(z.enum(['ig', 'hy', 'em']), z.number()).default({}),
  equity_pct: z.record(z.string(), z.number()).default({}),
  sector_overlay_pct: z.record(z.string(), z.number()).default({}),
  fx_pct_vs_usd: z.record(z.string(), z.number()).default({}),
  gold_pct: z.number().default(0),
  brent_pct: z.number().default(0),
  vix_points: z.number().default(0),
});
export type Shock = z.infer<typeof Shock>;

export const SignalSeverity = z.enum(['LOW', 'MEDIUM', 'HIGH', 'SEVERE']);
export type SignalSeverity = z.infer<typeof SignalSeverity>;

export const SignalConfidence = z.object({
  dataFreshness: z.number(),
  sourceReliability: z.number(),
  modelConfidence: z.number(),
  overall: z.number(),
  notes: z.array(z.string()),
});

export const AffectedHolding = z.object({
  portfolioId: z.string(),
  instrumentId: z.string(),
  name: z.string(),
  assetClass: z.string(),
  marketValueUsd: z.number(),
  householdPct: z.number(),
  via: z.enum(['direct', 'lookthrough', 'facility']),
  matchedBy: z.string(),
});
export type AffectedHolding = z.infer<typeof AffectedHolding>;

export const Signal = z.object({
  id: z.string(),
  kind: z.enum(['event', 'derived']),
  eventType: z.string(),
  date: z.string(),
  ageDays: z.number(),
  severity: SignalSeverity,
  title: z.string(),
  description: z.string(),
  region: z.string(),
  channels: z.array(z.string()),
  source: z.object({ name: z.string(), reference: z.string(), detail: z.string() }),
  affectedAssetClasses: z.array(z.string()),
  shock: Shock,
  confidence: SignalConfidence,
  /** Present when a clientId was supplied. */
  client: z
    .object({
      exposedUsd: z.number(),
      exposedPct: z.number(),
      affected: z.array(AffectedHolding),
      whyItMatters: z.string(),
    })
    .nullable(),
});
export type Signal = z.infer<typeof Signal>;

export const SignalsResponse = z.object({
  clock: z.string(),
  snapshotDate: SnapshotDateSchema,
  snapshotAgeDays: z.number(),
  stale: z.boolean(),
  signals: z.array(Signal),
});
export type SignalsResponse = z.infer<typeof SignalsResponse>;

export const ScenarioSeverity = z.enum(['mild', 'base', 'severe']);
export type ScenarioSeverity = z.infer<typeof ScenarioSeverity>;

export const Scenario = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  shock: Shock,
  horizonDays: z.number(),
  probabilityNote: z.string(),
});
export type Scenario = z.infer<typeof Scenario>;
export const ScenariosResponse = z.object({ scenarios: z.array(Scenario) });

export const ImpactRequest = z.object({
  signalIds: z.array(z.string()).default([]),
  scenarioId: z.string().optional(),
  severity: ScenarioSeverity.default('base'),
  snapshotDate: SnapshotDateSchema.optional(),
  label: z.string().max(80).optional(),
  save: z.boolean().default(false),
});
export type ImpactRequest = z.infer<typeof ImpactRequest>;

export const ImpactLine = z.object({
  portfolio_id: z.string(),
  instrument_id: z.string(),
  name: z.string(),
  asset_class: z.string(),
  currency: z.string(),
  mv_usd: z.number(),
  rates_usd: z.number(),
  credit_usd: z.number(),
  equity_usd: z.number(),
  fx_usd: z.number(),
  commodity_usd: z.number(),
  total_usd: z.number(),
  total_pct: z.number(),
  model: z.string(),
  parameters: z.record(z.string(), z.unknown()),
});
export type ImpactLine = z.infer<typeof ImpactLine>;

export const ImpactResponse = z.object({
  run_id: z.string().nullable(),
  engine_version: z.string(),
  client_id: z.string(),
  snapshot_date: SnapshotDateSchema,
  severity: ScenarioSeverity,
  shock: Shock,
  start_usd: z.number(),
  stressed_usd: z.number(),
  total_usd: z.number(),
  total_pct: z.number(),
  by_factor: z.record(z.enum(['rates', 'credit', 'equity', 'fx', 'commodity']), z.number()),
  by_asset_class: z.array(
    z.object({
      asset_class: z.string(),
      mv_usd: z.number(),
      impact_usd: z.number(),
      impact_pct: z.number(),
    }),
  ),
  lines: z.array(ImpactLine),
  collateral: z.array(
    z.object({
      facility_id: z.string(),
      drawn: z.number(),
      lending_value_before: z.number(),
      lending_value_after: z.number(),
      ltv_before_pct: z.number(),
      ltv_after_pct: z.number(),
      margin_call_ltv_pct: z.number(),
      breached_after: z.boolean(),
      shortfall_ccy: z.number(),
    }),
  ),
  liquidity: z.object({
    daily_liquid_before_usd: z.number(),
    daily_liquid_after_usd: z.number(),
    needs_12m_usd: z.number(),
    coverage_before: z.number().nullable(),
    coverage_after: z.number().nullable(),
  }),
  coverage: z.object({
    modelled_pct_of_aum: z.number(),
    unmodelled_usd: z.number(),
    unmodelled_names: z.array(z.string()),
  }),
  confidence: z.object({
    point: z.number(),
    low_usd: z.number(),
    high_usd: z.number(),
    notes: z.array(z.string()),
  }),
  assumptions: z.array(z.string()),
});
export type ImpactResponse = z.infer<typeof ImpactResponse>;

export const ImpactRunSummary = z.object({
  id: z.string(),
  label: z.string().nullable(),
  snapshotDate: z.string(),
  createdAt: z.string(),
  totalUsd: z.number(),
  totalPct: z.number(),
  severity: ScenarioSeverity,
  signalIds: z.array(z.string()),
  scenarioId: z.string().nullable(),
});
export const ImpactRunsResponse = z.object({ runs: z.array(ImpactRunSummary) });
export type ImpactRunsResponse = z.infer<typeof ImpactRunsResponse>;
