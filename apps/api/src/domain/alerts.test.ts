import { describe, expect, it } from 'vitest';
import type { ExposureResponse, MandateStatusResponse } from '@jb/contracts';
import type { cashflows } from './cashflows.js';
import { deriveAlerts } from './alerts.js';
import type { ClientBundle, HoldingRecord } from '../repositories/clientDetailRepository.js';

const holding = (over: Partial<HoldingRecord>): HoldingRecord => ({
  holdingId: 1,
  snapshotDate: '2026-06-30',
  portfolioId: 'P1',
  clientId: 'C1',
  instrumentId: 'I1',
  instrumentName: 'Unlisted Holding',
  assetClass: 'Alternatives',
  subAssetClass: 'Private Equity',
  sector: null,
  region: 'Global',
  instrumentCcy: 'USD',
  quantity: 1,
  priceLocal: 1_000_000,
  marketValueLocal: 1_000_000,
  portfolioCcy: 'USD',
  marketValueBase: 1_000_000,
  marketValueUsd: 1_000_000,
  weightPct: 10,
  avgCostLocal: null,
  costBasisBase: null,
  unrealisedPnlBase: null,
  unrealisedPnlPct: null,
  lendingValueBase: 0,
  advanceRatePct: 0,
  liquidityTier: 'Illiquid',
  valuationDate: '2025-09-30',
  acquiredDate: '2020-01-01',
  ...over,
});

const bundle = {
  client: { kycReviewDue: '2027-01-01', clientName: 'C' },
  holdings: [holding({})],
  notes: [],
  facilities: [],
} as unknown as ClientBundle;
const mandate: MandateStatusResponse = { snapshotDate: '2026-06-30', portfolios: [] };
const exposure = { names: [] } as unknown as ExposureResponse;
const cf = {
  facilities: [],
  needs: [],
  coverage12m: { ratio: null, needsUsd: 0, dailyLiquidUsd: 0 },
} as unknown as ReturnType<typeof cashflows>;

describe('deriveAlerts stale valuation', () => {
  it('fires for the positions snapshot even when the clock is between snapshots', () => {
    const alerts = deriveAlerts(bundle, mandate, exposure, cf, {
      clock: '2026-07-15',
      snapshot: '2026-06-30',
    });
    const stale = alerts.filter((a) => a.kind === 'STALE_VALUATION');
    expect(stale).toHaveLength(1);
    expect(stale[0]?.detail).toContain('273 days old');
  });
  it('does not fire for holdings of another snapshot', () => {
    const alerts = deriveAlerts(bundle, mandate, exposure, cf, {
      clock: '2026-08-26',
      snapshot: '2026-08-26',
    });
    expect(alerts.filter((a) => a.kind === 'STALE_VALUATION')).toHaveLength(0);
  });
});
