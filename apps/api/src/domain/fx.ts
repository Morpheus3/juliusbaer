/**
 * FX conversion from market_context. Pairs follow market convention: USDXXX is XXX per USD;
 * EURUSD and GBPUSD are USD per unit. Mirrors services/analytics/app/features/fx.py.
 */
const USD_PER_UNIT: Record<string, string> = { EUR: 'EURUSD', GBP: 'GBPUSD' };

export class Fx {
  constructor(private readonly rates: ReadonlyMap<string, number>) {}

  usdPerUnit(ccy: string, snapshotDate: string): number {
    if (ccy === 'USD') {
      return 1;
    }
    const direct = USD_PER_UNIT[ccy];
    if (direct !== undefined) {
      const r = this.rates.get(`${snapshotDate}|${direct}`);
      if (r === undefined) {
        throw new Error(`no FX rate ${direct} at ${snapshotDate}`);
      }
      return r;
    }
    const r = this.rates.get(`${snapshotDate}|USD${ccy}`);
    if (r === undefined) {
      throw new Error(`no FX rate USD${ccy} at ${snapshotDate}`);
    }
    return 1 / r;
  }

  toUsd(amount: number, ccy: string, snapshotDate: string): number {
    return amount * this.usdPerUnit(ccy, snapshotDate);
  }
}
