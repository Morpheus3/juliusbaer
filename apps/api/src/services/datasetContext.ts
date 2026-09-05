import { asc, desc, eq, sql } from 'drizzle-orm';
import type { DatasetMeta } from '@jb/contracts';
import {
  clients,
  loadRuns,
  lookthroughLegs,
  scenarios,
  signalRules,
  snapshots,
  type Db,
} from '@jb/db';

export interface SnapshotInfo {
  date: string;
  ordinal: number;
  label: string;
}

/**
 * What the loaded dataset says about itself: snapshot dates and labels, "today", the covering
 * RM. Read from the database, cached briefly, never hard-coded. An explicit DATASET_TODAY in the
 * environment overrides the data-derived default (the latest snapshot).
 */
export class DatasetContext {
  private cache: { at: number; meta: DatasetMeta } | null = null;

  constructor(
    private readonly db: Db,
    private readonly todayOverride: string | undefined,
    private readonly datasetName: string,
    private readonly ttlMs = 10_000,
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  async meta(): Promise<DatasetMeta> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) {
      return this.cache.meta;
    }
    const [snaps, rmRows, clientRows, lt, sr, sc, run] = await Promise.all([
      this.db.select().from(snapshots).orderBy(asc(snapshots.ordinal)),
      this.db
        .select({
          id: clients.rmId,
          name: clients.rmName,
          desk: clients.rmDesk,
          n: sql<number>`count(*)`,
        })
        .from(clients)
        .groupBy(clients.rmId, clients.rmName, clients.rmDesk)
        .orderBy(desc(sql`count(*)`))
        .limit(1),
      this.db.select({ id: clients.clientId }).from(clients).orderBy(asc(clients.clientId)),
      this.db.select({ n: sql<number>`count(*)` }).from(lookthroughLegs),
      this.db.select({ n: sql<number>`count(*)` }).from(signalRules),
      this.db.select({ n: sql<number>`count(*)` }).from(scenarios),
      this.db
        .select({ today: loadRuns.datasetToday })
        .from(loadRuns)
        .where(eq(loadRuns.status, 'succeeded'))
        .orderBy(desc(loadRuns.startedAt))
        .limit(1),
    ]);
    if (snaps.length === 0) {
      throw new DatasetNotLoadedError();
    }
    const list: SnapshotInfo[] = snaps.map((s) => ({
      date: s.snapshotDate,
      ordinal: s.ordinal,
      label: s.label,
    }));
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) {
      throw new DatasetNotLoadedError();
    }
    const loadedToday = run[0]?.today;
    const today =
      this.todayOverride ??
      (loadedToday && /^\d{4}-\d{2}-\d{2}$/.test(loadedToday) ? loadedToday : last.date);
    const rm = rmRows[0] ?? { id: 'RM', name: 'Relationship Manager', desk: '' };
    const meta: DatasetMeta = {
      datasetName: this.datasetName,
      today,
      snapshots: list,
      baseline: first.date,
      current: last.date,
      clockStart: first.date,
      clockEnd: today,
      rm: { id: rm.id, name: rm.name, desk: rm.desk },
      clientCount: clientRows.length,
      defaultClientId: clientRows[0]?.id ?? null,
      reference: {
        lookthrough: (lt[0]?.n ?? 0) > 0,
        signalRules: (sr[0]?.n ?? 0) > 0,
        scenarios: (sc[0]?.n ?? 0) > 0,
      },
    };
    this.cache = { at: Date.now(), meta };
    return meta;
  }

  async today(): Promise<string> {
    return (await this.meta()).today;
  }

  async snapshotDates(): Promise<string[]> {
    return (await this.meta()).snapshots.map((s) => s.date);
  }

  /** Latest snapshot on or before a date; the baseline when the date precedes every snapshot. */
  async snapshotFor(date: string): Promise<string> {
    const dates = await this.snapshotDates();
    let chosen = dates[0] ?? date;
    for (const d of dates) {
      if (d <= date) {
        chosen = d;
      }
    }
    return chosen;
  }

  async rmId(): Promise<string> {
    return (await this.meta()).rm.id;
  }
}

export class DatasetNotLoadedError extends Error {
  constructor() {
    super('No dataset loaded. Run `npm run db:seed`.');
    this.name = 'DatasetNotLoadedError';
  }
}
