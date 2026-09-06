import { z } from 'zod';

/** What the RM typed, and where she was when she typed it. */
export const AskRequest = z.object({
  text: z.string().trim().min(1).max(600),
  clientId: z.string().max(64).optional(),
  route: z.string().max(200).optional(),
});
export type AskRequest = z.infer<typeof AskRequest>;

export const AssistantIntent = z.enum(['ask', 'find', 'do', 'go', 'help']);
export type AssistantIntent = z.infer<typeof AssistantIntent>;

export const ToolCallView = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  ok: z.boolean(),
  summary: z.string(),
  ms: z.number(),
});
export type ToolCallView = z.infer<typeof ToolCallView>;

export const ProposalKind = z.enum(['triage', 'decision', 'defer', 'done', 'draft', 'override']);
export type ProposalKind = z.infer<typeof ProposalKind>;

/** A task the assistant would perform; nothing is written until the RM confirms it. */
export const Proposal = z.object({
  id: z.string(),
  kind: ProposalKind,
  clientId: z.string(),
  clientName: z.string(),
  title: z.string(),
  effect: z.string(),
  body: z.record(z.string(), z.unknown()),
  warning: z.string().nullable(),
  expiresAt: z.string(),
});
export type Proposal = z.infer<typeof Proposal>;

export const AnswerCard = z.object({
  title: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.object({ cells: z.array(z.string()), link: z.string().nullable() })),
});
export type AnswerCard = z.infer<typeof AnswerCard>;

export const AssistantResponse = z.object({
  intent: AssistantIntent,
  scope: z.object({ clientId: z.string().nullable(), clientName: z.string().nullable() }),
  answer: z.string(),
  bullets: z.array(z.string()),
  cards: z.array(AnswerCard),
  navigate: z.string().nullable(),
  proposals: z.array(Proposal),
  trace: z.array(ToolCallView),
  planner: z.enum(['claude', 'grammar']),
  composer: z.enum(['claude', 'template']),
  warnings: z.array(z.string()),
  followUps: z.array(z.string()),
  clock: z.string(),
});
export type AssistantResponse = z.infer<typeof AssistantResponse>;

export const ConfirmRequest = z.object({ proposalId: z.string().min(1).max(64) });
export type ConfirmRequest = z.infer<typeof ConfirmRequest>;

export const ConfirmResponse = z.object({
  proposalId: z.string(),
  kind: ProposalKind,
  clientId: z.string(),
  result: z.string(),
});
export type ConfirmResponse = z.infer<typeof ConfirmResponse>;
