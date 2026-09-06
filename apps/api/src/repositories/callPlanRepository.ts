import { CallPolicy } from '@jb/contracts';
import { auditEvents, callPolicy, type Db } from '@jb/db';
import { asc, inArray } from 'drizzle-orm';

export const CALL_DEFERRED = 'CALL_DEFERRED';
export const CALL_DONE = 'CALL_DONE';

export interface CallMark {
  kind: typeof CALL_DEFERRED | typeof CALL_DONE;
  clientId: string;
  actor: string;
  at: string;
  /** Dataset clock at which the RM acted. */
  clock: string;
  until: string | null;
  reason: string | null;
}

/** Policy document and the RM's defer / done marks, which are append-only audit events. */
export class CallPlanRepository {
  constructor(private readonly db: Db) {}

  async policy(): Promise<{ policy: CallPolicy; source: 'reference' | 'defaults' }> {
    const rows = await this.db.select().from(callPolicy);
    const doc = rows[0]?.policy;
    if (!doc) {
      return { policy: CallPolicy.parse({}), source: 'defaults' };
    }
    return { policy: CallPolicy.parse(doc), source: 'reference' };
  }

  /** All marks oldest first; the service keeps the latest that applies at the clock. */
  async marks(): Promise<CallMark[]> {
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(inArray(auditEvents.kind, [CALL_DEFERRED, CALL_DONE]))
      .orderBy(asc(auditEvents.createdAt));
    return rows.flatMap((r) => {
      if (!r.clientId) {
        return [];
      }
      const p = r.payload;
      const clock = typeof p.clock === 'string' ? p.clock : null;
      if (!clock) {
        return [];
      }
      return [
        {
          kind: r.kind as CallMark['kind'],
          clientId: r.clientId,
          actor: r.actor,
          at: r.createdAt.toISOString(),
          clock,
          until: typeof p.until === 'string' ? p.until : null,
          reason: typeof p.reason === 'string' ? p.reason : null,
        },
      ];
    });
  }

  async record(event: typeof auditEvents.$inferInsert): Promise<void> {
    await this.db.insert(auditEvents).values(event);
  }
}
