import { describe, expect, it } from 'vitest';
import type { ClientBundle, HoldingRecord } from '../repositories/clientDetailRepository.js';
import { changeAttribution } from './attribution.js';
import { needWithin12m } from './cashflows.js';

const holding = (over: Partial<HoldingRecord>): HoldingRecord => ({
  holdingId: 1,
  snapshotDate: '2025-12-31',
  portfolioId: 'PF-0001',
  clientId: 'CL-0001',
  instrumentId: 'X',
  instrumentName: 'X',
  assetClass: 'Equity',
  subAssetClass: 'Single Stock',
  sector: 'Energy',
  region: 'Global',
  instrumentCcy: 'EUR',
  quantity: 100,
  priceLocal: 10,
  marketValueLocal: 1000,
  portfolioCcy: 'USD',
  marketValueBase: 1160,
  marketValueUsd: 1160,
  weightPct: 100,
  avgCostLocal: null,
  costBasisBase: null,
  unrealisedPnlBase: null,
  unrealisedPnlPct: null,
  lendingValueBase: 0,
  advanceRatePct: 0,
  liquidityTier: 'Daily',
  valuationDate: '2025-12-31',
  acquiredDate: '2020-01-01',
  ...over,
});

const bundle = (holdings: HoldingRecord[]): ClientBundle =>
  ({
    holdings,
    fx: new Map([
      ['2025-12-31|EURUSD', 1.16],
      ['2026-08-26|EURUSD', 1.092],
    ]),
  }) as unknown as ClientBundle;

describe('changeAttribution', () => {
  it('splits a change into price, FX and flow that sum to the total', () => {
    // 100 @ €10 (1.16) = $1,160 → 120 @ €12 (1.092) = $1,572.48
    const b = bundle([
      holding({}),
      holding({
        snapshotDate: '2026-08-26',
        quantity: 120,
        priceLocal: 12,
        marketValueLocal: 1440,
        marketValueUsd: 1572.48,
        marketValueBase: 1572.48,
      }),
    ]);
    const r = changeAttribution(b, '2025-12-31', '2026-08-26');
    expect(r.startUsd).toBe(1160);
    expect(r.endUsd).toBe(1572.48);
    // flow = 20 × 12 × 1.092 = 262.08 ; fx = 100 × 12 × (1.092 − 1.16) = −81.6 ; price = 100 × 2 × 1.16 = 232
    expect(r.flowEffectUsd).toBeCloseTo(262.08, 2);
    expect(r.fxEffectUsd).toBeCloseTo(-81.6, 2);
    expect(r.priceEffectUsd).toBeCloseTo(232, 2);
    expect(r.priceEffectUsd + r.fxEffectUsd + r.flowEffectUsd).toBeCloseTo(
      r.endUsd - r.startUsd,
      2,
    );
  });

  it('treats a new position as pure flow and a closed one as negative flow', () => {
    const b = bundle([
      holding({ instrumentId: 'OLD', instrumentName: 'Old' }),
      holding({
        snapshotDate: '2026-08-26',
        instrumentId: 'NEW',
        instrumentName: 'New',
        quantity: 50,
        priceLocal: 20,
        marketValueUsd: 1092,
        marketValueBase: 1092,
      }),
    ]);
    const r = changeAttribution(b, '2025-12-31', '2026-08-26');
    const byId = new Map(r.movers.map((m) => [m.instrumentId, m]));
    expect(byId.get('NEW')?.flowEffectUsd).toBeCloseTo(1092, 2);
    expect(byId.get('NEW')?.priceEffectUsd).toBe(0);
    expect(byId.get('OLD')?.flowEffectUsd).toBeCloseTo(-1160 * (1.092 / 1.16), 1);
    expect(byId.get('OLD')?.endUsd).toBe(0);
  });
});

describe('needWithin12m', () => {
  const today = '2026-08-26';
  it('counts annual and one-off needs that start inside the window', () => {
    expect(
      needWithin12m(
        {
          amount: 1,
          recurrence: 'Annual',
          dueFrom: '2026-09-01',
          dueTo: '2031-09-01',
          certainty: 'Confirmed',
        },
        100,
        today,
      ),
    ).toBe(100);
    expect(
      needWithin12m(
        {
          amount: 1,
          recurrence: 'One-off',
          dueFrom: '2027-03-01',
          dueTo: '2027-06-30',
          certainty: 'Likely',
        },
        100,
        today,
      ),
    ).toBe(100);
  });
  it('ignores aspirational needs and those beyond 12 months', () => {
    expect(
      needWithin12m(
        {
          amount: 1,
          recurrence: 'One-off',
          dueFrom: '2028-01-01',
          dueTo: '2028-12-31',
          certainty: 'Aspirational',
        },
        100,
        today,
      ),
    ).toBe(0);
    expect(
      needWithin12m(
        {
          amount: 1,
          recurrence: 'One-off',
          dueFrom: '2027-10-01',
          dueTo: '2027-12-31',
          certainty: 'Confirmed',
        },
        100,
        today,
      ),
    ).toBe(0);
  });
  it('pro-rates irregular needs over their window', () => {
    // Window Oct 2026 → Mar 2028 (≈547 days); 12-month horizon covers ≈365 days of it.
    const v = needWithin12m(
      {
        amount: 1,
        recurrence: 'Irregular',
        dueFrom: '2026-10-01',
        dueTo: '2028-03-31',
        certainty: 'Likely',
      },
      1000,
      today,
    );
    expect(v).toBeGreaterThan(550);
    expect(v).toBeLessThan(620);
  });
});
