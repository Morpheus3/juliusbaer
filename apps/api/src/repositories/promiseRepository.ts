import { promises, referenceDocs, type Db } from '@jb/db';
import { and, asc, eq } from 'drizzle-orm';

export type PromiseRow = typeof promises.$inferSelect;
export type PromiseInsert = typeof promises.$inferInsert;

/** The promise ledger and the one-document reference files. */
export class PromiseRepository {
  constructor(private readonly db: Db) {}

  async forClient(clientId: string): Promise<PromiseRow[]> {
    return this.db
      .select()
      .from(promises)
      .where(eq(promises.clientId, clientId))
      .orderBy(asc(promises.createdAt));
  }

  async open(): Promise<PromiseRow[]> {
    return this.db
      .select()
      .from(promises)
      .where(eq(promises.status, 'open'))
      .orderBy(asc(promises.dueDate));
  }

  async all(): Promise<PromiseRow[]> {
    return this.db.select().from(promises).orderBy(asc(promises.createdAt));
  }

  /** Inserts candidates not seen before (by fingerprint); returns how many were new. */
  async upsert(rows: PromiseInsert[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    const inserted = await this.db
      .insert(promises)
      .values(rows)
      .onConflictDoNothing({ target: promises.fingerprint })
      .returning({ id: promises.id });
    return inserted.length;
  }

  async add(row: PromiseInsert): Promise<PromiseRow> {
    const [r] = await this.db
      .insert(promises)
      .values(row)
      .onConflictDoNothing({ target: promises.fingerprint })
      .returning();
    if (r) {
      return r;
    }
    const [existing] = await this.db
      .select()
      .from(promises)
      .where(eq(promises.fingerprint, row.fingerprint));
    if (!existing) {
      throw new Error('promise insert failed');
    }
    return existing;
  }

  async resolve(id: string, status: 'done' | 'dropped'): Promise<PromiseRow | null> {
    const [r] = await this.db
      .update(promises)
      .set({ status, resolvedAt: new Date() })
      .where(and(eq(promises.id, id), eq(promises.status, 'open')))
      .returning();
    return r ?? null;
  }

  async referenceDoc(id: string): Promise<Record<string, unknown> | null> {
    const [r] = await this.db.select().from(referenceDocs).where(eq(referenceDocs.id, id));
    return r?.doc ?? null;
  }
}
