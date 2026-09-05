/**
 * Combines the three assessors into a system score with a confidence breakdown, and derives the
 * mismatch warnings. Pure functions so the arithmetic is unit-testable.
 */
import type {
  ConfidenceParts,
  Dimension,
  LlmAssessment,
  Mismatch,
  RubricScore,
} from '@jb/contracts';

export interface AssessorScores {
  rules: RubricScore;
  statistical: RubricScore;
  statisticalConfidence: number;
  llm: RubricScore | null;
}

export function toScore(n: number): RubricScore {
  return n <= 1 ? 1 : n >= 3 ? 3 : 2;
}

/** Majority where possible; otherwise the rules assessor decides because its reasoning is fully visible. */
export function systemScore(s: AssessorScores): RubricScore {
  const votes = [s.rules, s.statistical, ...(s.llm !== null ? [s.llm] : [])];
  const counts = new Map<RubricScore, number>();
  for (const v of votes) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 2) {
    return best[0];
  }
  return s.rules;
}

/** 1 when all available assessors agree, 0.6 when two of three agree, 0.2 when all differ. */
export function agreement(s: AssessorScores): number {
  const votes = [s.rules, s.statistical, ...(s.llm !== null ? [s.llm] : [])];
  const distinct = new Set(votes).size;
  if (votes.length === 2) {
    return distinct === 1 ? 1 : 0.35;
  }
  return distinct === 1 ? 1 : distinct === 2 ? 0.6 : 0.2;
}

export function confidence(
  s: AssessorScores,
  dataQuality: number,
  freshness: number,
  llm: LlmAssessment,
): ConfidenceParts {
  const a = agreement(s);
  const stat = s.statisticalConfidence;
  const available = s.llm === null ? 2 : 3;
  let overall = 0.45 * a + 0.25 * stat + 0.15 * dataQuality + 0.15 * freshness;
  const notes: string[] = [];
  if (s.llm === null) {
    overall -= 0.1;
    notes.push(
      `LLM assessor ${llm.status}: ${llm.note ?? 'no output'}; confidence reduced by 10 points.`,
    );
  }
  notes.push(
    `Agreement ${Math.round(a * 100)}% across ${available} assessors; statistical calibration ${Math.round(stat * 100)}%.`,
  );
  return {
    agreement: round(a),
    statistical: round(stat),
    dataQuality: round(dataQuality),
    freshness: round(freshness),
    overall: round(Math.max(0, Math.min(1, overall))),
    assessorsAvailable: available,
    notes,
  };
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

export function impliedAppetiteFromStated(riskScore: number): RubricScore {
  return riskScore <= 3 ? 1 : riskScore <= 6 ? 2 : 3;
}

export function portfolioRiskLevel(riskAssetPct: number): RubricScore {
  return riskAssetPct < 35 ? 1 : riskAssetPct <= 65 ? 2 : 3;
}

export function mismatches(input: {
  scores: Record<Dimension, RubricScore>;
  statedRiskScore: number;
  riskAssetPct: number;
  cashNeeds12mPctAum: number;
  ltvHeadroomPts: number | null;
  clientName: string;
}): Mismatch[] {
  const out: Mismatch[] = [];
  const portfolio = portfolioRiskLevel(input.riskAssetPct);
  if (portfolio > input.scores.appetite) {
    out.push({
      kind: 'PORTFOLIO_RISK_EXCEEDS_APPETITE',
      severity: 'critical',
      message: `Portfolio risk (level ${portfolio}, ${input.riskAssetPct.toFixed(0)}% in risk assets) exceeds the Appetite score of ${input.scores.appetite}.`,
      evidence: { riskAssetPct: input.riskAssetPct, appetite: input.scores.appetite },
    });
  }
  const implied = impliedAppetiteFromStated(input.statedRiskScore);
  if (implied !== input.scores.appetite) {
    out.push({
      kind: 'STATED_VS_OBSERVED_APPETITE',
      severity: Math.abs(implied - input.scores.appetite) >= 2 ? 'critical' : 'warning',
      message: `The client file says ${input.statedRiskScore}/10 (level ${implied}); observed behaviour scores ${input.scores.appetite}.`,
      evidence: {
        statedRiskScore: input.statedRiskScore,
        implied,
        observed: input.scores.appetite,
      },
    });
  }
  if (input.scores.horizon >= 2 && input.cashNeeds12mPctAum > 20) {
    out.push({
      kind: 'HORIZON_VS_CASH_NEEDS',
      severity: 'warning',
      message: `${input.cashNeeds12mPctAum.toFixed(0)}% of AUM falls due within 12 months while the horizon scores ${input.scores.horizon}.`,
      evidence: { cashNeeds12mPctAum: input.cashNeeds12mPctAum, horizon: input.scores.horizon },
    });
  }
  if (input.ltvHeadroomPts !== null && input.ltvHeadroomPts < 5 && input.scores.capacity >= 2) {
    out.push({
      kind: 'CAPACITY_VS_LEVERAGE',
      severity: 'warning',
      message: `Only ${input.ltvHeadroomPts.toFixed(1)} points of LTV headroom remain; a Capacity score of ${input.scores.capacity} is generous.`,
      evidence: { ltvHeadroomPts: input.ltvHeadroomPts, capacity: input.scores.capacity },
    });
  }
  return out;
}
