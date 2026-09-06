import { z } from 'zod';
import { TradeIdea } from './risk.js';

/** One client the idea fits (or does not), with the rule-level why. */
export const IdeaMatch = z.object({
  clientId: z.string(),
  clientName: z.string(),
  aumUsd: z.number(),
  language: z.string(),
  residence: z.string(),
  idea: TradeIdea,
  why: z.string(),
  link: z.string(),
});
export type IdeaMatch = z.infer<typeof IdeaMatch>;

export const Opportunity = z.object({
  clientId: z.string(),
  clientName: z.string(),
  kind: z.enum(['lending', 'mandate', 'succession', 'next-generation', 'deployment']),
  title: z.string(),
  why: z.string(),
  quote: z.string().nullable(),
  quoteDate: z.string().nullable(),
  link: z.string(),
});
export type Opportunity = z.infer<typeof Opportunity>;

export const IdeaUptake = z.object({
  signalId: z.string(),
  title: z.string(),
  date: z.string(),
  reached: z.number(),
  drafted: z.number(),
  sent: z.number(),
});

export const IdeasResponse = z.object({
  clock: z.string(),
  query: z.string().nullable(),
  signal: z.object({ id: z.string(), title: z.string(), date: z.string() }).nullable(),
  matches: z.array(IdeaMatch),
  blocked: z.array(IdeaMatch),
  opportunities: z.array(Opportunity),
  uptake: z.array(IdeaUptake),
  method: z.array(z.string()),
});
export type IdeasResponse = z.infer<typeof IdeasResponse>;
