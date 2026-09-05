import { z } from 'zod';

export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  datasetToday: z.string(),
  database: z.object({
    reachable: z.boolean(),
    lastLoadRun: z
      .object({
        id: z.string(),
        loadedAt: z.string(),
        rowCounts: z.record(z.string(), z.number()),
      })
      .nullable(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
