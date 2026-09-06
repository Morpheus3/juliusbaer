import { z } from 'zod';
import { RubricScore } from './rubric.js';

export const CrossBorderRule = z.object({
  topic: z.string(),
  allowed: z.boolean(),
  detail: z.string(),
});

/** What the RM may and may not do on this call, from the cross-border file, the rubric and the notes. */
export const GuardrailsResponse = z.object({
  clientId: z.string(),
  clientName: z.string(),
  residence: z.string(),
  bookingCentre: z.string(),
  language: z.string(),
  crossBorder: z.object({
    status: z.enum(['none', 'restricted', 'unknown']),
    rules: z.array(CrossBorderRule),
    disclosures: z.array(z.string()),
    source: z.enum(['reference', 'none']),
  }),
  suitability: z.object({
    profile: z.string(),
    score: z.number(),
    horizonYears: z.number(),
    rubric: z
      .object({
        capacity: RubricScore,
        appetite: RubricScore,
        horizon: RubricScore,
        status: z.string(),
      })
      .nullable(),
    notes: z.array(z.string()),
  }),
  notPermitted: z.array(z.string()),
  sensitivities: z.array(z.object({ date: z.string(), channel: z.string(), quote: z.string() })),
});
export type GuardrailsResponse = z.infer<typeof GuardrailsResponse>;

export const EndCallRequest = z.object({
  note: z.string().min(1).max(4000),
  cues: z
    .array(z.object({ text: z.string().max(600), answer: z.string().max(2000) }))
    .max(50)
    .default([]),
  promises: z
    .array(
      z.object({
        party: z.enum(['rm', 'client']),
        text: z.string().min(3).max(300),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .default(null),
        quote: z.string().max(600).optional(),
      }),
    )
    .max(20)
    .default([]),
  markDone: z.boolean().default(true),
  draft: z.boolean().default(false),
  durationSeconds: z.number().int().min(0).max(36_000).default(0),
});
export type EndCallRequest = z.infer<typeof EndCallRequest>;

export const EndCallResponse = z.object({
  auditEventId: z.string().nullable(),
  promisesCreated: z.number(),
  callDone: z.boolean(),
  draft: z.object({ id: z.string(), subject: z.string(), language: z.string() }).nullable(),
});
export type EndCallResponse = z.infer<typeof EndCallResponse>;
