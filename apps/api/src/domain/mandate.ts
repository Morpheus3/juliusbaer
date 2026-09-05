import {
  AssetClassSchema,
  type AllocationSlice,
  type MandateStatusResponse,
  type SnapshotDate,
} from '@jb/contracts';
import type { ClientBundle } from '../repositories/clientDetailRepository.js';
import { round2, round4 } from './dates.js';
import { holdingsAt, householdTotalUsd, singlePositionLimit } from './holdingsView.js';

const ASSET_CLASSES = AssetClassSchema.options;

/** Household allocation by asset class; the band shown is the largest managed portfolio's mandate. */
export function householdAllocation(
  bundle: ClientBundle,
  snapshotDate: SnapshotDate,
): AllocationSlice[] {
  const rows = holdingsAt(bundle, snapshotDate);
  const total = householdTotalUsd(rows);
  const primary = [...bundle.portfolios]
    .filter((p) => p.serviceModel !== 'Custody')
    .sort((a, b) => b.aumUsdCurrent - a.aumUsdCurrent)[0];
  return ASSET_CLASSES.map((ac) => {
    const value = rows.filter((h) => h.assetClass === ac).reduce((s, h) => s + h.marketValueUsd, 0);
    const band = primary
      ? bundle.mandates.find((m) => m.mandateCode === primary.mandateCode && m.assetClass === ac)
      : undefined;
    return {
      assetClass: ac,
      valueUsd: round2(value),
      weightPct: total ? round4((value / total) * 100) : 0,
      band: band ? { minPct: band.minPct, targetPct: band.targetPct, maxPct: band.maxPct } : null,
    };
  });
}

export function mandateStatus(
  bundle: ClientBundle,
  snapshotDate: SnapshotDate,
): MandateStatusResponse {
  const rows = holdingsAt(bundle, snapshotDate);
  return {
    snapshotDate,
    portfolios: bundle.portfolios.map((p) => {
      const hp = rows.filter((h) => h.portfolioId === p.portfolioId);
      const managed = p.serviceModel !== 'Custody';
      const bands = bundle.mandates.filter((m) => m.mandateCode === p.mandateCode);
      const limit = singlePositionLimit(bundle.mandates, p.mandateCode);
      const isSustainable = bands.some((b) => /exclusion/i.test(b.mandateNotes));
      return {
        portfolioId: p.portfolioId,
        name: p.portfolioName,
        mandateCode: p.mandateCode,
        mandateName: p.mandateName,
        serviceModel: p.serviceModel,
        managed,
        maxSinglePositionPct: managed ? limit : null,
        rows: bands.map((b) => {
          const w = hp
            .filter((h) => h.assetClass === b.assetClass)
            .reduce((s, h) => s + h.weightPct, 0);
          const status = w < b.minPct ? 'below' : w > b.maxPct ? 'above' : 'within';
          const deviation =
            status === 'below' ? w - b.minPct : status === 'above' ? w - b.maxPct : 0;
          return {
            assetClass: AssetClassSchema.parse(b.assetClass),
            weightPct: round4(w),
            minPct: b.minPct,
            targetPct: b.targetPct,
            maxPct: b.maxPct,
            status,
            deviationPts: round2(deviation),
          };
        }),
        singleLineBreaches:
          managed && limit !== null
            ? hp
                .filter(
                  (h) =>
                    (bundle.instruments.get(h.instrumentId)?.concentrationLimitApplies ?? false) &&
                    h.weightPct > limit,
                )
                .map((h) => ({
                  instrumentId: h.instrumentId,
                  name: h.instrumentName,
                  weightPct: round4(h.weightPct),
                }))
            : [],
        exclusionBreaches: isSustainable
          ? hp
              .filter(
                (h) => bundle.instruments.get(h.instrumentId)?.sustainabilityExcluded ?? false,
              )
              .map((h) => ({
                instrumentId: h.instrumentId,
                name: h.instrumentName,
                weightPct: round4(h.weightPct),
              }))
          : [],
      };
    }),
  };
}
