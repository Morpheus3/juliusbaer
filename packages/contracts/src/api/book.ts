import { z } from 'zod';
import { AssetClassSchema } from '../dataset/common.js';
import { Urgency } from './risk.js';

export const Theme = z.enum([
  'collateral',
  'mandate',
  'concentration',
  'liquidity',
  'compliance',
  'contact',
  'valuation',
  'signal',
]);
export type Theme = z.infer<typeof Theme>;

export const Momentum = z.enum(['new', 'escalated', 'same', 'eased']);
export type Momentum = z.infer<typeof Momentum>;

export const HorizonItem = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  lane: Urgency,
  previousLane: Urgency.nullable(),
  momentum: Momentum,
  theme: Theme,
  severity: z.enum(['low', 'medium', 'high']),
  title: z.string(),
  detail: z.string(),
  /** Why this lane, in one sentence. */
  laneReason: z.string(),
  dueDate: z.string().nullable(),
  evidence: z.record(z.string(), z.unknown()),
  link: z.string(),
});
export type HorizonItem = z.infer<typeof HorizonItem>;

export const BookClientRow = z.object({
  clientId: z.string(),
  name: z.string(),
  bookingCentre: z.string(),
  riskProfile: z.string(),
  aumUsd: z.number(),
  ytdChangePct: z.number(),
  urgencyScore: z.number(),
  counts: z.object({ now: z.number(), week: z.number(), month: z.number() }),
  rubric: z
    .object({ capacity: z.number(), appetite: z.number(), horizon: z.number(), status: z.string() })
    .nullable(),
  topItem: z.string().nullable(),
  themes: z.array(Theme),
});
export type BookClientRow = z.infer<typeof BookClientRow>;

export const BookResponse = z.object({
  clock: z.string(),
  snapshotDate: z.string(),
  previousSnapshotDate: z.string().nullable(),
  kpis: z.object({
    clients: z.number(),
    aumUsd: z.number(),
    aumBaselineUsd: z.number(),
    ytdChangePct: z.number(),
    clientsInBreach: z.number(),
    facilitiesNearTrigger: z.number(),
    kycOverdue: z.number(),
    kycDueSoon: z.number(),
    rubricAssessed: z.number(),
    items: z.object({ now: z.number(), week: z.number(), month: z.number() }),
  }),
  items: z.array(HorizonItem),
  clients: z.array(BookClientRow),
  method: z.array(z.string()),
});
export type BookResponse = z.infer<typeof BookResponse>;

export const BoardCell = z.object({
  assetClass: AssetClassSchema,
  weightPct: z.number(),
  previousWeightPct: z.number().nullable(),
  minPct: z.number(),
  maxPct: z.number(),
  status: z.enum(['within', 'below', 'above']),
  deviationPts: z.number(),
  trend: z.enum(['worsening', 'improving', 'flat']),
});

export const BoardPortfolio = z.object({
  portfolioId: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  name: z.string(),
  mandateCode: z.string(),
  mandateName: z.string(),
  serviceModel: z.string(),
  managed: z.boolean(),
  aumUsd: z.number(),
  cells: z.array(BoardCell),
  breachType: z.enum(['none', 'drift', 'client-directed', 'waived']),
  breachNote: z.string().nullable(),
  singleLineBreaches: z.number(),
  exclusionBreaches: z.number(),
});

export const BoardFacility = z.object({
  facilityId: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  type: z.string(),
  currency: z.string(),
  drawn: z.number(),
  limit: z.number(),
  ltvPct: z.number(),
  marginCallLtvPct: z.number(),
  headroomPts: z.number(),
  series: z.array(z.object({ snapshotDate: z.string(), ltvPct: z.number() })),
  breachedEver: z.boolean(),
  curedBy: z.enum(['action', 'market', 'none']).nullable(),
});

export const BoardResponse = z.object({
  snapshotDate: z.string(),
  previousSnapshotDate: z.string().nullable(),
  assetClasses: z.array(AssetClassSchema),
  portfolios: z.array(BoardPortfolio),
  facilities: z.array(BoardFacility),
  method: z.array(z.string()),
});
export type BoardResponse = z.infer<typeof BoardResponse>;
