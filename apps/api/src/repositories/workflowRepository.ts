import { and, desc, eq } from 'drizzle-orm';
import { alertTriage, auditEvents, outreach, type Db } from '@jb/db';

export type TriageRow = typeof alertTriage.$inferSelect;
export type OutreachRow = typeof outreach.$inferSelect;

export class WorkflowRepository {
  constructor(private readonly db: Db) {}

  async triageFor(clientId: string): Promise<Map<string, TriageRow>> {
    const rows = await this.db
      .select()
      .from(alertTriage)
      .where(eq(alertTriage.clientId, clientId))
      .orderBy(desc(alertTriage.createdAt));
    const out = new Map<string, TriageRow>();
    for (const r of rows) {
      if (!out.has(r.alertId)) {
        out.set(r.alertId, r);
      }
    }
    return out;
  }

  /** Latest dismissals across the book, for the cockpit. */
  async dismissedAll(): Promise<Set<string>> {
    const rows = await this.db.select().from(alertTriage).orderBy(desc(alertTriage.createdAt));
    const latest = new Map<string, TriageRow>();
    for (const r of rows) {
      const key = `${r.clientId}|${r.alertId}`;
      if (!latest.has(key)) {
        latest.set(key, r);
      }
    }
    return new Set(
      [...latest.values()]
        .filter((r) => r.decision === 'dismissed')
        .map((r) => `${r.clientId}|${r.alertId}`),
    );
  }

  async triage(
    values: typeof alertTriage.$inferInsert,
    audit: typeof auditEvents.$inferInsert,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(alertTriage).values(values);
      await tx.insert(auditEvents).values(audit);
    });
  }

  /** Every outreach row in the book, newest first; the idea desk counts uptake from it. */
  async allOutreach(): Promise<OutreachRow[]> {
    return this.db.select().from(outreach).orderBy(desc(outreach.createdAt));
  }

  async outreachFor(clientId: string): Promise<OutreachRow[]> {
    return this.db
      .select()
      .from(outreach)
      .where(eq(outreach.clientId, clientId))
      .orderBy(desc(outreach.createdAt));
  }

  async outreachById(id: string): Promise<OutreachRow | null> {
    const [row] = await this.db.select().from(outreach).where(eq(outreach.id, id));
    return row ?? null;
  }

  async insertOutreach(
    values: typeof outreach.$inferInsert,
    audit: typeof auditEvents.$inferInsert,
  ): Promise<OutreachRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(outreach).values(values).returning();
      if (!row) {
        throw new Error('failed to store outreach');
      }
      await tx.insert(auditEvents).values(audit);
      return row;
    });
  }

  async markSent(
    id: string,
    subject: string,
    body: string,
    audit: typeof auditEvents.$inferInsert,
  ): Promise<OutreachRow | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(outreach)
        .set({ subject, body, status: 'sent', sentAt: new Date() })
        .where(and(eq(outreach.id, id), eq(outreach.status, 'draft')))
        .returning();
      if (!row) {
        return null;
      }
      await tx.insert(auditEvents).values(audit);
      return row;
    });
  }
}
