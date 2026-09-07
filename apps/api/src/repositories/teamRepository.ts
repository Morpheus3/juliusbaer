import { shadowGrades, type Db } from '@jb/db';
import { sql } from 'drizzle-orm';

export interface OverrideRow {
  clientId: string;
  clientName: string;
  rmId: string;
  dimension: string;
  systemScore: number;
  overrideScore: number;
  reason: string;
  at: string;
}
export interface PendingApproval {
  clientId: string;
  clientName: string;
  rmId: string;
  actionId: string;
  approvedAt: string;
}
export interface ShadowAgreement {
  playbookId: string;
  grades: number;
  agree: number;
}

/**
 * Aggregates for the team head. Every query runs under the caller's scope, so a head sees the team
 * and an admin the bank; an RM calling these sees only their own book.
 */
export class TeamRepository {
  constructor(private readonly db: Db) {}

  async overridesSince(since: string): Promise<OverrideRow[]> {
    const r = await this.db.execute<{
      client_id: string;
      client_name: string;
      rm_id: string;
      dimension: string;
      system_score: number;
      override_score: number;
      reason: string;
      at: string;
    }>(sql`
      SELECT o.client_id, c.client_name, o.rm_id, o.dimension, o.system_score, o.override_score, o.reason, o.created_at::text AS at
      FROM derived.rubric_overrides o JOIN raw.clients c ON c.client_id = o.client_id
      WHERE o.created_at >= ${since}::timestamptz ORDER BY o.created_at DESC LIMIT 50`);
    return r.rows.map((x) => ({
      clientId: x.client_id,
      clientName: x.client_name,
      rmId: x.rm_id,
      dimension: x.dimension,
      systemScore: x.system_score,
      overrideScore: x.override_score,
      reason: x.reason,
      at: x.at,
    }));
  }

  async assessmentsByClient(): Promise<Map<string, number>> {
    const r = await this.db.execute<{ client_id: string; n: number }>(
      sql`SELECT client_id, count(*)::int AS n FROM derived.rubric_assessments GROUP BY client_id`,
    );
    return new Map(r.rows.map((x) => [x.client_id, x.n]));
  }

  /** Actions the RM approved that no checker has decided yet. */
  async pendingApprovals(): Promise<PendingApproval[]> {
    const r = await this.db.execute<{
      client_id: string;
      client_name: string;
      rm_id: string;
      action_id: string;
      approved_at: string;
    }>(sql`
      SELECT d.client_id, c.client_name, c.rm_id, d.action_id, d.created_at::text AS approved_at
      FROM derived.action_decisions d
      JOIN raw.clients c ON c.client_id = d.client_id
      WHERE d.entity_type = 'action' AND d.decision = 'approved'
        AND NOT EXISTS (SELECT 1 FROM derived.action_decisions k WHERE k.action_id = 'check:' || d.action_id AND k.client_id = d.client_id)
        AND d.created_at = (SELECT max(x.created_at) FROM derived.action_decisions x WHERE x.action_id = d.action_id AND x.client_id = d.client_id)
      ORDER BY d.created_at ASC`);
    return r.rows.map((x) => ({
      clientId: x.client_id,
      clientName: x.client_name,
      rmId: x.rm_id,
      actionId: x.action_id,
      approvedAt: x.approved_at,
    }));
  }

  async tracesToday(): Promise<{
    calls: number;
    errors: number;
    byPrompt: { promptId: string; count: number }[];
  }> {
    const r = await this.db.execute<{ prompt_id: string; n: number; errors: number }>(sql`
      SELECT prompt_id, count(*)::int AS n, count(error)::int AS errors
      FROM derived.llm_traces WHERE created_at >= date_trunc('day', now()) GROUP BY prompt_id ORDER BY n DESC`);
    return {
      calls: r.rows.reduce((s, x) => s + x.n, 0),
      errors: r.rows.reduce((s, x) => s + x.errors, 0),
      byPrompt: r.rows.map((x) => ({ promptId: x.prompt_id, count: x.n })),
    };
  }

  async auditCountsToday(): Promise<Map<string, number>> {
    const r = await this.db.execute<{ kind: string; n: number }>(
      sql`SELECT kind, count(*)::int AS n FROM derived.audit_events WHERE created_at >= date_trunc('day', now()) GROUP BY kind`,
    );
    return new Map(r.rows.map((x) => [x.kind, x.n]));
  }

  async shadowAgreement(): Promise<ShadowAgreement[]> {
    const r = await this.db.execute<{ playbook_id: string; grades: number; agree: number }>(sql`
      SELECT playbook_id, count(*)::int AS grades, count(*) FILTER (WHERE grade = 'agree')::int AS agree
      FROM derived.shadow_grades GROUP BY playbook_id`);
    return r.rows.map((x) => ({
      playbookId: x.playbook_id,
      grades: x.grades,
      agree: x.agree,
    }));
  }

  async addShadowGrade(row: typeof shadowGrades.$inferInsert): Promise<void> {
    await this.db.insert(shadowGrades).values(row);
  }

  /** Management-fee transactions this calendar year, per client, as the revenue proxy. */
  async feesYtdByClient(year: string): Promise<Map<string, number>> {
    const r = await this.db.execute<{ client_id: string; fees: number }>(sql`
      SELECT client_id, coalesce(sum(abs(amount)), 0)::float AS fees FROM raw.transactions
      WHERE transaction_type = 'Management Fee' AND trade_date >= (${year} || '-01-01')::date GROUP BY client_id`);
    return new Map(r.rows.map((x) => [x.client_id, x.fees]));
  }

  async explainabilitySample(
    limit: number,
  ): Promise<
    { clientId: string; clientName: string; kind: string; summary: string; at: string }[]
  > {
    const r = await this.db.execute<{
      client_id: string;
      client_name: string;
      kind: string;
      summary: string;
      at: string;
    }>(sql`
      SELECT a.client_id, c.client_name, a.kind, a.summary, a.created_at::text AS at
      FROM derived.audit_events a JOIN raw.clients c ON c.client_id = a.client_id
      WHERE a.kind IN ('RUBRIC_ASSESSED', 'ACTION_APPROVED', 'OUTREACH_DRAFTED', 'ASSISTANT_CONFIRMED')
      ORDER BY random() LIMIT ${limit}`);
    return r.rows.map((x) => ({
      clientId: x.client_id,
      clientName: x.client_name,
      kind: x.kind,
      summary: x.summary,
      at: x.at,
    }));
  }
}
