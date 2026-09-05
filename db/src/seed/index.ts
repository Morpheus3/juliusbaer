import path from 'node:path';
import { eq } from 'drizzle-orm';
import { DATASET_TODAY } from '@jb/contracts';
import type { Db } from '../client.js';
import { repoRoot } from '../env.js';
import { dataQualityIssues, loadRuns } from '../schema/derived.js';
import { readDataset } from './dataset.js';
import { loadRaw } from './load.js';
import { runQualityChecks } from './quality/index.js';

export interface SeedOptions {
  sourceDir?: string | undefined;
  today?: string | undefined;
}

export interface SeedResult {
  loadRunId: string;
  rowCounts: Record<string, number>;
  issueCount: number;
  issuesByCode: Record<string, number>;
}

/** Validates the dataset, loads it into raw.*, runs quality checks and records the run. */
export async function seed(db: Db, opts: SeedOptions = {}): Promise<SeedResult> {
  const sourceDir = opts.sourceDir ?? path.join(repoRoot(), 'data');
  const today = opts.today ?? DATASET_TODAY;

  const [run] = await db
    .insert(loadRuns)
    .values({ datasetToday: today, sourceDir })
    .returning({ id: loadRuns.id });
  if (!run) {
    throw new Error('failed to create load run');
  }

  try {
    const data = await readDataset(sourceDir);
    const rowCounts = await loadRaw(db, data);
    const findings = runQualityChecks(data, today);

    if (findings.length > 0) {
      await db.insert(dataQualityIssues).values(findings.map((f) => ({ ...f, loadRunId: run.id })));
    }
    // Earlier runs are superseded; keep only the latest register.
    await db.delete(loadRuns).where(eq(loadRuns.status, 'succeeded'));

    await db
      .update(loadRuns)
      .set({ status: 'succeeded', finishedAt: new Date(), rowCounts, issueCount: findings.length })
      .where(eq(loadRuns.id, run.id));

    const issuesByCode: Record<string, number> = {};
    for (const f of findings) {
      issuesByCode[f.code] = (issuesByCode[f.code] ?? 0) + 1;
    }
    return { loadRunId: run.id, rowCounts, issueCount: findings.length, issuesByCode };
  } catch (err) {
    await db
      .update(loadRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(loadRuns.id, run.id));
    throw err;
  }
}
