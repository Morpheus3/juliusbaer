import type {
  CallPlanEntry,
  CallPlanResponse,
  DeferCallRequest,
  DoneCallRequest,
} from '@jb/contracts';
import {
  buildEntry,
  packDays,
  CALL_PLAN_METHOD,
  type CallPlanClientInput,
} from '../domain/book/callPlan.js';
import { daysBetween } from '../domain/dates.js';
import {
  CALL_DEFERRED,
  CALL_DONE,
  type CallPlanRepository,
} from '../repositories/callPlanRepository.js';
import type { BookService } from './bookService.js';
import type { DatasetContext } from './datasetContext.js';
import type { PromiseService } from './promiseService.js';
import { ClientNotFoundError } from './vectorService.js';

export class InvalidDeferralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDeferralError';
  }
}

/** Whom to call and when, for the whole book at the clock. */
export class CallPlanService {
  constructor(
    private readonly book: BookService,
    private readonly repo: CallPlanRepository,
    private readonly ctx: DatasetContext,
    private readonly promises: PromiseService,
  ) {}

  async plan(clock: string | undefined): Promise<CallPlanResponse> {
    const [per, { policy, source }, marks] = await Promise.all([
      this.book.perClient(clock),
      this.repo.policy(),
      this.repo.marks(),
    ]);
    const at = per.at;
    const overdue = await this.promises.overdueByClient(at);
    const interval = per.prevSnapshot ? daysBetween(per.prevSnapshot, per.snapshot) : null;

    const entries: CallPlanEntry[] = per.rows.map(({ bundle: b, inputs, items }) => {
      const mine = marks.filter((m) => m.clientId === b.client.clientId && m.clock <= at);
      const deferral = [...mine]
        .reverse()
        .find((m) => m.kind === CALL_DEFERRED && m.until !== null);
      const done = [...mine].reverse().find((m) => m.kind === CALL_DONE && m.clock === at);
      const holdingsNow = b.holdings.filter((h) => h.snapshotDate === per.snapshot);
      const input: CallPlanClientInput = {
        clientId: b.client.clientId,
        clientName: b.client.clientName,
        wealthBand: b.client.wealthBand,
        countryOfResidence: b.client.countryOfResidence,
        reportingLanguage: b.client.reportingLanguage,
        aumUsd: holdingsNow.reduce((s, h) => s + h.marketValueUsd, 0),
        items,
        ltvTrend: inputs.ltvTrend,
        snapshotIntervalDays: interval,
        notes: b.notes
          .filter((n) => n.noteDate <= at)
          .map((n) => ({ date: n.noteDate, channel: n.channel, text: n.note })),
        kycReviewDue: b.client.kycReviewDue,
        clientSince: b.client.clientSince,
        deferral: deferral?.until
          ? {
              until: deferral.until,
              reason: deferral.reason ?? '',
              at: deferral.at,
              madeAtClock: deferral.clock,
            }
          : null,
        doneAtClock: done ? done.clock : null,
        overduePromises: overdue.get(b.client.clientId) ?? 0,
      };
      return buildEntry(input, { clock: at, policy });
    });

    const aumBy = new Map(per.rows.map((r) => [r.bundle.client.clientId, r.items.length]));
    entries.sort(
      (a, b) =>
        b.priority - a.priority || (aumBy.get(b.clientId) ?? 0) - (aumBy.get(a.clientId) ?? 0),
    );
    packDays(entries, at, policy);
    entries.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) ||
        (a.dueBy < b.dueBy ? -1 : a.dueBy > b.dueBy ? 1 : 0) ||
        b.priority - a.priority,
    );
    const planDay = entries.find((e) => e.status === 'planned' && e.kind === 'call')?.day ?? at;
    const today = entries.filter(
      (e) => e.status === 'planned' && e.kind === 'call' && e.day === planDay,
    );
    return {
      clock: at,
      planDay,
      rmTimezone: policy.rmHours.timezone,
      capacity: {
        conversationsPerDay: policy.capacity.conversationsPerDay,
        plannedToday: today.length,
        minutesToday: today.reduce((s, e) => s + e.minutes, 0),
      },
      entries,
      policySource: source,
      policy,
      method: CALL_PLAN_METHOD,
    };
  }

  async defer(clientId: string, req: DeferCallRequest, clock: string | undefined): Promise<void> {
    const meta = await this.ctx.meta();
    const at = clock && clock < meta.today ? clock : meta.today;
    if (req.until <= at) {
      throw new InvalidDeferralError(`until must be after the clock date ${at}`);
    }
    await this.assertClient(clientId);
    await this.repo.record({
      kind: CALL_DEFERRED,
      actor: meta.rm.id,
      clientId,
      entityType: 'call',
      entityId: clientId,
      summary: `Call deferred to ${req.until}: ${req.reason}`,
      payload: { clock: at, until: req.until, reason: req.reason },
    });
  }

  async done(clientId: string, req: DoneCallRequest, clock: string | undefined): Promise<void> {
    const meta = await this.ctx.meta();
    const at = clock && clock < meta.today ? clock : meta.today;
    await this.assertClient(clientId);
    await this.repo.record({
      kind: CALL_DONE,
      actor: meta.rm.id,
      clientId,
      entityType: 'call',
      entityId: clientId,
      summary: `Call marked done${req.note ? `: ${req.note}` : ''}`,
      payload: { clock: at, ...(req.note ? { note: req.note } : {}) },
    });
  }

  private async assertClient(clientId: string): Promise<void> {
    const per = await this.book.perClient(undefined);
    if (!per.rows.some((r) => r.bundle.client.clientId === clientId)) {
      throw new ClientNotFoundError(clientId);
    }
  }
}

const rank = (e: CallPlanEntry): number =>
  e.status === 'planned' && e.kind === 'call'
    ? 0
    : e.kind === 'schedule' && e.status === 'planned'
      ? 1
      : e.status === 'deferred'
        ? 2
        : 3;
