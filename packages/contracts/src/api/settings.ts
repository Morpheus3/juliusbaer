import { z } from 'zod';

export const ClaudeSettings = z.object({
  mode: z.enum(['live', 'recorded']),
  analysisModel: z.string(),
  fastModel: z.string(),
  /** Last four characters of the configured key, never the key itself. */
  keyHint: z.string().nullable(),
  source: z.enum(['environment', 'runtime', 'none']),
  validatedAt: z.string().nullable(),
  persisted: z.boolean(),
  recordingsEnabled: z.boolean(),
});
export type ClaudeSettings = z.infer<typeof ClaudeSettings>;

export const SetClaudeKeyRequest = z.object({
  apiKey: z.string().min(20).max(400),
  /** Also write the key to the repository's local .env so it survives a restart. */
  persist: z.boolean().default(false),
});
export type SetClaudeKeyRequest = z.infer<typeof SetClaudeKeyRequest>;
