/**
 * A plan is what both planners produce: the grammar (always available) and Claude (when a key is
 * present). The executor runs it, the composer writes from the results. One pipeline, two planners.
 */
import { z } from 'zod';

export const ToolName = z.enum([
  'meta',
  'book',
  'callPlan',
  'clientOverview',
  'clientCashflows',
  'clientNotes',
  'clientChange',
  'clientExposure',
  'signals',
  'risk',
  'rubric',
  'workflow',
  'audit',
  'scenarios',
  'impact',
  'findClients',
  'compareClients',
]);
export type ToolName = z.infer<typeof ToolName>;

export const ToolCall = z.object({
  tool: ToolName,
  args: z.record(z.string(), z.unknown()).default({}),
});
export type ToolCall = z.infer<typeof ToolCall>;

export const ProposalDraft = z.object({
  kind: z.enum(['triage', 'decision', 'defer', 'done', 'draft', 'override']),
  clientId: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
  /** Free text the planner wants matched against alerts or actions (e.g. "collateral"). */
  match: z.string().nullable().default(null),
});
export type ProposalDraft = z.infer<typeof ProposalDraft>;

/** Question shapes the template composer knows how to write. Claude may leave this null. */
export const Shape = z.enum([
  'help',
  'book-summary',
  'call-sheet',
  'why-first',
  'client-summary',
  'what-happened',
  'ltv',
  'cash',
  'rubric',
  'risk',
  'ideas',
  'exposure',
  'sell-clears-limit',
  'notes',
  'signal-impact',
  'scenario',
  'signals-today',
  'kyc',
  'find',
  'compare',
  'go',
  'do',
]);
export type Shape = z.infer<typeof Shape>;

export const Plan = z.object({
  intent: z.enum(['ask', 'find', 'do', 'go', 'help']),
  scopeClientId: z.string().nullable().default(null),
  calls: z.array(ToolCall).max(8).default([]),
  navigate: z.string().nullable().default(null),
  proposals: z.array(ProposalDraft).max(5).default([]),
  shape: Shape.nullable().default(null),
  /** Resolved entities the composer may need: instrument tokens, keyword, signal id, days… */
  entities: z.record(z.string(), z.unknown()).default({}),
  /** Why the planner chose this, one line, for the trace. */
  rationale: z.string().default(''),
});
export type Plan = z.infer<typeof Plan>;

/** Descriptions given to the Claude planner. Kept next to the enum so they cannot drift. */
export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  meta: 'Dataset facts: snapshots, today, the RM, client count.',
  book: 'The whole book at the clock: KPIs, lane items (Now / week / month) per client, urgency ranking.',
  callPlan:
    'Whom to call and when: per-client priority with its five terms, due-by, slot, channel.',
  clientOverview:
    'One client: profile, KPIs, alerts, allocation, top holdings, AUM series. args: clientId.',
  clientCashflows:
    'One client: cash needs, liquidity tiers, commitments, credit facilities with LTV series, 12-month coverage. args: clientId.',
  clientNotes: 'One client: RM notes newest first, verbatim. args: clientId, keyword?',
  clientChange:
    'One client: attribution of the change since the baseline (price, FX, flows) by asset class and top movers. args: clientId.',
  clientExposure:
    'One client: look-through exposure by name, sector, region, currency with limits and breaches. args: clientId.',
  signals:
    'Market signals at the clock; with clientId, each carries the client’s exposure and why it matters. args: clientId?',
  risk: 'One client: combined risk (matrix cell, gauge), vulnerability and signal-risk reasons, mismatches, ranked actions, trade ideas. args: clientId.',
  rubric:
    'One client: latest rubric assessment (capacity, appetite, horizon), assessors, mismatches. args: clientId.',
  workflow:
    'One client: the nine steps, triaged alerts, action reviews, outreach drafts. args: clientId.',
  audit: 'Audit events; with clientId only that client’s. args: clientId?',
  scenarios: 'The named stress scenarios available.',
  impact:
    'Run the impact engine for one client on a scenario or signals. args: clientId, scenarioId?, signalIds?, severity? (mild|base|severe).',
  findClients:
    'Clients matching filters: alertKind, theme, lane, uncontactedDays, signalId, minExposedPct, kycDueWithinDays, cashNeedWithinDays, wealthBand, place (centre or residence), language.',
  compareClients: 'Side-by-side facts for two to four clients. args: clientIds.',
};
