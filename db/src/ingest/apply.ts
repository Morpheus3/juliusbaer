/**
 * Incremental apply: validated messages become upserts, snapshot appends and dated assignments in
 * raw.*, with a change_log row per affected client and a load_runs row per batch. Messages land in
 * ingest.staging_messages first; a bad one stays there as rejected and never reaches raw. The same
 * function serves the batch adapter and the Kafka consumer.
 */
import {
  AssignmentPayload,
  CashNeedDeletePayload,
  ClientRow,
  CommitmentRow,
  CreditFacilityRow,
  EventLogRow,
  FacilitySnapshotPayload,
  HoldingsSnapshotPayload,
  InstrumentRow,
  MandateRow,
  MarketContextSnapshotPayload,
  OffboardPayload,
  PlannedCashNeedRow,
  PortfolioRow,
  PricesSnapshotPayload,
  RmNoteRow,
  RmPayload,
  TeamPayload,
  TransactionRow,
  parseMessage,
  type Envelope,
} from '@jb/contracts';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { Db } from '../client.js';
import * as s from '../schema/index.js';
import {
  mapCashNeed,
  mapClient,
  mapCommitment,
  mapEvent,
  mapFacility,
  mapHolding,
  mapInstrument,
  mapMandate,
  mapMarketContext,
  mapNote,
  mapPortfolio,
  mapTransaction,
} from '../seed/mappers.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface ApplyResult {
  loadRunId: string;
  received: number;
  applied: number;
  duplicates: number;
  rejected: { key: string; error: string }[];
  changedClients: string[];
  byType: Record<string, number>;
}

interface Change {
  clientId: string | null;
  entity: string;
  entityId: string;
  kind: 'insert' | 'update' | 'delete' | 'snapshot' | 'assignment';
}

/** Applies a batch of raw messages. Each message is its own transaction so one bad row cannot poison the batch. */
export async function applyMessages(
  db: Db,
  rawMessages: unknown[],
  opts: { topic?: string; source?: string } = {},
): Promise<ApplyResult> {
  const [run] = await db
    .insert(s.loadRuns)
    .values({
      status: 'running',
      mode: 'incremental',
      datasetToday: '',
      sourceDir: opts.source ?? 'messages',
    })
    .returning({ id: s.loadRuns.id });
  const loadRunId = run?.id ?? '';
  const result: ApplyResult = {
    loadRunId,
    received: rawMessages.length,
    applied: 0,
    duplicates: 0,
    rejected: [],
    changedClients: [],
    byType: {},
  };
  const changed = new Set<string>();

  for (const raw of rawMessages) {
    let env: Envelope;
    try {
      env = parseMessage(raw);
    } catch (err) {
      const key =
        typeof raw === 'object' && raw !== null && 'key' in raw && typeof raw.key === 'string'
          ? raw.key
          : `invalid-${Date.now()}-${result.rejected.length}`;
      const error = describe(err);
      await db.execute(sql`
        INSERT INTO ingest.staging_messages (topic, type, idempotency_key, payload, status, error, load_run_id)
        VALUES (${opts.topic ?? 'batch'}, ${typeof raw === 'object' && raw !== null && 'type' in raw ? String(raw.type) : 'unknown'}, ${key}, ${JSON.stringify(raw ?? {})}::jsonb, 'rejected', ${error}, ${loadRunId}::uuid)
        ON CONFLICT (idempotency_key) DO UPDATE SET error = excluded.error, load_run_id = excluded.load_run_id
          WHERE ingest.staging_messages.status = 'rejected'`);
      result.rejected.push({ key, error });
      continue;
    }
    // New keys are inserted; a key rejected earlier is revived and retried; an applied key is a duplicate.
    const staged = await db.execute<{ id: string }>(sql`
      INSERT INTO ingest.staging_messages (topic, type, idempotency_key, payload, status, load_run_id)
      VALUES (${opts.topic ?? 'batch'}, ${env.type}, ${env.key}, ${JSON.stringify(env)}::jsonb, 'received', ${loadRunId}::uuid)
      ON CONFLICT (idempotency_key) DO UPDATE
        SET status = 'received', error = NULL, load_run_id = excluded.load_run_id, payload = excluded.payload
        WHERE ingest.staging_messages.status = 'rejected'
      RETURNING id`);
    if (staged.rows.length === 0) {
      result.duplicates += 1;
      continue;
    }
    const stagedId = staged.rows[0]?.id ?? '';
    try {
      const changes = await db.transaction((tx) => applyOne(tx, env));
      for (const c of changes) {
        await db.insert(s.changeLog).values({ ...c, loadRunId });
        if (c.clientId) {
          changed.add(c.clientId);
        }
      }
      await db
        .update(s.stagingMessages)
        .set({ status: 'applied', appliedAt: new Date() })
        .where(sql`${s.stagingMessages.id} = ${stagedId}`);
      result.applied += 1;
      result.byType[env.type] = (result.byType[env.type] ?? 0) + 1;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await db
        .update(s.stagingMessages)
        .set({ status: 'rejected', error })
        .where(sql`${s.stagingMessages.id} = ${stagedId}`);
      result.rejected.push({ key: env.key, error });
    }
  }
  result.changedClients = [...changed];
  const today = await db.execute<{ d: string | null }>(
    sql`SELECT max(snapshot_date)::text AS d FROM raw.snapshots`,
  );
  await db
    .update(s.loadRuns)
    .set({
      // A batch fails only when nothing was applied or recognised; duplicates are a healthy outcome.
      status:
        result.rejected.length > 0 && result.applied + result.duplicates === 0
          ? 'failed'
          : 'succeeded',
      finishedAt: new Date(),
      datasetToday: today.rows[0]?.d ?? '',
      rowCounts: {
        received: result.received,
        applied: result.applied,
        duplicates: result.duplicates,
        rejected: result.rejected.length,
        ...result.byType,
      },
      issueCount: result.rejected.length,
    })
    .where(sql`${s.loadRuns.id} = ${loadRunId}`);
  return result;
}

