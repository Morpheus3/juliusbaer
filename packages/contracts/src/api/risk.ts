import { z } from 'zod';
import { ClientAlert } from './clientDetail.js';
import { RubricScore } from './rubric.js';

export const Level = z.enum(['low', 'medium', 'high']);
export type Level = z.infer<typeof Level>;

export const Urgency = z.enum(['now', 'week', 'month']);
export type Urgency = z.infer<typeof Urgency>;

/** Wireframe decision matrix cell: vulnerability × signal severity. */
export const MatrixCell = z.enum(['Monitor', 'Review', 'Discuss', 'Act Now', 'URGENT']);
export type MatrixCell = z.infer<typeof MatrixCell>;

export const SuitabilityCheck = z.object({
  rule: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});

export const Suitability = z.object({
  status: z.enum(['ok', 'review', 'blocked']),
  checks: z.array(SuitabilityCheck),
});
export type Suitability = z.infer<typeof Suitability>;

export const Decision = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().nullable(),
  actor: z.string(),
  at: z.string(),
});

export const RankedAction = z.object({
  id: z.string(),
  rank: z.number(),
  urgency: Urgency,
  category: z.enum([
    'conversation',
    'collateral',
    'rebalance',
    'liquidity',
    'compliance',
    'valuation',
  ]),
  title: z.string(),
  evidence: z.string(),
  benefit: z.string(),
  tradeOff: z.string(),
  score: z.number(),
  scoreParts: z.record(z.string(), z.number()),
  suitability: Suitability,
  sources: z.object({
    alertIds: z.array(z.string()),
    signalIds: z.array(z.string()),
    rubric: z.array(z.string()),
  }),
  decision: Decision.nullable(),
});
export type RankedAction = z.infer<typeof RankedAction>;

export const TradeIdea = z.object({
  id: z.string(),
  direction: z.enum(['buy', 'sell', 'switch', 'hold']),
  title: z.string(),
  rationale: z.string(),
  sell: z
    .object({
      instrumentId: z.string(),
      name: z.string(),
      portfolioId: z.string(),
      amountUsd: z.number(),
    })
    .nullable(),
  buy: z
    .object({
      instrumentId: z.string(),
      name: z.string(),
      portfolioId: z.string(),
      amountUsd: z.number(),
    })
    .nullable(),
  motivatedBy: z.object({ signalIds: z.array(z.string()), facts: z.array(z.string()) }),
  suitability: Suitability,
  confidence: z.number(),
  confidenceNote: z.string(),
  decision: Decision.nullable(),
});
export type TradeIdea = z.infer<typeof TradeIdea>;

export const CombinedRiskResponse = z.object({
  clientId: z.string(),
  clientName: z.string(),
  clock: z.string(),
  snapshotDate: z.string(),
  rubric: z
    .object({
      capacity: RubricScore,
      appetite: RubricScore,
      horizon: RubricScore,
      assessedAt: z.string(),
      status: z.string(),
    })
    .nullable(),
  vulnerability: z.object({ level: Level, reasons: z.array(z.string()) }),
  signalRisk: z.object({
    level: Level,
    reasons: z.array(z.string()),
    signalIds: z.array(z.string()),
    stressPct: z.number().nullable(),
    stressUsd: z.number().nullable(),
    severeStressPct: z.number().nullable(),
  }),
  matrix: z.object({
    cell: MatrixCell,
    row: Level,
    column: Level,
    grid: z.array(z.array(MatrixCell)),
  }),
  gauge: z.object({
    composite: z.number(),
    parts: z.object({
      signalSeverity: z.number(),
      rubricMismatch: z.number(),
      concentration: z.number(),
    }),
    explanation: z.array(z.string()),
  }),
  facts: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      tone: z.enum(['crit', 'warn', 'ok', 'neutral']),
      detail: z.string(),
    }),
  ),
  mismatches: z.array(z.string()),
  alerts: z.array(ClientAlert),
  actions: z.array(RankedAction),
  tradeIdeas: z.array(TradeIdea),
  notes: z.array(z.string()),
});
export type CombinedRiskResponse = z.infer<typeof CombinedRiskResponse>;

export const DecideRequest = z.object({
  entityType: z.enum(['action', 'trade_idea']),
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
});
export type DecideRequest = z.infer<typeof DecideRequest>;
