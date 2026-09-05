/**
 * Combined risk: the wireframe's vulnerability × signal-severity matrix, the composite gauge and
 * the key facts. Pure functions over inputs that the service assembles.
 */
import type { ClientAlert, Level, MatrixCell, Mismatch, RubricScore, Signal } from '@jb/contracts';

/** Rows: vulnerability low/medium/high. Columns: signal low/medium/high. As drawn on slide 07. */
export const MATRIX: MatrixCell[][] = [
  ['Monitor', 'Review', 'Discuss'],
  ['Review', 'Discuss', 'Act Now'],
  ['Discuss', 'Act Now', 'URGENT'],
];

const IDX: Record<Level, number> = { low: 0, medium: 1, high: 2 };

export function matrixCell(vulnerability: Level, signal: Level): MatrixCell {
  return MATRIX[IDX[vulnerability]]?.[IDX[signal]] ?? 'Review';
}

export interface RubricScores {
  capacity: RubricScore;
  appetite: RubricScore;
  horizon: RubricScore;
}

/** Vulnerability from the rubric and its mismatches; without a rubric, from alerts alone. */
export function vulnerability(
  rubric: RubricScores | null,
  mismatches: Mismatch[],
  alerts: ClientAlert[],
): { level: Level; reasons: string[] } {
  const reasons: string[] = [];
  let level: Level = 'low';
  const bump = (to: Level, why: string): void => {
    reasons.push(why);
    if (IDX[to] > IDX[level]) {
      level = to;
    }
  };
  if (rubric) {
    if (rubric.capacity === 1) {
      bump(
        'high',
        'Risk Capacity scored 1: limited ability to absorb losses or fund needs without selling.',
      );
    } else if (rubric.capacity === 2) {
      bump('medium', 'Risk Capacity scored 2.');
    }
    if (rubric.horizon === 1) {
      bump('medium', 'Investment Horizon scored 1: little time to recover from a drawdown.');
    }
  } else {
    reasons.push('No rubric assessment yet; vulnerability read from alerts only.');
  }
  for (const m of mismatches) {
    if (m.severity === 'critical') {
      bump('high', m.message);
    } else if (m.severity === 'warning') {
      bump('medium', m.message);
    }
  }
  for (const a of alerts) {
    if (a.kind === 'MARGIN_CALL_PROXIMITY' && a.severity === 'high') {
      bump('high', a.title);
    }
    if (a.kind === 'LIQUIDITY_SHORTFALL') {
      bump(a.severity === 'high' ? 'high' : 'medium', a.title);
    }
  }
  return { level, reasons };
}

/** Signal risk from the modelled stress of recent signals reaching the client, with a severity fallback. */
export function signalRisk(
  recent: Signal[],
  stressPct: number | null,
): { level: Level; reasons: string[] } {
  const reasons: string[] = [];
  let level: Level = 'low';
  if (stressPct !== null) {
    if (stressPct <= -5) {
      level = 'high';
    } else if (stressPct <= -2) {
      level = 'medium';
    }
    reasons.push(
      `Base-case stress of the ${recent.length} recent signal${recent.length === 1 ? '' : 's'} reaching this household: ${stressPct.toFixed(1)}% of AUM.`,
    );
  }
  const exposed = recent.filter(
    (s) => (s.client?.exposedPct ?? 0) >= 20 && (s.severity === 'SEVERE' || s.severity === 'HIGH'),
  );
  if (exposed.length > 0) {
    if (level !== 'high') {
      level = level === 'low' ? 'medium' : 'high';
    }
    reasons.push(
      `${exposed.length} high or severe signal${exposed.length === 1 ? '' : 's'} reach at least 20% of the household directly.`,
    );
  }
  if (recent.length === 0) {
    reasons.push('No signal within the look-back window reaches this household.');
  }
  return { level, reasons };
}

export interface GaugeInputs {
  stressPct: number | null;
  severeStressPct: number | null;
  mismatches: Mismatch[];
  rubric: RubricScores | null;
  top1LookthroughPct: number | null;
  top1LimitPct: number | null;
  mandateDriftPts: number | null;
}

/** Composite 0–10: signal severity (0–4), rubric mismatch (0–3.5), concentration (0–2.5). */
export function gauge(i: GaugeInputs): {
  composite: number;
  parts: { signalSeverity: number; rubricMismatch: number; concentration: number };
  explanation: string[];
} {
  const clamp = (v: number, max: number): number => Math.max(0, Math.min(max, v));
  const explanation: string[] = [];

  const stress = i.severeStressPct ?? i.stressPct ?? 0;
  const signalSeverity = clamp((-stress / 10) * 4, 4);
  explanation.push(
    `Signal severity ${signalSeverity.toFixed(1)}/4 from a ${i.severeStressPct !== null ? 'severe' : 'base'}-case modelled impact of ${stress.toFixed(1)}%: 10% loss maps to the full 4 points.`,
  );

  let mismatch = 0;
  for (const m of i.mismatches) {
    mismatch += m.severity === 'critical' ? 1.5 : m.severity === 'warning' ? 0.75 : 0.25;
  }
  if (i.rubric?.capacity === 1) {
    mismatch += 1;
  }
  const rubricMismatch = clamp(mismatch, 3.5);
  explanation.push(
    `Rubric mismatch ${rubricMismatch.toFixed(1)}/3.5: 1.5 per critical mismatch, 0.75 per warning, plus 1 when Capacity is 1.`,
  );

  let conc = 0;
  if (i.top1LookthroughPct !== null && i.top1LimitPct !== null && i.top1LimitPct > 0) {
    conc += clamp(((i.top1LookthroughPct - i.top1LimitPct) / i.top1LimitPct) * 1.5, 1.5);
  }
  if (i.mandateDriftPts !== null) {
    conc += clamp(i.mandateDriftPts / 40, 1);
  }
  const concentration = clamp(conc, 2.5);
  explanation.push(
    `Concentration ${concentration.toFixed(1)}/2.5 from the largest look-through name against its limit and mandate drift (40 points of drift maps to 1).`,
  );

  const composite = Math.round((signalSeverity + rubricMismatch + concentration) * 10) / 10;
  return {
    composite,
    parts: {
      signalSeverity: round1(signalSeverity),
      rubricMismatch: round1(rubricMismatch),
      concentration: round1(concentration),
    },
    explanation,
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
