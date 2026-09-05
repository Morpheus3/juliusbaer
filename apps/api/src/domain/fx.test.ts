import { describe, expect, it } from 'vitest';
import { Fx } from './fx.js';

const fx = new Fx(
  new Map([
    ['2026-08-26|USDSGD', 1.352],
    ['2026-08-26|EURUSD', 1.092],
    ['2026-08-26|USDHKD', 7.81],
  ]),
);

describe('Fx', () => {
  it('converts market-convention pairs to USD', () => {
    expect(fx.toUsd(1.352, 'SGD', '2026-08-26')).toBeCloseTo(1, 6);
    expect(fx.toUsd(1, 'EUR', '2026-08-26')).toBeCloseTo(1.092, 6);
    expect(fx.toUsd(7.81, 'HKD', '2026-08-26')).toBeCloseTo(1, 6);
    expect(fx.toUsd(5, 'USD', '2026-08-26')).toBe(5);
  });
  it('fails loudly on a missing rate', () => {
    expect(() => fx.toUsd(1, 'THB', '2026-08-26')).toThrow(/USDTHB/);
  });
});
