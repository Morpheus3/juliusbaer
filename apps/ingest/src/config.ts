import { z } from 'zod';
import { loadEnv } from '@jb/db';

const Schema = z.object({
  DATABASE_URL: z.string().min(1),
  /** The consumer connects as the ingest role in production; falls back to DATABASE_URL. */
  INGEST_DATABASE_URL: z.string().min(1).optional(),
  KAFKA_BROKERS: z.string().default('127.0.0.1:9092'),
  KAFKA_TOPIC: z.string().default('rmw.ingest'),
  KAFKA_GROUP_ID: z.string().default('rmw-ingest'),
  KAFKA_CLIENT_ID: z.string().default('rmw-ingest'),
  /** Messages are applied in batches of this many, or when the batch is this old. */
  INGEST_BATCH_SIZE: z.coerce.number().int().positive().default(200),
  INGEST_BATCH_MS: z.coerce.number().int().positive().default(1500),
  ANALYTICS_URL: z.string().optional(),
});
export type IngestConfig = z.infer<typeof Schema>;

export function loadIngestConfig(env: NodeJS.ProcessEnv = process.env): IngestConfig {
  loadEnv();
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid ingest configuration:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  return parsed.data;
}
