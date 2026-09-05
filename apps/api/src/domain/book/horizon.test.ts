import { describe, expect, it } from 'vitest';
import type { ClientAlert, HorizonItem } from '@jb/contracts';
import { laneForAlert, momentum, urgencyScore, type LaneInputs } from './horizon.js';

const base: LaneInputs = {
  clientId: 'C',
  clientName: 'C',
  clock: '2026-08-26',
  alerts: [],
  signals: [],
  ltvTrend: [],
  driftTrend: [],
  kycReviewDue: '2026-09-22',
};
const alert = (over: Partial<ClientAlert>): ClientAlert => ({
  id: 'a',
  kind: 'KYC_DUE',
  severity: 'medium',
  title: 't',
  detail: 'd',
  evidence: {},
  ...over,
});

describe('laneForAlert', () => {
  it('puts a margin call within 2 points in Now, and a falling one in Week', () => {
    const inp = { ...base, ltvTrend: [{ facilityId: 'F', headroomNow: 0.6, headroomPrev: 2.0 }] };
    expect(
      laneForAlert(
        alert({ kind: 'MARGIN_CALL_PROXIMITY', severity: 'high', evidence: { facilityId: 'F' } }),
        inp,
      ).lane,
    ).toBe('now');
    const inp2 = { ...base, ltvTrend: [{ facilityId: 'F', headroomNow: 4, headroomPrev: 6 }] };
    expect(
      laneForAlert(
        alert({ kind: 'MARGIN_CALL_PROXIMITY', severity: 'medium', evidence: { facilityId: 'F' } }),
        inp2,
      ).lane,
    ).toBe('week');
  });
  it('uses days to KYC and to a cash need', () => {
    expect(
      laneForAlert(alert({ kind: 'KYC_DUE' }), { ...base, kycReviewDue: '2026-08-20' }).lane,
    ).toBe('now');
    expect(
      laneForAlert(alert({ kind: 'KYC_DUE' }), { ...base, kycReviewDue: '2026-09-05' }).lane,
    ).toBe('week');
    expect(laneForAlert(alert({ kind: 'KYC_DUE' }), base).lane).toBe('month');
    expect(
      laneForAlert(alert({ kind: 'CASH_NEED_APPROACHING', title: 'X: $1M from 2026-09-10' }), base)
        .lane,
    ).toBe('week');
    expect(
      laneForAlert(alert({ kind: 'CASH_NEED_APPROACHING', title: 'X: $1M from 2026-11-01' }), base)
        .lane,
    ).toBe('month');
  });
  it('escalates a mandate breach that widened by more than a point', () => {
    const a = alert({
      kind: 'MANDATE_BREACH',
      evidence: { portfolioId: 'P', rows: [{ assetClass: 'Equity', deviationPts: 16 }] },
    });
    expect(
      laneForAlert(a, {
        ...base,
        driftTrend: [{ portfolioId: 'P', assetClass: 'Equity', devNow: 16, devPrev: 12 }],
      }).lane,
    ).toBe('week');
    expect(
      laneForAlert(a, {
        ...base,
        driftTrend: [{ portfolioId: 'P', assetClass: 'Equity', devNow: 16, devPrev: 16 }],
      }).lane,
    ).toBe('month');
  });
});

describe('momentum and urgency', () => {
  it('detects escalation and rewards motion in the score', () => {
    expect(momentum('now', 'week')).toBe('escalated');
    expect(momentum('week', 'now')).toBe('eased');
    expect(momentum('week', null)).toBe('new');
    const items = [
      { lane: 'now', severity: 'high', momentum: 'escalated' },
      { lane: 'month', severity: 'low', momentum: 'same' },
    ] as HorizonItem[];
    expect(urgencyScore(items)).toBe(3 * 3 + 1 + 1 * 1);
  });
});
