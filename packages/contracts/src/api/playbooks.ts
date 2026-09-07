import { z } from 'zod';

export const PlaybookStep = z.object({
  id: z.string(),
  prompt: z.string(),
  template: z.string(),
});
export const Playbook = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  allowedTopics: z.array(z.string()),
  requiredDisclosures: z.array(z.string()),
  doneCondition: z.string(),
  steps: z.array(PlaybookStep),
});
export type Playbook = z.infer<typeof Playbook>;

export const PlaybooksDoc = z.looseObject({
  version: z.number(),
  autonomy: z.object({
    level: z.string(),
    agreementThresholdForL2: z.number(),
    minimumGradesForL2: z.number(),
  }),
  escalationTriggers: z.array(z.string()),
  playbooks: z.array(Playbook),
});
export type PlaybooksDoc = z.infer<typeof PlaybooksDoc>;

export const PlaybooksResponse = z.object({
  source: z.enum(['reference', 'none']),
  autonomy: PlaybooksDoc.shape.autonomy,
  escalationTriggers: z.array(z.string()),
  playbooks: z.array(Playbook),
});
export type PlaybooksResponse = z.infer<typeof PlaybooksResponse>;

/** What an agent would have said at one step for one client, from the template and the client's facts. */
export const ShadowDraft = z.object({
  playbookId: z.string(),
  stepId: z.string(),
  text: z.string(),
  source: z.enum(['template', 'claude']),
  /** Placeholders the facts could not fill; the RM sees them and the step is not gradable as-is. */
  missing: z.array(z.string()),
});
export type ShadowDraft = z.infer<typeof ShadowDraft>;

export const ShadowRunResponse = z.object({
  clientId: z.string(),
  playbook: Playbook,
  drafts: z.array(ShadowDraft),
  escalations: z.array(z.string()),
});
export type ShadowRunResponse = z.infer<typeof ShadowRunResponse>;

export const ShadowGradeRequest = z.object({
  playbookId: z.string(),
  stepId: z.string(),
  draft: z.string().max(2000),
  source: z.enum(['template', 'claude']).default('template'),
  grade: z.enum(['agree', 'disagree', 'edited']),
  rmText: z.string().max(2000).optional(),
});
export type ShadowGradeRequest = z.infer<typeof ShadowGradeRequest>;