async function ensureSnapshot(tx: Tx, date: string, label?: string): Promise<void> {
  await tx.execute(sql`
    INSERT INTO raw.snapshots (snapshot_date, ordinal, label)
    SELECT ${date}::date, coalesce((SELECT max(ordinal) FROM raw.snapshots), -1) + 1, ${label ?? date}
    WHERE NOT EXISTS (SELECT 1 FROM raw.snapshots WHERE snapshot_date = ${date}::date)`);
}

async function applyOne(tx: Tx, env: Envelope): Promise<Change[]> {
  const p = env.payload;
  switch (env.type) {
    case 'client.upsert.v1': {
      const c = ClientRow.parse(p);
      const row = mapClient(c);
      await tx
        .insert(s.clients)
        .values(row)
        .onConflictDoUpdate({ target: s.clients.clientId, set: row });
      // Keep the RM model in step with the denormalised columns.
      await tx.execute(
        sql`INSERT INTO raw.rms (rm_id, name, desk) VALUES (${c.rm_id}, ${c.rm_name}, ${c.rm_desk}) ON CONFLICT (rm_id) DO NOTHING`,
      );
      await tx.execute(sql`
        INSERT INTO raw.rm_assignments (client_id, rm_id, role, valid_from, source, reason)
        SELECT ${c.client_id}, ${c.rm_id}, 'primary', ${c.client_since}::date, ${env.source}, 'primary RM on the client record'
        WHERE NOT EXISTS (SELECT 1 FROM raw.rm_assignments a WHERE a.client_id = ${c.client_id} AND a.rm_id = ${c.rm_id} AND a.role = 'primary' AND a.valid_to IS NULL)`);
      return [{ clientId: c.client_id, entity: 'client', entityId: c.client_id, kind: 'update' }];
    }
    case 'client.offboard.v1': {
      const o = OffboardPayload.parse(p);
      await tx.execute(
        sql`UPDATE raw.rm_assignments SET valid_to = current_date, reason = coalesce(${o.reason ?? null}, reason) WHERE client_id = ${o.clientId} AND valid_to IS NULL`,
      );
      return [{ clientId: o.clientId, entity: 'client', entityId: o.clientId, kind: 'delete' }];
    }
    case 'rm.upsert.v1': {
      const r = RmPayload.parse(p);
      await tx
        .insert(s.rms)
        .values({
          rmId: r.rmId,
          name: r.name,
          desk: r.desk,
          teamId: r.teamId ?? null,
          email: r.email ?? null,
          status: r.status,
        })
        .onConflictDoUpdate({
          target: s.rms.rmId,
          set: {
            name: r.name,
            desk: r.desk,
            teamId: r.teamId ?? null,
            email: r.email ?? null,
            status: r.status,
          },
        });
      await tx
        .insert(s.users)
        .values({
          subject: r.rmId,
          displayName: r.name,
          email: r.email ?? null,
          rmId: r.rmId,
          status: r.status,
        })
        .onConflictDoUpdate({
          target: s.users.subject,
          set: { displayName: r.name, rmId: r.rmId, status: r.status },
        });
      await tx.execute(
        sql`INSERT INTO access.user_roles (user_id, role) SELECT user_id, 'rm' FROM access.users WHERE subject = ${r.rmId} ON CONFLICT DO NOTHING`,
      );
      return [{ clientId: null, entity: 'rm', entityId: r.rmId, kind: 'update' }];
    }
    case 'team.upsert.v1': {
      const t = TeamPayload.parse(p);
      await tx
        .insert(s.teams)
        .values({ teamId: t.teamId, name: t.name, desk: t.desk, headRmId: t.headRmId ?? null })
        .onConflictDoUpdate({
          target: s.teams.teamId,
          set: { name: t.name, desk: t.desk, headRmId: t.headRmId ?? null },
        });
      return [{ clientId: null, entity: 'team', entityId: t.teamId, kind: 'update' }];
    }
    case 'rm.assignment.v1': {
      const a = AssignmentPayload.parse(p);
      if (a.role === 'primary') {
        // One open primary per client: close the previous one the day before the new one starts.
        await tx.execute(
          sql`UPDATE raw.rm_assignments SET valid_to = (${a.validFrom}::date - 1) WHERE client_id = ${a.clientId} AND role = 'primary' AND valid_to IS NULL AND rm_id <> ${a.rmId}`,
        );
        await tx.execute(
          sql`UPDATE raw.clients c SET rm_id = r.rm_id, rm_name = r.name, rm_desk = r.desk FROM raw.rms r WHERE r.rm_id = ${a.rmId} AND c.client_id = ${a.clientId}`,
        );
      }
      await tx.execute(sql`
        INSERT INTO raw.rm_assignments (client_id, rm_id, role, valid_from, valid_to, source, reason)
        SELECT ${a.clientId}, ${a.rmId}, ${a.role}, ${a.validFrom}::date, ${a.validTo ?? null}::date, ${env.source}, ${a.reason ?? null}
        WHERE NOT EXISTS (SELECT 1 FROM raw.rm_assignments x WHERE x.client_id = ${a.clientId} AND x.rm_id = ${a.rmId} AND x.role = ${a.role} AND x.valid_to IS NULL)`);
      return [
        {
          clientId: a.clientId,
          entity: 'assignment',
          entityId: `${a.clientId}:${a.rmId}:${a.role}`,
          kind: 'assignment',
        },
      ];
    }
    case 'portfolio.upsert.v1': {
      const row = mapPortfolio(PortfolioRow.parse(p));
      await tx
        .insert(s.portfolios)
        .values(row)
        .onConflictDoUpdate({ target: s.portfolios.portfolioId, set: row });
      return [
        { clientId: row.clientId, entity: 'portfolio', entityId: row.portfolioId, kind: 'update' },
      ];
    }
    case 'mandate.upsert.v1': {
      const row = mapMandate(MandateRow.parse(p));
      await tx
        .insert(s.mandates)
        .values(row)
        .onConflictDoUpdate({ target: [s.mandates.mandateCode, s.mandates.assetClass], set: row });
      return [
        {
          clientId: null,
          entity: 'mandate',
          entityId: `${row.mandateCode}:${row.assetClass}`,
          kind: 'update',
        },
      ];
    }
    case 'instrument.upsert.v1': {
      const row = mapInstrument(InstrumentRow.parse(p));
      await tx
        .insert(s.instruments)
        .values(row)
        .onConflictDoUpdate({ target: s.instruments.instrumentId, set: row });
      return [{ clientId: null, entity: 'instrument', entityId: row.instrumentId, kind: 'update' }];
    }
    case 'holdings.snapshot.v1': {
      const h = HoldingsSnapshotPayload.parse(p);
      await ensureSnapshot(tx, h.snapshotDate, h.label);
      await tx.execute(
        sql`DELETE FROM raw.holdings WHERE client_id = ${h.clientId} AND snapshot_date = ${h.snapshotDate}::date`,
      );
      if (h.holdings.length) {
        await tx.insert(s.holdings).values(h.holdings.map(mapHolding));
      }
      for (const a of h.portfolioAum) {
        await tx.execute(
          sql`INSERT INTO raw.portfolio_aum (portfolio_id, snapshot_date, aum_base) VALUES (${a.portfolioId}, ${h.snapshotDate}::date, ${a.aumBase}) ON CONFLICT (portfolio_id, snapshot_date) DO UPDATE SET aum_base = excluded.aum_base`,
        );
      }
      return [
        {
          clientId: h.clientId,
          entity: 'holdings',
          entityId: `${h.clientId}@${h.snapshotDate}`,
          kind: 'snapshot',
        },
      ];
    }
    case 'prices.snapshot.v1': {
      const pr = PricesSnapshotPayload.parse(p);
      await ensureSnapshot(tx, pr.snapshotDate);
      for (const x of pr.prices) {
        await tx.execute(
          sql`INSERT INTO raw.instrument_prices (instrument_id, snapshot_date, price_local) VALUES (${x.instrumentId}, ${pr.snapshotDate}::date, ${x.priceLocal}) ON CONFLICT (instrument_id, snapshot_date) DO UPDATE SET price_local = excluded.price_local`,
        );
      }
      return [{ clientId: null, entity: 'prices', entityId: pr.snapshotDate, kind: 'snapshot' }];
    }
    case 'facility_snapshot.v1': {
      const f = FacilitySnapshotPayload.parse(p);
      await ensureSnapshot(tx, f.snapshotDate);
      await tx.execute(sql`
        INSERT INTO raw.credit_facility_snapshots (facility_id, snapshot_date, drawn, collateral_market_value, lending_value, ltv_pct, headroom)
        VALUES (${f.facilityId}, ${f.snapshotDate}::date, ${f.drawn}, ${f.collateralMarketValue}, ${f.lendingValue}, ${f.ltvPct}, ${f.headroom})
        ON CONFLICT (facility_id, snapshot_date) DO UPDATE SET drawn = excluded.drawn, collateral_market_value = excluded.collateral_market_value, lending_value = excluded.lending_value, ltv_pct = excluded.ltv_pct, headroom = excluded.headroom`);
      const owner = await tx.execute<{ client_id: string }>(
        sql`SELECT client_id FROM raw.credit_facilities WHERE facility_id = ${f.facilityId}`,
      );
      return [
        {
          clientId: owner.rows[0]?.client_id ?? null,
          entity: 'facility_snapshot',
          entityId: `${f.facilityId}@${f.snapshotDate}`,
          kind: 'snapshot',
        },
      ];
    }
    case 'transaction.v1': {
      const row = mapTransaction(TransactionRow.parse(p));
      await tx
        .insert(s.transactions)
        .values(row)
        .onConflictDoUpdate({ target: s.transactions.transactionId, set: row });
      return [
        {
          clientId: row.clientId,
          entity: 'transaction',
          entityId: row.transactionId,
          kind: 'insert',
        },
      ];
    }
    case 'credit_facility.upsert.v1': {
      const row = mapFacility(CreditFacilityRow.parse(p));
      await tx
        .insert(s.creditFacilities)
        .values(row)
        .onConflictDoUpdate({ target: s.creditFacilities.facilityId, set: row });
      return [
        {
          clientId: row.clientId,
          entity: 'credit_facility',
          entityId: row.facilityId,
          kind: 'update',
        },
      ];
    }
    case 'commitment.upsert.v1': {
      const row = mapCommitment(CommitmentRow.parse(p));
      await tx
        .insert(s.commitments)
        .values(row)
        .onConflictDoUpdate({ target: s.commitments.commitmentId, set: row });
      return [
        {
          clientId: row.clientId,
          entity: 'commitment',
          entityId: row.commitmentId,
          kind: 'update',
        },
      ];
    }
    case 'cash_need.upsert.v1': {
      const row = mapCashNeed(PlannedCashNeedRow.parse(p));
      await tx
        .insert(s.plannedCashNeeds)
        .values(row)
        .onConflictDoUpdate({ target: s.plannedCashNeeds.needId, set: row });
      return [
        { clientId: row.clientId, entity: 'cash_need', entityId: row.needId, kind: 'update' },
      ];
    }
    case 'cash_need.delete.v1': {
      const d = CashNeedDeletePayload.parse(p);
      await tx.execute(
        sql`DELETE FROM raw.planned_cash_needs WHERE need_id = ${d.needId} AND client_id = ${d.clientId}`,
      );
      return [{ clientId: d.clientId, entity: 'cash_need', entityId: d.needId, kind: 'delete' }];
    }
    case 'note.v1': {
      const row = mapNote(RmNoteRow.parse(p));
      await tx
        .insert(s.rmNotes)
        .values(row)
        .onConflictDoUpdate({ target: s.rmNotes.noteId, set: row });
      return [{ clientId: row.clientId, entity: 'note', entityId: row.noteId, kind: 'insert' }];
    }
    case 'market_context.snapshot.v1': {
      const m = MarketContextSnapshotPayload.parse(p);
      await ensureSnapshot(tx, m.snapshotDate, m.label);
      for (const row of m.series.map(mapMarketContext)) {
        await tx.execute(
          sql`INSERT INTO raw.market_context (snapshot_date, series_id, series_name, category, unit, value, snapshot_label) VALUES (${row.snapshotDate}::date, ${row.seriesId}, ${row.seriesName}, ${row.category}, ${row.unit}, ${row.value}, ${row.snapshotLabel}) ON CONFLICT (snapshot_date, series_id) DO UPDATE SET value = excluded.value, series_name = excluded.series_name`,
        );
      }
      return [
        { clientId: null, entity: 'market_context', entityId: m.snapshotDate, kind: 'snapshot' },
      ];
    }
    case 'event.v1': {
      const e = EventLogRow.parse(p);
      const next = await tx.execute<{ n: number }>(
        sql`SELECT coalesce(max(ordinal), -1) + 1 AS n FROM raw.event_log`,
      );
      const ordinal = next.rows[0]?.n ?? 0;
      const eventId = typeof p.event_id === 'string' ? p.event_id : undefined;
      const row = mapEvent(e, ordinal, eventId);
      await tx
        .insert(s.eventLog)
        .values(row)
        .onConflictDoUpdate({
          target: s.eventLog.eventId,
          set: {
            description: row.description,
            severity: row.severity,
            primaryTransmission: row.primaryTransmission,
          },
        });
      return [{ clientId: null, entity: 'event', entityId: row.eventId, kind: 'insert' }];
    }
    default: {
      const never: never = env.type;
      throw new Error(`unhandled message type ${String(never)}`);
    }
  }
}

/** One line per problem, path first: "payload.amount: expected string, received number". */
function describe(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues
      .slice(0, 6)
      .map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`)
      .join('; ')
      .concat(err.issues.length > 6 ? ` (+${err.issues.length - 6} more)` : '');
  }
  return err instanceof Error ? err.message : String(err);
}
