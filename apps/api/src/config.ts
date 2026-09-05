import { z } from 'zod';
import { loadEnv } from '@jb/db';

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ANALYTICS_URL: z.url().default('http://localhost:8000'),
  DATASET_TODAY: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default('2026-08-26'),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_ANALYSIS_MODEL: z.string().default('claude-sonnet-5'),
  CLAUDE_FAST_MODEL: z.string().default('claude-haiku-4-5'),
  CLAUDE_RECORD: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  loadEnv();
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
