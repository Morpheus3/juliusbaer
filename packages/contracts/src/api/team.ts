import { z } from 'zod';
import { Theme } from './book.js';

export const TeamRmRow = z.object({
  rmId: z.string(),
  name: z.string(),
  clients: z.number(),
  aumUsd: z.number(),
  urgencySum: z.number(),
  items: z.object({ now: z.number(), week: z.number(), month: z.number() }),
  escalated: z.number(),
  themes: z.array(z.object({ theme: Theme, count: z.number() })),
  /** Coverage */
  withinCadence: z.number(),
  uncontacted90: z.number(),
  reviewsLast12m: z.number(),
  promisesOverdue: z.number(),
  /** Conduct */
  overrides: z.number(),
  assessments: z.number(),
  clientDirectedBreaches: z.number(),
  exclusionsBreached: z.number(),
  kycOverdue: z.number(),
  unansweredOver2d: z.number(),
  /** Capacity */
  callsToday: z.number(),
  callsLater: z.number(),
  deferrals: z.number(),
  /** Commercial proxy */
  feesYtdUsd: z.number(),
});
export type TeamRmRow = z.infer<typeof TeamRmRow>;

export const WorstHousehold = z.object({
  clientId: z.string(),
  clientName: z.string(),
  rmId: z.string(),
  urgencyScore: z.number(),
  topItem: z.string().nullable(),
  link: z.string(),
});

export const ApprovalQueueItem = z.object({
  clientId: z.string(),
  clientName: z.string(),
  rmId: z.string(),
  actionId: z.string(),
  title: z.string(),
  category: z.string(),
  approvedAt: z.string(),
  ageingDays: z.number(),
  link: z.string(),
});

export const OverrideView = z.object({
  clientId: z.string(),
  clientName: z.string(),
  rmId: z.string(),
  dimension: z.string(),
  systemScore: z.number(),
  overrideScore: z.number(),
  reason: z.string(),
  at: z.string(),
});

export const MachinePanel = z.object({
  gatewayMode: z.enum(['live', 'recorded']),
  llmCallsToday: z.number(),
  llmErrorsToday: z.number(),
  tracesByPrompt: z.array(z.object({ promptId: z.string(), count: z.number() })),
  assistantConfirmations: z.number(),
  gateBlocks: z.number(),
  autonomyLevel: z.string(),
  agentsPaused: z.boolean(),
  shadow: z.array(
    z.object({
      playbookId: z.string(),
      name: z.string(),
      grades: z.number(),
      agreement: z.number().nullable(),
      readyForL2: z.boolean(),
    }),
  ),
  agreementThresholdForL2: z.number(),
  minimumGradesForL2: z.number(),
});

export const TeamResponse = z.object({
  clock: z.string(),
  scope: z.enum(['own', 'team', 'all']),
  teamId: z.string().nullable(),
  rms: z.array(TeamRmRow),
  worst: z.array(WorstHousehold),
  approvals: z.array(ApprovalQueueItem),
  overrides: z.array(OverrideView),
  explainabilitySample: z.array(
    z.object({
      clientId: z.string(),
      clientName: z.string(),
      kind: z.string(),
      summary: z.string(),
      at: z.string(),
      link: z.string(),
    }),
  ),
  uptake: z.array(
    z.object({
      signalId: z.string(),
      title: z.string(),
      reached: z.number(),
      drafted: z.number(),
      sent: z.number(),
    }),
  ),
  machine: MachinePanel,
  method: z.array(z.string()),
  needsFeed: z.array(z.string()),
});
export type TeamResponse = z.infer<typeof TeamResponse>;

export const AgentControlsRequest = z.object({
  paused: z.boolean(),
  reason: z.string().max(300).optional(),
});
export type AgentControlsRequest = z.infer<typeof AgentControlsRequest>;
