/**
 * Row mappers: dataset rows (snake_case CSV contracts) to Drizzle insert shapes (camelCase). Shared by
 * the full loader and the incremental apply so a column is mapped in exactly one place.
 */
import type {
  ClientRow,
  CommitmentRow,
  CreditFacilityRow,
  EventLogRow,
  HoldingRow,
  InstrumentRow,
  MandateRow,
  MarketContextRow,
  PlannedCashNeedRow,
  PortfolioRow,
  RmNoteRow,
  TransactionRow,
} from '@jb/contracts';
import type * as s from '../schema/index.js';

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export const mapClient = (c: ClientRow): Insert<typeof s.clients> => ({
  clientId: c.client_id,
  clientName: c.client_name,
  age: c.age,
  gender: c.gender,
  nationality: c.nationality,
  countryOfResidence: c.country_of_residence,
  taxDomicile: c.tax_domicile,
  bookingCentre: c.booking_centre,
  rmId: c.rm_id,
  rmName: c.rm_name,
  rmDesk: c.rm_desk,
  baseCurrency: c.base_currency,
  wealthBand: c.wealth_band,
  totalAumUsd: c.total_aum_usd,
  lifeStage: c.life_stage,
  sourceOfWealth: c.source_of_wealth,
  riskProfile: c.risk_profile,
  riskToleranceScore: c.risk_tolerance_score,
  investmentHorizonYears: c.investment_horizon_years,
  liquidityNeeds: c.liquidity_needs,
  objectives: c.objectives,
  clientSince: c.client_since,
  kycReviewDue: c.kyc_review_due,
  pepStatus: c.pep_status,
  reportingLanguage: c.reporting_language,
});

export const mapMandate = (m: MandateRow): Insert<typeof s.mandates> => ({
  mandateCode: m.mandate_code,
  mandateName: m.mandate_name,
  assetClass: m.asset_class,
  minPct: m.min_pct,
  targetPct: m.target_pct,
  maxPct: m.max_pct,
  maxSinglePositionPct: m.max_single_position_pct,
  mandateNotes: m.mandate_notes,
});

export const mapPortfolio = (p: PortfolioRow): Insert<typeof s.portfolios> => ({
  portfolioId: p.portfolio_id,
  clientId: p.client_id,
  portfolioName: p.portfolio_name,
  mandateCode: p.mandate_code,
  mandateName: p.mandate_name,
  serviceModel: p.service_model,
  baseCurrency: p.base_currency,
  inceptionDate: p.inception_date,
  benchmark: p.benchmark,
  aumUsdCurrent: p.aum_usd_current,
});

export const mapInstrument = (i: InstrumentRow): Insert<typeof s.instruments> => ({
  instrumentId: i.instrument_id,
  instrumentName: i.instrument_name,
  assetClass: i.asset_class,
  subAssetClass: i.sub_asset_class,
  sector: i.sector,
  region: i.region,
  currency: i.currency,
  liquidityTier: i.liquidity_tier,
  underlyingReference: i.underlying_reference,
  sustainabilityExcluded: i.sustainability_excluded,
  concentrationLimitApplies: i.concentration_limit_applies,
});

export const mapHolding = (h: HoldingRow): Insert<typeof s.holdings> => ({
  snapshotDate: h.snapshot_date,
  portfolioId: h.portfolio_id,
  clientId: h.client_id,
  instrumentId: h.instrument_id,
  instrumentName: h.instrument_name,
  assetClass: h.asset_class,
  subAssetClass: h.sub_asset_class,
  sector: h.sector,
  region: h.region,
  instrumentCcy: h.instrument_ccy,
  quantity: h.quantity,
  priceLocal: h.price_local,
  marketValueLocal: h.market_value_local,
  portfolioCcy: h.portfolio_ccy,
  marketValueBase: h.market_value_base,
  marketValueUsd: h.market_value_usd,
  weightPct: h.weight_pct,
  avgCostLocal: h.avg_cost_local,
  costBasisBase: h.cost_basis_base,
  unrealisedPnlBase: h.unrealised_pnl_base,
  unrealisedPnlPct: h.unrealised_pnl_pct,
  lendingValueBase: h.lending_value_base,
  advanceRatePct: h.advance_rate_pct,
  liquidityTier: h.liquidity_tier,
  valuationDate: h.valuation_date,
  acquiredDate: h.acquired_date,
});

export const mapTransaction = (t: TransactionRow): Insert<typeof s.transactions> => ({
  transactionId: t.transaction_id,
  tradeDate: t.trade_date,
  settlementDate: t.settlement_date,
  portfolioId: t.portfolio_id,
  clientId: t.client_id,
  transactionType: t.transaction_type,
  instrumentId: t.instrument_id,
  instrumentName: t.instrument_name,
  quantity: t.quantity,
  priceLocal: t.price_local,
  currency: t.currency,
  amount: t.amount,
  narrative: t.narrative,
});

export const mapFacility = (f: CreditFacilityRow): Insert<typeof s.creditFacilities> => ({
  facilityId: f.facility_id,
  clientId: f.client_id,
  collateralPortfolioId: f.collateral_portfolio_id,
  facilityType: f.facility_type,
  facilityCcy: f.facility_ccy,
  creditLimit: f.credit_limit,
  interestRatePct: f.interest_rate_pct,
  marginCallLtvPct: f.margin_call_ltv_pct,
  utilisationPctCurrent: f.utilisation_pct_current,
});

export const mapCommitment = (c: CommitmentRow): Insert<typeof s.commitments> => ({
  commitmentId: c.commitment_id,
  clientId: c.client_id,
  portfolioId: c.portfolio_id,
  fundName: c.fund_name,
  currency: c.currency,
  committed: c.committed,
  calledToDate: c.called_to_date,
  uncalled: c.uncalled,
  expectedCallWindow: c.expected_call_window,
});

export const mapCashNeed = (n: PlannedCashNeedRow): Insert<typeof s.plannedCashNeeds> => ({
  needId: n.need_id,
  clientId: n.client_id,
  description: n.description,
  currency: n.currency,
  amount: n.amount,
  dueFrom: n.due_from,
  dueTo: n.due_to,
  recurrence: n.recurrence,
  certainty: n.certainty,
});

export const mapMarketContext = (m: MarketContextRow): Insert<typeof s.marketContext> => ({
  snapshotDate: m.snapshot_date,
  seriesId: m.series_id,
  seriesName: m.series_name,
  category: m.category,
  unit: m.unit,
  value: m.value,
  snapshotLabel: m.snapshot_label ?? '',
});

export const eventIdFor = (ordinal: number): string => `EV-${String(ordinal + 1).padStart(3, '0')}`;

export const mapEvent = (
  e: EventLogRow,
  ordinal: number,
  eventId = eventIdFor(ordinal),
): Insert<typeof s.eventLog> => ({
  eventId,
  eventDate: e.event_date,
  eventType: e.event_type,
  region: e.region,
  description: e.description,
  primaryTransmission: e.primary_transmission,
  severity: e.severity,
  ordinal,
});

export const mapNote = (n: RmNoteRow): Insert<typeof s.rmNotes> => ({
  noteId: n.note_id,
  clientId: n.client_id,
  noteDate: n.note_date,
  rmId: n.rm_id,
  rmName: n.rm_name,
  channel: n.channel,
  note: n.note,
});
