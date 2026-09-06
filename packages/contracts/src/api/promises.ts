import { z } from 'zod';

export const PromiseParty = z.enum(['rm', 'client']);
export const PromiseKind = z.enum(['promise', 'decision-debt']);
export const PromiseStatus = z.enum(['open', 'done', 'dropped']);

/** A commitment with its quoted source. RM promises get drafts; client promises are checked against data. */
export const PromiseView = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  party: PromiseParty,
  kind: PromiseKind,
  text: z.string(),
  quote: z.string(),
  sourceKind: z.enum(['note', 'call', 'manual', 'assistant']),
  sourceRef: z.string().nullable(),
  sourceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: PromiseStatus,
  actor: z.string(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  /** Days past due at the clock; negative when not yet due; null without a date. */
  overdueDays: z.number().nullable(),
});
export type PromiseView = z.infer<typeof PromiseView>;

export const PromisesResponse = z.object({
  clientId: z.string().nullable(),
  clock: z.string(),
  promises: z.array(PromiseView),
  extractedNow: z.number(),
  method: z.array(z.string()),
});
export type PromisesResponse = z.infer<typeof PromisesResponse>;

export const AddPromiseRequest = z.object({
  party: PromiseParty,
  text: z.string().min(3).max(300),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  kind: PromiseKind.default('promise'),
  quote: z.string().max(600).optional(),
});
export type AddPromiseRequest = z.infer<typeof AddPromiseRequest>;

export const ResolvePromiseRequest = z.object({ status: z.enum(['done', 'dropped']) });
export type ResolvePromiseRequest = z.infer<typeof ResolvePromiseRequest>;

export const PromiseCandidate = z.object({
  party: PromiseParty,
  kind: PromiseKind,
  text: z.string(),
  quote: z.string(),
  dueDate: z.string().nullable(),
});
export type PromiseCandidate = z.infer<typeof PromiseCandidate>;

export const PreviewPromisesRequest = z.object({ text: z.string().max(4000) });
export const PreviewPromisesResponse = z.object({ candidates: z.array(PromiseCandidate) });
