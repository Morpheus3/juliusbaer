import { describe, expect, it } from 'vitest';
import { gauge, matrixCell, signalRisk, vulnerability } from './combined.js';

describe('matrixCell', () => {
  it('reads the wireframe grid', () => {
    expect(matrixCell('low', 'low')).toBe('Monitor');
    expect(matrixCell('medium', 'medium')).toBe('Discuss');
    expect(matrixCell('high', 'high')).toBe('URGENT');
    expect(matrixCell('medium', 'high')).toBe('Act Now');
    expect(matrixCell('high', 'low')).toBe('Discuss');
  });
});

describe('vulnerability', () => {
  it('is high when capacity is 1 or a mismatch is critical', () => {
    expect(vulnerability({ capacity: 1, appetite: 2, horizon: 2 }, [], []).level).toBe('high');
    expect(
      vulnerability(
        { capacity: 3, appetite: 2, horizon: 3 },
        [{ kind: 'STATED_VS_OBSERVED_APPETITE', severity: 'critical', message: 'm', evidence: {} }],
        [],
      ).level,
    ).toBe('high');
    expect(vulnerability({ capacity: 3, appetite: 2, horizon: 3 }, [], []).level).toBe('low');
  });
  it('falls back to alerts without a rubric', () => {
    const v = vulnerability(
      null,
      [],
      [
        {
          id: 'x',
          kind: 'MARGIN_CALL_PROXIMITY',
          severity: 'high',
          title: 't',
          detail: 'd',
          evidence: {},
        },
      ],
    );
    expect(v.level).toBe('high');
    expect(v.reasons[0]).toMatch(/No rubric/);
  });
});

describe('signalRisk and gauge', () => {
  it('grades stress and caps the gauge parts', () => {
    expect(signalRisk([], -6).level).toBe('high');
    expect(signalRisk([], -3).level).toBe('medium');
    expect(signalRisk([], -0.5).level).toBe('low');
    const g = gauge({
      stressPct: -4,
      severeStressPct: -12,
      mismatches: [
        {
          kind: 'PORTFOLIO_RISK_EXCEEDS_APPETITE',
          severity: 'critical',
          message: '',
          evidence: {},
        },
      ],
      rubric: { capacity: 1, appetite: 2, horizon: 2 },
      top1LookthroughPct: 30,
      top1LimitPct: 12,
      mandateDriftPts: 80,
    });
    expect(g.parts.signalSeverity).toBe(4);
    expect(g.parts.rubricMismatch).toBe(2.5);
    expect(g.parts.concentration).toBe(2.5);
    expect(g.composite).toBe(9);
  });
});
