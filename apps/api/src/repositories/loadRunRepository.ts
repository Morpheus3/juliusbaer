import { desc, eq } from 'drizzle-orm';
import { loadRuns, type Db } from '@jb/db';

export interface LatestLoadRun {
  id: string;
  loadedAt: Date;
  rowCounts: Record<string, number>;
  issueCount: number;
}

export class LoadRunRepository {
  constructor(private readonly db: Db) {}

  async latestSucceeded(): Promise<LatestLoadRun | null> {
    const [row] = await this.db
      .select({
        id: loadRuns.id,
        finishedAt: loadRuns.finishedAt,
        startedAt: loadRuns.startedAt,
        rowCounts: loadRuns.rowCounts,
        issueCount: loadRuns.issueCount,
      })
      .from(loadRuns)
      .where(eq(loadRuns.status, 'succeeded'))
      .orderBy(desc(loadRuns.startedAt))
      .limit(1);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      loadedAt: row.finishedAt ?? row.startedAt,
      rowCounts: row.rowCounts,
      issueCount: row.issueCount,
    };
  }
}
