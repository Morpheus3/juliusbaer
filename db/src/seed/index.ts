import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { repoRoot } from '../env.js';
import { dataQualityIssues, loadRuns } from '../schema/derived.js';
import { loadAccess } from './access.js';
import { readDataset } from './dataset.js';
import { loadRaw } from './load.js';
import { runQualityChecks } from './quality/index.js';
import {
  loadCallPolicy,
  loadReference,
  loadReferenceDocs,
  loadScenarios,
  loadSignalRules,
} from './reference/index.js';

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
  const sourceDir = opts.sourceDir ?? process.env.DATA_DIR ?? path.join(repoRoot(), 'data');

  const [run] = await db
    .insert(loadRuns)
    .values({ datasetToday: opts.today ?? 'latest snapshot', sourceDir })
    .returning({ id: loadRuns.id });
  if (!run) {
    throw new Error('failed to create load run');
  }

  try {
    const data = await readDataset(sourceDir);
    const today = opts.today ?? data.snapshots[data.snapshots.length - 1]?.date ?? '';
    const rowCounts = await loadRaw(db, data);
    const referenceDir = path.join(sourceDir, 'reference');
    const ref = await loadReference(
      db,
      referenceDir,
      new Set(data.instruments.map((i) => i.instrument_id)),
    );
    rowCounts.lookthrough_legs = ref.legs;
    rowCounts.issuer_groups = ref.issuers;
    const sig = await loadSignalRules(
      db,
      referenceDir,
      new Set(data.eventLog.map((_e, i) => `EV-${String(i + 1).padStart(3, '0')}`)),
    );
    rowCounts.scenarios = await loadScenarios(db, referenceDir);
    rowCounts.call_policy = await loadCallPolicy(db, referenceDir);
    rowCounts.reference_docs = await loadReferenceDocs(db, referenceDir);
    const acc = await loadAccess(db, data, referenceDir);
    rowCounts.teams = acc.teams;
    rowCounts.rms = acc.rms;
    rowCounts.rm_assignments = acc.assignments;
    rowCounts.users = acc.users;
    rowCounts.signal_rules = sig.rules;
    rowCounts.signal_series_rules = sig.series;
    const findings = runQualityChecks(data, today);

    if (findings.length > 0) {
      await db.insert(dataQualityIssues).values(findings.map((f) => ({ ...f, loadRunId: run.id })));
    }
    // Earlier runs are superseded; keep only the latest register.
    await db.delete(loadRuns).where(eq(loadRuns.status, 'succeeded'));

    await db
      .update(loadRuns)
      .set({
        status: 'succeeded',
        finishedAt: new Date(),
        rowCounts,
        issueCount: findings.length,
        datasetToday: today,
      })
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
