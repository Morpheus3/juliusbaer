/**
 * Row schemas for the twelve source files in data/. These validate the CSV/JSON
 * exactly as supplied; wide snapshot columns are unpivoted by the loader, not here.
 */
import { z } from 'zod';
import {
  AssetClassSchema,
  IsoDate,
  LiquidityTierSchema,
  NumCell,
  OptionalNumCell,
  OptionalStrCell,
  SNAPSHOT_DATES,
  ServiceModelSchema,
  SeveritySchema,
  YesNoCell,
} from './common.js';

const snapshotColumns = <P extends string>(prefix: P) =>
  Object.fromEntries(SNAPSHOT_DATES.map((d) => [`${prefix}_${d}`, NumCell])) as Record<
    `${P}_${(typeof SNAPSHOT_DATES)[number]}`,
    typeof NumCell
  >;

export const ClientRow = z.object({
  client_id: z.string().regex(/^CL-\d{4}$/),
  client_name: z.string().min(1),
  age: OptionalNumCell,
  gender: z.enum(['M', 'F', 'Entity']),
  nationality: z.string(),
  country_of_residence: z.string(),
  tax_domicile: z.string(),
  booking_centre: z.enum(['Singapore', 'Hong Kong']),
  rm_id: z.string(),
  rm_name: z.string(),
  rm_desk: z.string(),
  base_currency: z.string().length(3),
  wealth_band: z.enum(['HNW', 'UHNW']),
  total_aum_usd: NumCell,
  life_stage: z.string(),
  source_of_wealth: z.string(),
  risk_profile: z.string(),
  risk_tolerance_score: NumCell,
  investment_horizon_years: NumCell,
  liquidity_needs: z.enum(['Low', 'Medium', 'High']),
  objectives: z.string(),
  client_since: IsoDate,
  kyc_review_due: IsoDate,
  pep_status: z.enum(['Yes', 'No']).transform((v) => v === 'Yes'),
  reporting_language: z.string(),
});
export type ClientRow = z.infer<typeof ClientRow>;

export const PortfolioRow = z.object({
  portfolio_id: z.string().regex(/^PF-\d{4}$/),
  client_id: z.string(),
  portfolio_name: z.string(),
  mandate_code: z.string(),
  mandate_name: z.string(),
  service_model: ServiceModelSchema,
  base_currency: z.string().length(3),
  inception_date: IsoDate,
  benchmark: z.string(),
  aum_usd_current: NumCell,
  ...snapshotColumns('aum'),
});
export type PortfolioRow = z.infer<typeof PortfolioRow>;

export const HoldingRow = z.object({
  snapshot_date: z.enum(SNAPSHOT_DATES),
  portfolio_id: z.string(),
  client_id: z.string(),
  instrument_id: z.string(),
  instrument_name: z.string(),
  asset_class: AssetClassSchema,
  sub_asset_class: z.string(),
  sector: OptionalStrCell,
  region: z.string(),
  instrument_ccy: z.string().length(3),
  quantity: NumCell,
  price_local: NumCell,
  market_value_local: NumCell,
  portfolio_ccy: z.string().length(3),
  market_value_base: NumCell,
  market_value_usd: NumCell,
  weight_pct: NumCell,
  avg_cost_local: OptionalNumCell,
  cost_basis_base: OptionalNumCell,
  unrealised_pnl_base: OptionalNumCell,
  unrealised_pnl_pct: OptionalNumCell,
  lending_value_base: NumCell,
  advance_rate_pct: NumCell,
  liquidity_tier: LiquidityTierSchema,
  valuation_date: IsoDate,
  acquired_date: IsoDate,
});
export type HoldingRow = z.infer<typeof HoldingRow>;

export const InstrumentRow = z.object({
  instrument_id: z.string(),
  instrument_name: z.string(),
  asset_class: AssetClassSchema,
  sub_asset_class: z.string(),
  sector: OptionalStrCell,
  region: z.string(),
  currency: z.string().length(3),
  liquidity_tier: LiquidityTierSchema,
  underlying_reference: OptionalStrCell,
  sustainability_excluded: YesNoCell,
  concentration_limit_applies: YesNoCell,
  ...snapshotColumns('price'),
});
export type InstrumentRow = z.infer<typeof InstrumentRow>;

export const MandateRow = z.object({
  mandate_code: z.string(),
  mandate_name: z.string(),
  asset_class: AssetClassSchema,
  min_pct: NumCell,
  target_pct: NumCell,
  max_pct: NumCell,
  max_single_position_pct: NumCell,
  mandate_notes: z.string(),
});
export type MandateRow = z.infer<typeof MandateRow>;

export const TransactionRow = z.object({
  transaction_id: z.string(),
  trade_date: IsoDate,
  settlement_date: IsoDate,
  portfolio_id: z.string(),
  client_id: z.string(),
  transaction_type: z.string(),
  instrument_id: OptionalStrCell,
  instrument_name: OptionalStrCell,
  quantity: OptionalNumCell,
  price_local: OptionalNumCell,
  currency: z.string().length(3),
  amount: NumCell,
  narrative: z.string(),
});
export type TransactionRow = z.infer<typeof TransactionRow>;

export const CreditFacilityRow = z.object({
  facility_id: z.string(),
  client_id: z.string(),
  collateral_portfolio_id: z.string(),
  facility_type: z.string(),
  facility_ccy: z.string().length(3),
  credit_limit: NumCell,
  interest_rate_pct: NumCell,
  margin_call_ltv_pct: NumCell,
  utilisation_pct_current: NumCell,
  ...snapshotColumns('drawn'),
  ...snapshotColumns('collateral_market_value'),
  ...snapshotColumns('lending_value'),
  ...snapshotColumns('ltv_pct'),
  ...snapshotColumns('headroom'),
});
export type CreditFacilityRow = z.infer<typeof CreditFacilityRow>;

export const CommitmentRow = z.object({
  commitment_id: z.string(),
  client_id: z.string(),
  portfolio_id: z.string(),
  fund_name: z.string(),
  currency: z.string().length(3),
  committed: NumCell,
  called_to_date: NumCell,
  uncalled: NumCell,
  expected_call_window: z.string(),
});
export type CommitmentRow = z.infer<typeof CommitmentRow>;

export const PlannedCashNeedRow = z.object({
  need_id: z.string(),
  client_id: z.string(),
  description: z.string(),
  currency: z.string().length(3),
  amount: NumCell,
  due_from: IsoDate,
  due_to: IsoDate,
  recurrence: z.string(),
  certainty: z.string(),
});
export type PlannedCashNeedRow = z.infer<typeof PlannedCashNeedRow>;

export const MarketContextRow = z.object({
  snapshot_date: z.enum(SNAPSHOT_DATES),
  series_id: z.string(),
  series_name: z.string(),
  category: z.string(),
  unit: z.string(),
  value: NumCell,
  snapshot_label: z.string(),
});
export type MarketContextRow = z.infer<typeof MarketContextRow>;

export const EventLogRow = z.object({
  event_date: IsoDate,
  event_type: z.enum(['Market', 'Geopolitical', 'Policy']),
  region: z.string(),
  description: z.string(),
  primary_transmission: z.string(),
  severity: SeveritySchema,
});
export type EventLogRow = z.infer<typeof EventLogRow>;

export const RmNoteRow = z.object({
  note_id: z.string(),
  client_id: z.string(),
  note_date: IsoDate,
  rm_id: z.string(),
  rm_name: z.string(),
  channel: z.string(),
  note: z.string(),
});
export type RmNoteRow = z.infer<typeof RmNoteRow>;
