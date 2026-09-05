import { desc, eq } from 'drizzle-orm';
import { actionDecisions, auditEvents, type Db } from '@jb/db';

export type DecisionRow = typeof actionDecisions.$inferSelect;

export class DecisionRepository {
  constructor(private readonly db: Db) {}

  /** Latest decision per action id for a client. */
  async latestForClient(clientId: string): Promise<Map<string, DecisionRow>> {
    const rows = await this.db
      .select()
      .from(actionDecisions)
      .where(eq(actionDecisions.clientId, clientId))
      .orderBy(desc(actionDecisions.createdAt));
    const out = new Map<string, DecisionRow>();
    for (const r of rows) {
      if (!out.has(r.actionId)) {
        out.set(r.actionId, r);
      }
    }
    return out;
  }

  async record(
    values: typeof actionDecisions.$inferInsert,
    audit: typeof auditEvents.$inferInsert,
  ): Promise<DecisionRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(actionDecisions).values(values).returning();
      if (!row) {
        throw new Error('failed to store decision');
      }
      await tx.insert(auditEvents).values(audit);
      return row;
    });
  }
}
