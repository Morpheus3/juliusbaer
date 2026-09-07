/**
 * Writes a validated dataset into the raw schema inside one transaction. The load is
 * idempotent: raw tables are truncated and repopulated, the incremental landing zone and change log
 * are cleared (messages applied before a full load no longer describe the data), and a load_runs row records
 * what happened. Snapshot-wide columns are unpivoted here.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import * as s from '../schema/index.js';
import { wideSeries, type Dataset } from './dataset.js';
import {
  mapCashNeed,
  mapClient,
  mapCommitment,
  mapEvent,
  mapFacility,
  mapHolding,
  mapInstrument,
  mapMandate,
  mapMarketContext,
  mapNote,
  mapPortfolio,
  mapTransaction,
} from './mappers.js';

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
        raw.portfolio_aum, raw.portfolios, raw.mandates, raw.clients, raw.snapshots,
        ingest.staging_messages, ingest.change_log
      RESTART IDENTITY CASCADE
    `);

    await insertChunked(
      tx,
      s.snapshots,
      data.snapshots.map((x) => ({ snapshotDate: x.date, ordinal: x.ordinal, label: x.label })),
    );

    await insertChunked(tx, s.clients, data.clients.map(mapClient));

    await insertChunked(tx, s.mandates, data.mandates.map(mapMandate));

    await insertChunked(tx, s.portfolios, data.portfolios.map(mapPortfolio));
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

    await insertChunked(tx, s.instruments, data.instruments.map(mapInstrument));
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

    await insertChunked(tx, s.holdings, data.holdings.map(mapHolding));

    await insertChunked(tx, s.transactions, data.transactions.map(mapTransaction));

    await insertChunked(tx, s.creditFacilities, data.creditFacilities.map(mapFacility));
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

    await insertChunked(tx, s.commitments, data.commitments.map(mapCommitment));

    await insertChunked(tx, s.plannedCashNeeds, data.plannedCashNeeds.map(mapCashNeed));

    await insertChunked(tx, s.marketContext, data.marketContext.map(mapMarketContext));

    await insertChunked(
      tx,
      s.eventLog,
      data.eventLog.map((e, i) => mapEvent(e, i)),
    );

    await insertChunked(tx, s.rmNotes, data.rmNotes.map(mapNote));

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
