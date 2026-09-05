/**
 * Writes a validated dataset into the raw schema inside one transaction. The load is
 * idempotent: raw tables are truncated and repopulated, and a load_runs row records
 * what happened. Snapshot-wide columns are unpivoted here.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import * as s from '../schema/index.js';
import { wideSeries, type Dataset } from './dataset.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const CHUNK = 500;
async function insertChunked(
  tx: Tx,
  table: Parameters<Tx['insert']>[0],
  rows: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(table).values(rows.slice(i, i + CHUNK));
  }
}

export async function loadRaw(db: Db, data: Dataset): Promise<Record<string, number>> {
  const dates = data.snapshots.map((x) => x.date);
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      TRUNCATE TABLE
        raw.rm_notes, raw.event_log, raw.market_context, raw.planned_cash_needs,
        raw.commitments, raw.credit_facility_snapshots, raw.credit_facilities,
        raw.transactions, raw.holdings, raw.instrument_prices, raw.instruments,
        raw.portfolio_aum, raw.portfolios, raw.mandates, raw.clients, raw.snapshots
      RESTART IDENTITY CASCADE
    `);

    await insertChunked(
      tx,
      s.snapshots,
      data.snapshots.map((x) => ({ snapshotDate: x.date, ordinal: x.ordinal, label: x.label })),
    );

    await insertChunked(
      tx,
      s.clients,
      data.clients.map((c) => ({
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
      })),
    );

    await insertChunked(
      tx,
      s.mandates,
      data.mandates.map((m) => ({
        mandateCode: m.mandate_code,
        mandateName: m.mandate_name,
        assetClass: m.asset_class,
        minPct: m.min_pct,
        targetPct: m.target_pct,
        maxPct: m.max_pct,
        maxSinglePositionPct: m.max_single_position_pct,
        mandateNotes: m.mandate_notes,
      })),
    );

    await insertChunked(
      tx,
      s.portfolios,
      data.portfolios.map((p) => ({
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
      })),
    );
    await insertChunked(
      tx,
      s.portfolioAum,
      data.portfolios.flatMap((p) =>
        [...wideSeries(p, 'aum', dates, 'portfolios.csv', p.portfolio_id)].map(([d, v]) => ({
          portfolioId: p.portfolio_id,
          snapshotDate: d,
          aumBase: v,
        })),
      ),
    );

    await insertChunked(
      tx,
      s.instruments,
      data.instruments.map((i) => ({
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
      })),
    );
    await insertChunked(
      tx,
      s.instrumentPrices,
      data.instruments.flatMap((i) =>
        [...wideSeries(i, 'price', dates, 'instruments.csv', i.instrument_id)].map(([d, v]) => ({
          instrumentId: i.instrument_id,
          snapshotDate: d,
          priceLocal: v,
        })),
      ),
    );

    await insertChunked(
      tx,
      s.holdings,
      data.holdings.map((h) => ({
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
      })),
    );

    await insertChunked(
      tx,
      s.transactions,
      data.transactions.map((t) => ({
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
      })),
    );

    await insertChunked(
      tx,
      s.creditFacilities,
      data.creditFacilities.map((f) => ({
        facilityId: f.facility_id,
        clientId: f.client_id,
        collateralPortfolioId: f.collateral_portfolio_id,
        facilityType: f.facility_type,
        facilityCcy: f.facility_ccy,
        creditLimit: f.credit_limit,
        interestRatePct: f.interest_rate_pct,
        marginCallLtvPct: f.margin_call_ltv_pct,
        utilisationPctCurrent: f.utilisation_pct_current,
      })),
    );
    await insertChunked(
      tx,
      s.creditFacilitySnapshots,
      data.creditFacilities.flatMap((f) => {
        const file = 'credit_facilities.csv';
        const drawn = wideSeries(f, 'drawn', dates, file, f.facility_id);
        const cmv = wideSeries(f, 'collateral_market_value', dates, file, f.facility_id);
        const lv = wideSeries(f, 'lending_value', dates, file, f.facility_id);
        const ltv = wideSeries(f, 'ltv_pct', dates, file, f.facility_id);
        const head = wideSeries(f, 'headroom', dates, file, f.facility_id);
        return dates.map((d) => ({
          facilityId: f.facility_id,
          snapshotDate: d,
          drawn: drawn.get(d) ?? 0,
          collateralMarketValue: cmv.get(d) ?? 0,
          lendingValue: lv.get(d) ?? 0,
          ltvPct: ltv.get(d) ?? 0,
          headroom: head.get(d) ?? 0,
        }));
      }),
    );

    await insertChunked(
      tx,
      s.commitments,
      data.commitments.map((c) => ({
        commitmentId: c.commitment_id,
        clientId: c.client_id,
        portfolioId: c.portfolio_id,
        fundName: c.fund_name,
        currency: c.currency,
        committed: c.committed,
        calledToDate: c.called_to_date,
        uncalled: c.uncalled,
        expectedCallWindow: c.expected_call_window,
      })),
    );

    await insertChunked(
      tx,
      s.plannedCashNeeds,
      data.plannedCashNeeds.map((n) => ({
        needId: n.need_id,
        clientId: n.client_id,
        description: n.description,
        currency: n.currency,
        amount: n.amount,
        dueFrom: n.due_from,
        dueTo: n.due_to,
        recurrence: n.recurrence,
        certainty: n.certainty,
      })),
    );

    await insertChunked(
      tx,
      s.marketContext,
      data.marketContext.map((m) => ({
        snapshotDate: m.snapshot_date,
        seriesId: m.series_id,
        seriesName: m.series_name,
        category: m.category,
        unit: m.unit,
        value: m.value,
        snapshotLabel: m.snapshot_label ?? '',
      })),
    );

    await insertChunked(
      tx,
      s.eventLog,
      data.eventLog.map((e, i) => ({
        eventId: `EV-${String(i + 1).padStart(3, '0')}`,
        eventDate: e.event_date,
        eventType: e.event_type,
        region: e.region,
        description: e.description,
        primaryTransmission: e.primary_transmission,
        severity: e.severity,
        ordinal: i,
      })),
    );

    await insertChunked(
      tx,
      s.rmNotes,
      data.rmNotes.map((n) => ({
        noteId: n.note_id,
        clientId: n.client_id,
        noteDate: n.note_date,
        rmId: n.rm_id,
        rmName: n.rm_name,
        channel: n.channel,
        note: n.note,
      })),
    );

    return {
      clients: data.clients.length,
      portfolios: data.portfolios.length,
      portfolio_aum: data.portfolios.length * dates.length,
      instruments: data.instruments.length,
      instrument_prices: data.instruments.length * dates.length,
      holdings: data.holdings.length,
      mandates: data.mandates.length,
      transactions: data.transactions.length,
      credit_facilities: data.creditFacilities.length,
      credit_facility_snapshots: data.creditFacilities.length * dates.length,
      commitments: data.commitments.length,
      planned_cash_needs: data.plannedCashNeeds.length,
      market_context: data.marketContext.length,
      event_log: data.eventLog.length,
      rm_notes: data.rmNotes.length,
    };
  });
}
