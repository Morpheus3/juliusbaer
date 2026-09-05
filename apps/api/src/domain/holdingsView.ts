import { AssetClassSchema, type HoldingRowView, type SnapshotDate } from '@jb/contracts';
import type {
  ClientBundle,
  HoldingRecord,
  MandateRecord,
} from '../repositories/clientDetailRepository.js';
import { round2, round4 } from './dates.js';

export function singlePositionLimit(
  mandates: readonly MandateRecord[],
  mandateCode: string,
): number | null {
  const m = mandates.find((x) => x.mandateCode === mandateCode);
  return m ? m.maxSinglePositionPct : null;
}

export function holdingsAt(bundle: ClientBundle, snapshotDate: SnapshotDate): HoldingRecord[] {
  return bundle.holdings.filter((h) => h.snapshotDate === snapshotDate);
}

export function householdTotalUsd(rows: readonly HoldingRecord[]): number {
  return rows.reduce((s, h) => s + h.marketValueUsd, 0);
}

/** Rows for the holdings table with concentration, exclusion and staleness flags attached. */
export function buildHoldingRows(
  bundle: ClientBundle,
  snapshotDate: SnapshotDate,
): HoldingRowView[] {
  const rows = holdingsAt(bundle, snapshotDate);
  const total = householdTotalUsd(rows);
  const managed = new Map(
    bundle.portfolios.map((p) => [p.portfolioId, p.serviceModel !== 'Custody']),
  );
  const mandateOf = new Map(bundle.portfolios.map((p) => [p.portfolioId, p.mandateCode]));

  return rows
    .map((h): HoldingRowView => {
      const inst = bundle.instruments.get(h.instrumentId);
      const isManaged = managed.get(h.portfolioId) ?? false;
      const limit = isManaged
        ? singlePositionLimit(bundle.mandates, mandateOf.get(h.portfolioId) ?? '')
        : null;
      const applies = (inst?.concentrationLimitApplies ?? false) && isManaged;
      return {
        portfolioId: h.portfolioId,
        instrumentId: h.instrumentId,
        name: h.instrumentName,
        assetClass: AssetClassSchema.parse(h.assetClass),
        subAssetClass: h.subAssetClass,
        sector: h.sector,
        region: h.region,
        currency: h.instrumentCcy,
        quantity: h.quantity,
        priceLocal: h.priceLocal,
        marketValueUsd: round2(h.marketValueUsd),
        marketValueBase: round2(h.marketValueBase),
        weightPct: round4(h.weightPct),
        householdWeightPct: total ? round4((h.marketValueUsd / total) * 100) : 0,
        costBasisBase: h.costBasisBase,
        unrealisedPnlBase: h.unrealisedPnlBase,
        unrealisedPnlPct: h.unrealisedPnlPct,
        liquidityTier: h.liquidityTier,
        valuationDate: h.valuationDate,
        acquiredDate: h.acquiredDate,
        concentration: {
          applies,
          limitPct: limit,
          breached: applies && limit !== null && h.weightPct > limit,
        },
        sustainabilityExcluded: inst?.sustainabilityExcluded ?? false,
        stale: h.valuationDate !== h.snapshotDate,
      };
    })
    .sort((a, b) => b.marketValueUsd - a.marketValueUsd);
}
