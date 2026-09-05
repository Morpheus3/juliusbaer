import { describe, expect, it } from 'vitest';
import {
  agreement,
  confidence,
  impliedAppetiteFromStated,
  mismatches,
  systemScore,
} from './combine.js';

const llmUnavailable = {
  status: 'unavailable' as const,
  score: null,
  rationale: null,
  evidence: [],
  caveats: [],
  traceId: null,
  model: null,
  note: 'no key',
};

describe('systemScore and agreement', () => {
  it('takes the majority and reports agreement', () => {
    expect(systemScore({ rules: 1, statistical: 1, statisticalConfidence: 0.8, llm: 2 })).toBe(1);
    expect(agreement({ rules: 1, statistical: 1, statisticalConfidence: 0.8, llm: 2 })).toBe(0.6);
    expect(agreement({ rules: 1, statistical: 2, statisticalConfidence: 0.8, llm: 3 })).toBe(0.2);
  });
  it('falls back to the rules assessor when there is no majority', () => {
    expect(systemScore({ rules: 2, statistical: 3, statisticalConfidence: 0.5, llm: 1 })).toBe(2);
    expect(systemScore({ rules: 2, statistical: 3, statisticalConfidence: 0.5, llm: null })).toBe(
      2,
    );
  });
});

describe('confidence', () => {
  it('penalises a missing LLM assessor and stays within 0..1', () => {
    const c = confidence(
      { rules: 1, statistical: 1, statisticalConfidence: 0.9, llm: null },
      0.9,
      1,
      llmUnavailable,
    );
    expect(c.assessorsAvailable).toBe(2);
    expect(c.overall).toBeCloseTo(0.45 * 1 + 0.25 * 0.9 + 0.15 * 0.9 + 0.15 * 1 - 0.1, 3);
    expect(c.notes[0]).toMatch(/unavailable/);
  });
});

describe('mismatches', () => {
  it('flags Voss-Brenner: conservative file, equity-heavy portfolio', () => {
    const m = mismatches({
      scores: { capacity: 2, appetite: 3, horizon: 3 },
      statedRiskScore: 2,
      riskAssetPct: 74,
      cashNeeds12mPctAum: 17,
      ltvHeadroomPts: null,
      clientName: 'V',
    });
    expect(m.map((x) => x.kind)).toEqual(['STATED_VS_OBSERVED_APPETITE']);
    expect(m[0]?.severity).toBe('critical');
  });
  it('flags portfolio risk above appetite and leverage against capacity', () => {
    const m = mismatches({
      scores: { capacity: 2, appetite: 1, horizon: 2 },
      statedRiskScore: 3,
      riskAssetPct: 70,
      cashNeeds12mPctAum: 29,
      ltvHeadroomPts: 0.6,
      clientName: 'L',
    });
    expect(m.map((x) => x.kind)).toEqual([
      'PORTFOLIO_RISK_EXCEEDS_APPETITE',
      'HORIZON_VS_CASH_NEEDS',
      'CAPACITY_VS_LEVERAGE',
    ]);
  });
  it('maps stated score to a level', () => {
    expect(impliedAppetiteFromStated(2)).toBe(1);
    expect(impliedAppetiteFromStated(5)).toBe(2);
    expect(impliedAppetiteFromStated(9)).toBe(3);
  });
});
