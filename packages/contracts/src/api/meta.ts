import { z } from 'zod';

/** Everything the UI needs to know about the loaded dataset before it renders anything. */
export const DatasetMeta = z.object({
  datasetName: z.string(),
  today: z.string(),
  snapshots: z.array(z.object({ date: z.string(), ordinal: z.number(), label: z.string() })),
  baseline: z.string(),
  current: z.string(),
  clockStart: z.string(),
  clockEnd: z.string(),
  rm: z.object({ id: z.string(), name: z.string(), desk: z.string() }),
  clientCount: z.number(),
  defaultClientId: z.string().nullable(),
  reference: z.object({
    lookthrough: z.boolean(),
    signalRules: z.boolean(),
    scenarios: z.boolean(),
    callPolicy: z.boolean(),
  }),
});
export type DatasetMeta = z.infer<typeof DatasetMeta>;
