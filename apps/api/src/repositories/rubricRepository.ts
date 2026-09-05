import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  auditEvents,
  clients,
  dataQualityIssues,
  loadRuns,
  rubricAssessments,
  rubricOverrides,
  type Db,
} from '@jb/db';

export type AssessmentRow = typeof rubricAssessments.$inferSelect;
export type OverrideRow = typeof rubricOverrides.$inferSelect;
export type AuditRow = typeof auditEvents.$inferSelect;

export class RubricRepository {
  constructor(private readonly db: Db) {}

  async latest(clientId: string): Promise<AssessmentRow | null> {
    const [row] = await this.db
      .select()
      .from(rubricAssessments)
      .where(eq(rubricAssessments.clientId, clientId))
      .orderBy(desc(rubricAssessments.createdAt))
      .limit(1);
    return row ?? null;
  }

  async latestForAll(): Promise<AssessmentRow[]> {
    const rows = await this.db
      .select()
      .from(rubricAssessments)
      .orderBy(desc(rubricAssessments.createdAt));
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.clientId) ? false : (seen.add(r.clientId), true)));
  }

  async insert(values: typeof rubricAssessments.$inferInsert): Promise<AssessmentRow> {
    const [row] = await this.db.insert(rubricAssessments).values(values).returning();
    if (!row) {
      throw new Error('failed to store assessment');
    }
    return row;
  }

  async lock(id: string, by: string): Promise<AssessmentRow | null> {
    const [row] = await this.db
      .update(rubricAssessments)
      .set({ status: 'locked', lockedAt: new Date(), lockedBy: by })
      .where(eq(rubricAssessments.id, id))
      .returning();
    return row ?? null;
  }

  async overrides(assessmentId: string): Promise<OverrideRow[]> {
    return this.db
      .select()
      .from(rubricOverrides)
      .where(eq(rubricOverrides.assessmentId, assessmentId))
      .orderBy(desc(rubricOverrides.createdAt));
  }

  async addOverride(values: typeof rubricOverrides.$inferInsert): Promise<OverrideRow> {
    const [row] = await this.db.insert(rubricOverrides).values(values).returning();
    if (!row) {
      throw new Error('failed to store override');
    }
    return row;
  }

  async audit(values: typeof auditEvents.$inferInsert): Promise<void> {
    await this.db.insert(auditEvents).values(values);
  }

  async auditFor(clientId: string | undefined, kinds?: string[]): Promise<AuditRow[]> {
    const conds = [];
    if (clientId) {
      conds.push(eq(auditEvents.clientId, clientId));
    }
    if (kinds?.length) {
      conds.push(inArray(auditEvents.kind, kinds));
    }
    const q = this.db.select().from(auditEvents);
    return (conds.length ? q.where(and(...conds)) : q)
      .orderBy(desc(auditEvents.createdAt))
      .limit(200);
  }

  /** Data-quality penalty inputs: issue counts for the client from the latest load. */
  async qualityCounts(clientId: string): Promise<{ errors: number; warnings: number }> {
    const [run] = await this.db
      .select({ id: loadRuns.id })
      .from(loadRuns)
      .where(eq(loadRuns.status, 'succeeded'))
      .orderBy(desc(loadRuns.startedAt))
      .limit(1);
    if (!run) {
      return { errors: 0, warnings: 0 };
    }
    const rows = await this.db
      .select({ severity: dataQualityIssues.severity })
      .from(dataQualityIssues)
      .where(
        and(eq(dataQualityIssues.loadRunId, run.id), eq(dataQualityIssues.clientId, clientId)),
      );
    return {
      errors: rows.filter((r) => r.severity === 'error').length,
      warnings: rows.filter((r) => r.severity === 'warning').length,
    };
  }

  async clientNames(): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ id: clients.clientId, name: clients.clientName })
      .from(clients);
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
