import { asc, desc, eq } from 'drizzle-orm';
import {
  eventLog,
  impactRuns,
  instruments,
  issuerGroups,
  lookthroughLegs,
  marketContext,
  signalRules,
  signalThresholds,
  type Db,
} from '@jb/db';
import type { SignalInputs } from '../domain/signals/build.js';

export interface SavedImpactRun {
  id: string;
  clientId: string;
  snapshotDate: string;
  label: string | null;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: Date;
}

export class SignalRepository {
  constructor(private readonly db: Db) {}

  async inputs(): Promise<SignalInputs> {
    const [events, rules, thresholds, market, inst, issuers, legs] = await Promise.all([
      this.db.select().from(eventLog).orderBy(asc(eventLog.ordinal)),
      this.db.select().from(signalRules),
      this.db.select().from(signalThresholds),
      this.db.select().from(marketContext),
      this.db.select().from(instruments),
      this.db.select().from(issuerGroups),
      this.db.select().from(lookthroughLegs),
    ]);
    return {
      events,
      rules,
      thresholds,
      market,
      instruments: new Map(inst.map((i) => [i.instrumentId, i])),
      issuers: new Map(issuers.map((i) => [i.instrumentId, i.exposureName])),
      lookthrough: legs.map((l) => ({
        instrumentId: l.instrumentId,
        exposureName: l.exposureName,
        sector: l.sector,
        region: l.region,
        weight: l.weight,
      })),
    };
  }

  async runsForClient(clientId: string): Promise<SavedImpactRun[]> {
    return this.db
      .select({
        id: impactRuns.id,
        clientId: impactRuns.clientId,
        snapshotDate: impactRuns.snapshotDate,
        label: impactRuns.label,
        request: impactRuns.request,
        result: impactRuns.result,
        createdAt: impactRuns.createdAt,
      })
      .from(impactRuns)
      .where(eq(impactRuns.clientId, clientId))
      .orderBy(desc(impactRuns.createdAt))
      .limit(50);
  }
}
