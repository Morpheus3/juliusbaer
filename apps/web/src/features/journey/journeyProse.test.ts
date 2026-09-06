import { describe, expect, it } from 'vitest';
import type { Scenario } from '@jb/contracts';
import { pickScenario, shockMagnitude } from './journeyProse';

const shock = (over: Partial<Scenario['shock']>): Scenario['shock'] => ({
  rates_bps: {},
  credit_spread_bps: {},
  equity_pct: {},
  sector_overlay_pct: {},
  fx_pct_vs_usd: {},
  gold_pct: 0,
  brent_pct: 0,
  vix_points: 0,
  ...over,
});
const sc = (id: string, s: Partial<Scenario['shock']>): Scenario => ({
  id,
  name: id,
  description: '',
  shock: shock(s),
  horizonDays: 30,
  probabilityNote: '',
});

describe('shockMagnitude', () => {
  it('reads the factor that matters for the asset class', () => {
    const s = shock({ equity_pct: { global: -8 }, rates_bps: { USD: 25 }, gold_pct: 8 });
    expect(shockMagnitude(s, 'Equity')).toBe(8);
    expect(shockMagnitude(s, 'Fixed Income')).toBe(2.5);
    expect(shockMagnitude(s, 'Commodities')).toBe(8);
  });
});

describe('pickScenario', () => {
  const equitySell = sc('equity-sell', { equity_pct: { global: -8 } });
  const rateHike = sc('rate-hike', { rates_bps: { USD: 50 } });
  const equityRally = sc('equity-rally', { equity_pct: { global: 9 } });

  it('picks the scenario that moves the dominant class, preferring the adverse one', () => {
    const r = pickScenario(
      [{ assetClass: 'Equity', weightPct: 70 }],
      [equitySell, rateHike, equityRally],
    );
    expect(r?.scenario.id).toBe('equity-sell');
    expect(r?.reason).toContain('Equity is 70%');
  });
  it('follows the allocation, not the scenario order', () => {
    const r = pickScenario(
      [
        { assetClass: 'Fixed Income', weightPct: 80 },
        { assetClass: 'Equity', weightPct: 20 },
      ],
      [equitySell, rateHike],
    );
    expect(r?.scenario.id).toBe('rate-hike');
  });
  it('returns null without scenarios', () => {
    expect(pickScenario([{ assetClass: 'Equity', weightPct: 100 }], [])).toBeNull();
  });
});
