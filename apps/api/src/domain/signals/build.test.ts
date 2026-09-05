import { describe, expect, it } from 'vitest';
import { instrumentMatches, snapshotForClock } from './build.js';

const inst = {
  instrumentId: 'SYN-ST-0103',
  instrumentName: 'Helios Cloud Systems Inc',
  assetClass: 'Equity',
  subAssetClass: 'Single Stock',
  sector: 'Information Technology',
  region: 'North America',
  currency: 'USD',
  liquidityTier: 'Daily',
  underlyingReference: null,
  sustainabilityExcluded: false,
  concentrationLimitApplies: true,
};

const SNAPS = ['2025-12-31', '2026-02-27', '2026-03-31', '2026-06-30', '2026-08-26'];

describe('snapshotForClock', () => {
  it('picks the latest snapshot on or before the clock', () => {
    expect(snapshotForClock(SNAPS, '2026-03-15')).toBe('2026-02-27');
    expect(snapshotForClock(SNAPS, '2026-03-31')).toBe('2026-03-31');
    expect(snapshotForClock(SNAPS, '2025-01-01')).toBe('2025-12-31');
    expect(snapshotForClock(SNAPS, '2026-08-26')).toBe('2026-08-26');
  });
});

describe('instrumentMatches', () => {
  it('requires every key in the rule', () => {
    expect(instrumentMatches({ sector: 'Information Technology' }, inst, [])).toBe(true);
    expect(
      instrumentMatches({ sector: 'Information Technology', region: 'Europe' }, inst, []),
    ).toBe(false);
    expect(
      instrumentMatches({ exposureName: 'Helios Cloud Systems' }, inst, ['Helios Cloud Systems']),
    ).toBe(true);
    expect(instrumentMatches({ exposureName: 'Helios Cloud Systems' }, inst, [])).toBe(false);
  });
  it('uses leg attributes for look-through when given', () => {
    expect(instrumentMatches({ sector: 'Energy' }, inst, [], 'Energy', 'Global')).toBe(true);
    expect(instrumentMatches({ hasFacility: true }, inst, [])).toBe(false);
  });
});
