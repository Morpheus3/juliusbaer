import { z } from 'zod';
import { ClientAlert } from './clientDetail.js';
import { RankedAction } from './risk.js';

export const WorkflowStepKey = z.enum([
  'select',
  'portfolio',
  'signal',
  'impact',
  'rubric',
  'mismatch',
  'action',
  'comms',
  'log',
]);
export type WorkflowStepKey = z.infer<typeof WorkflowStepKey>;

export const WorkflowStep = z.object({
  key: WorkflowStepKey,
  index: z.number(),
  title: z.string(),
  status: z.enum(['done', 'current', 'todo']),
  detail: z.string(),
  link: z.string(),
});
export type WorkflowStep = z.infer<typeof WorkflowStep>;

export const TriagedAlert = ClientAlert.extend({
  triage: z
    .object({
      decision: z.enum(['triaged', 'dismissed']),
      reason: z.string().nullable(),
      actor: z.string(),
      at: z.string(),
    })
    .nullable(),
});
export type TriagedAlert = z.infer<typeof TriagedAlert>;

export const ReviewCheck = z.object({
  name: z.string(),
  status: z.enum(['ok', 'pending', 'blocked']),
  detail: z.string(),
});
export type ReviewCheck = z.infer<typeof ReviewCheck>;

export const ActionReview = z.object({
  action: RankedAction,
  checks: z.array(ReviewCheck),
  requiresChecker: z.boolean(),
  checker: z
    .object({
      decision: z.enum(['approved', 'rejected']),
      actor: z.string(),
      at: z.string(),
      note: z.string().nullable(),
    })
    .nullable(),
  requiredLevel: z.number(),
  canProceed: z.boolean(),
});
export type ActionReview = z.infer<typeof ActionReview>;

export const OutreachDraft = z.object({
  id: z.string(),
  channel: z.string(),
  language: z.string(),
  subject: z.string(),
  body: z.string(),
  status: z.enum(['draft', 'sent', 'discarded']),
  source: z.enum(['claude', 'template']),
  llmTraceId: z.string().nullable(),
  factsUsed: z.array(z.string()),
  caveats: z.array(z.string()),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
  actor: z.string(),
});
export type OutreachDraft = z.infer<typeof OutreachDraft>;

export const Guardrail = z.object({
  name: z.string(),
  status: z.enum(['active', 'warning', 'off']),
  detail: z.string(),
});

export const WorkflowResponse = z.object({
  clientId: z.string(),
  clientName: z.string(),
  reportingLanguage: z.string(),
  clock: z.string(),
  rm: z.object({ id: z.string(), level: z.number(), checkerId: z.string() }),
  steps: z.array(WorkflowStep).length(9),
  alerts: z.array(TriagedAlert),
  stale: z.object({ isStale: z.boolean(), snapshotAgeDays: z.number(), detail: z.string() }),
  reviews: z.array(ActionReview),
  outreach: z.array(OutreachDraft),
  guardrails: z.array(Guardrail),
});
export type WorkflowResponse = z.infer<typeof WorkflowResponse>;

export const TriageRequest = z.object({
  decision: z.enum(['triaged', 'dismissed']),
  reason: z.string().max(300).optional(),
});
export type TriageRequest = z.infer<typeof TriageRequest>;

export const CheckRequest = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(300).optional(),
});
export type CheckRequest = z.infer<typeof CheckRequest>;

export const DraftRequest = z.object({
  channel: z.enum(['email', 'call-notes', 'message']).default('email'),
  actionIds: z.array(z.string()).default([]),
  signalIds: z.array(z.string()).default([]),
  tone: z.enum(['formal', 'warm']).default('formal'),
});
export type DraftRequest = z.infer<typeof DraftRequest>;

export const SendRequest = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(6000),
});
export type SendRequest = z.infer<typeof SendRequest>;
