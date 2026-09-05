import type {
  BoardResponse,
  BookClientRow,
  BookResponse,
  HorizonItem,
  Theme,
  Urgency,
} from '@jb/contracts';
import { AssetClassSchema } from '@jb/contracts';
import { deriveAlerts } from '../domain/alerts.js';
import { buildItems, urgencyScore, type LaneInputs } from '../domain/book/horizon.js';
import { cashflows } from '../domain/cashflows.js';
import { daysBetween, round2 } from '../domain/dates.js';
import { exposure } from '../domain/exposure.js';
import { mandateStatus } from '../domain/mandate.js';
import { buildSignals, snapshotForClock } from '../domain/signals/build.js';
import type {
  ClientBundle,
  ClientDetailRepository,
} from '../repositories/clientDetailRepository.js';
import type { ClientRepository } from '../repositories/clientRepository.js';
import type { RubricRepository } from '../repositories/rubricRepository.js';
import type { SignalRepository } from '../repositories/signalRepository.js';
import type { DatasetContext } from './datasetContext.js';

const METHOD = [
  'Alerts are derived from data for every client at the clock date; each is placed in a lane by its deadline and by its trend across snapshots (margin-call headroom falling, mandate breach widening).',
  'The same computation runs at the previous snapshot; an item that moved up a lane is marked escalated, one that appears for the first time is marked new.',
  'Signal items come from the most exposed high or severe signal of the last 30 days; severe signals reaching 20% or more of a household go to Now.',
  'Client urgency = Σ lane weight (Now 3, week 2, month 1) × severity weight (high 3, medium 2, low 1) + 1 per new or escalated item. Ties break by AUM.',
  'No language model is involved in the cockpit; every card links to the screen where its numbers live.',
];

const BOARD_METHOD = [
  'Weights are the sum of holding weights per asset class at the snapshot, compared with the mandate band. Custody accounts are shown but not measured.',
  'Trend compares the deviation from the band with the previous snapshot: worsening if it grew by more than half a point, improving if it shrank, else flat.',
  'Breach type reads the RM notes: a note mentioning a waiver marks the portfolio waived; one describing a client instruction or confirmation marks it client-directed; otherwise the breach is drift.',
  'A facility is "cured by market" when its LTV was above the trigger at one snapshot and below at the next with the drawn amount unchanged; "cured by action" when the drawn amount fell.',
];

export class BookService {
  constructor(
    private readonly clients: ClientRepository,
    private readonly detail: ClientDetailRepository,
    private readonly signals: SignalRepository,
    private readonly rubric: RubricRepository,
    private readonly ctx: DatasetContext,
  ) {}

  private async bundles(): Promise<ClientBundle[]> {
    const rows = await this.clients.listAll();
    const all = await Promise.all(rows.map((r) => this.detail.bundle(r.clientId)));
    return all.filter((b): b is ClientBundle => b !== null);
  }

  async cockpit(clock: string | undefined): Promise<BookResponse> {
    const meta = await this.ctx.meta();
    const at = clock && clock < meta.today ? clock : meta.today;
    const [bundles, inputs, rubrics] = await Promise.all([
      this.bundles(),
      this.signals.inputs(),
      this.rubric.latestForAll(),
    ]);
    const dates = inputs.snapshots;
    const snapshot = snapshotForClock(dates, at);
    const idx = dates.indexOf(snapshot);
    const prevSnapshot = idx > 0 ? (dates[idx - 1] ?? null) : null;
    const rubricBy = new Map(rubrics.map((r) => [r.clientId, r]));

    const items: HorizonItem[] = [];
    const clientRows: BookClientRow[] = [];
    let clientsInBreach = 0;
    let facilitiesNearTrigger = 0;
    let kycOverdue = 0;
    let kycDueSoon = 0;
    let aum = 0;
    let aumBase = 0;

    for (const b of bundles) {
      const nowInputs = laneInputs(b, inputs, at, snapshot, prevSnapshot);
      let previous: Map<string, Urgency> | null = null;
      if (prevSnapshot) {
        const prevPrev = idx > 1 ? (dates[idx - 2] ?? null) : null;
        const prevItems = buildItems(
          laneInputs(b, inputs, prevSnapshot, prevSnapshot, prevPrev),
          null,
          '/clients',
        );
        previous = new Map(prevItems.map((i) => [i.id, i.lane]));
      }
      const mine = buildItems(nowInputs, previous, '/clients');
      items.push(...mine);

      const holdingsNow = b.holdings.filter((h) => h.snapshotDate === snapshot);
      const clientAum = holdingsNow.reduce((s, h) => s + h.marketValueUsd, 0);
      const clientBase = b.holdings
        .filter((h) => h.snapshotDate === dates[0])
        .reduce((s, h) => s + h.marketValueUsd, 0);
      aum += clientAum;
      aumBase += clientBase;
      if (nowInputs.alerts.some((a) => a.kind === 'MANDATE_BREACH')) {
        clientsInBreach += 1;
      }
      facilitiesNearTrigger += nowInputs.ltvTrend.filter((t) => t.headroomNow < 5).length;
      const kycDays = daysBetween(at, b.client.kycReviewDue);
      if (kycDays < 0) {
        kycOverdue += 1;
      } else if (kycDays <= 45) {
        kycDueSoon += 1;
      }
      const r = rubricBy.get(b.client.clientId);
      const stored = r
        ? (r.result as {
            dimensions: { dimension: string; systemScore: number; effectiveScore?: number }[];
          })
        : null;
      const score = (d: string): number => {
        const x = stored?.dimensions.find((v) => v.dimension === d);
        return x?.effectiveScore ?? x?.systemScore ?? 0;
      };
      const sorted = [...mine].sort(
        (x, y) => laneRank(y.lane) - laneRank(x.lane) || sevRank(y.severity) - sevRank(x.severity),
      );
      clientRows.push({
        clientId: b.client.clientId,
        name: b.client.clientName,
        bookingCentre: b.client.bookingCentre,
        riskProfile: b.client.riskProfile,
        aumUsd: round2(clientAum),
        ytdChangePct: clientBase ? round2((clientAum / clientBase - 1) * 100) : 0,
        urgencyScore: urgencyScore(mine),
        counts: {
          now: mine.filter((i) => i.lane === 'now').length,
          week: mine.filter((i) => i.lane === 'week').length,
          month: mine.filter((i) => i.lane === 'month').length,
        },
        rubric:
          stored && r
            ? {
                capacity: score('capacity'),
                appetite: score('appetite'),
                horizon: score('horizon'),
                status: r.status,
              }
            : null,
        topItem: sorted[0]?.title ?? null,
        themes: [...new Set(mine.map((i) => i.theme))] as Theme[],
      });
    }

    clientRows.sort((a, b) => b.urgencyScore - a.urgencyScore || b.aumUsd - a.aumUsd);
    items.sort(
      (a, b) =>
        laneRank(b.lane) - laneRank(a.lane) ||
        sevRank(b.severity) - sevRank(a.severity) ||
        a.clientName.localeCompare(b.clientName),
    );

    return {
      clock: at,
      snapshotDate: snapshot,
      previousSnapshotDate: prevSnapshot,
      kpis: {
        clients: bundles.length,
        aumUsd: round2(aum),
        aumBaselineUsd: round2(aumBase),
        ytdChangePct: aumBase ? round2((aum / aumBase - 1) * 100) : 0,
        clientsInBreach,
        facilitiesNearTrigger,
        kycOverdue,
        kycDueSoon,
        rubricAssessed: rubrics.length,
        items: {
          now: items.filter((i) => i.lane === 'now').length,
          week: items.filter((i) => i.lane === 'week').length,
          month: items.filter((i) => i.lane === 'month').length,
        },
      },
      items,
      clients: clientRows,
      method: METHOD,
    };
  }

  async board(snapshotDate: string | undefined): Promise<BoardResponse> {
    const meta = await this.ctx.meta();
    const snapshot = snapshotDate ?? meta.current;
    const dates = meta.snapshots.map((s) => s.date);
    const idx = dates.indexOf(snapshot);
    const prev = idx > 0 ? (dates[idx - 1] ?? null) : null;
    const bundles = await this.bundles();
    const portfolios: BoardResponse['portfolios'] = [];
    const facilities: BoardResponse['facilities'] = [];

    for (const b of bundles) {
      const now = mandateStatus(b, snapshot);
      const before = prev ? mandateStatus(b, prev) : null;
      const noteText = b.notes.map((n) => n.note.toLowerCase()).join(' ');
      for (const p of now.portfolios) {
        const prevP = before?.portfolios.find((x) => x.portfolioId === p.portfolioId);
        const cells = p.rows.map((r) => {
          const pr = prevP?.rows.find((x) => x.assetClass === r.assetClass);
          const trend = pr
            ? Math.abs(r.deviationPts) > Math.abs(pr.deviationPts) + 0.5
              ? 'worsening'
              : Math.abs(r.deviationPts) < Math.abs(pr.deviationPts) - 0.5
                ? 'improving'
                : 'flat'
            : 'flat';
          return {
            assetClass: r.assetClass,
            weightPct: r.weightPct,
            previousWeightPct: pr?.weightPct ?? null,
            minPct: r.minPct,
            maxPct: r.maxPct,
            status: r.status,
            deviationPts: r.deviationPts,
            trend,
          } as const;
        });
        const inBreach =
          p.managed &&
          (cells.some((c) => c.status !== 'within') ||
            p.singleLineBreaches.length > 0 ||
            p.exclusionBreaches.length > 0);
        const breachType = !inBreach
          ? 'none'
          : noteText.includes('waiver')
            ? 'waived'
            : /(confirmed the instruction|client instructed|client-directed|instructed an additional|subscribed|acknowledged this)/.test(
                  noteText,
                )
              ? 'client-directed'
              : 'drift';
        const note = inBreach
          ? b.notes.find((n) => /waiver|instruct|confirmed|subscribed/i.test(n.note))
          : undefined;
        const aumUsd = b.holdings
          .filter((h) => h.snapshotDate === snapshot && h.portfolioId === p.portfolioId)
          .reduce((s, h) => s + h.marketValueUsd, 0);
        portfolios.push({
          portfolioId: p.portfolioId,
          clientId: b.client.clientId,
          clientName: b.client.clientName,
          name: p.name,
          mandateCode: p.mandateCode,
          mandateName: p.mandateName,
          serviceModel: p.serviceModel,
          managed: p.managed,
          aumUsd: round2(aumUsd),
          cells,
          breachType,
          breachNote: note ? `${note.noteDate}: ${note.note.slice(0, 160)}` : null,
          singleLineBreaches: p.singleLineBreaches.length,
          exclusionBreaches: p.exclusionBreaches.length,
        });
      }
      for (const f of b.facilities) {
        const series = b.facilitySnapshots
          .filter((s) => s.facilityId === f.facilityId)
          .sort((x, y) => x.snapshotDate.localeCompare(y.snapshotDate));
        const cur = series.find((s) => s.snapshotDate === snapshot) ?? series[series.length - 1];
        if (!cur) {
          continue;
        }
        let breachedEver = false;
        let curedBy: 'action' | 'market' | 'none' | null = null;
        for (let i = 0; i < series.length; i++) {
          const s = series[i];
          if (!s || s.snapshotDate > snapshot) {
            break;
          }
          if (s.ltvPct > f.marginCallLtvPct) {
            breachedEver = true;
            const next = series[i + 1];
            if (next && next.snapshotDate <= snapshot && next.ltvPct <= f.marginCallLtvPct) {
              curedBy = next.drawn < s.drawn ? 'action' : 'market';
            } else if (!next || next.snapshotDate > snapshot) {
              curedBy = 'none';
            }
          }
        }
        facilities.push({
          facilityId: f.facilityId,
          clientId: b.client.clientId,
          clientName: b.client.clientName,
          type: f.facilityType,
          currency: f.facilityCcy,
          drawn: cur.drawn,
          limit: f.creditLimit,
          ltvPct: cur.ltvPct,
          marginCallLtvPct: f.marginCallLtvPct,
          headroomPts: round2(f.marginCallLtvPct - cur.ltvPct),
          series: series
            .filter((s) => s.snapshotDate <= snapshot)
            .map((s) => ({ snapshotDate: s.snapshotDate, ltvPct: s.ltvPct })),
          breachedEver,
          curedBy: breachedEver ? curedBy : null,
        });
      }
    }
    portfolios.sort(
      (a, b) =>
        Number(b.breachType !== 'none') - Number(a.breachType !== 'none') ||
        a.clientName.localeCompare(b.clientName),
    );
    facilities.sort((a, b) => a.headroomPts - b.headroomPts);
    return {
      snapshotDate: snapshot,
      previousSnapshotDate: prev,
      assetClasses: [...AssetClassSchema.options],
      portfolios,
      facilities,
      method: BOARD_METHOD,
    };
  }
}

const laneRank = (l: Urgency): number => ({ now: 3, week: 2, month: 1 })[l];
const sevRank = (s: 'low' | 'medium' | 'high'): number => ({ high: 3, medium: 2, low: 1 })[s];

function laneInputs(
  b: ClientBundle,
  inputs: Awaited<ReturnType<SignalRepository['inputs']>>,
  clock: string,
  snapshot: string,
  prevSnapshot: string | null,
): LaneInputs {
  const mandate = mandateStatus(b, snapshot);
  const exp = exposure(b, snapshot);
  const cf = cashflows(b, clock, snapshot);
  const alerts = deriveAlerts(b, mandate, exp, cf, clock);
  const signals = buildSignals(inputs, clock, b).filter((s) => (s.client?.exposedPct ?? 0) > 0);
  const prevMandate = prevSnapshot ? mandateStatus(b, prevSnapshot) : null;
  const ltvTrend = b.facilities.map((f) => {
    const now = b.facilitySnapshots.find(
      (s) => s.facilityId === f.facilityId && s.snapshotDate === snapshot,
    );
    const prev = prevSnapshot
      ? b.facilitySnapshots.find(
          (s) => s.facilityId === f.facilityId && s.snapshotDate === prevSnapshot,
        )
      : undefined;
    return {
      facilityId: f.facilityId,
      headroomNow: f.marginCallLtvPct - (now?.ltvPct ?? 0),
      headroomPrev: prev ? f.marginCallLtvPct - prev.ltvPct : null,
    };
  });
  const driftTrend = mandate.portfolios.flatMap((p) =>
    p.rows.map((r) => ({
      portfolioId: p.portfolioId,
      assetClass: r.assetClass,
      devNow: r.deviationPts,
      devPrev:
        prevMandate?.portfolios
          .find((x) => x.portfolioId === p.portfolioId)
          ?.rows.find((x) => x.assetClass === r.assetClass)?.deviationPts ?? null,
    })),
  );
  return {
    clientId: b.client.clientId,
    clientName: b.client.clientName,
    clock,
    alerts,
    signals,
    ltvTrend,
    driftTrend,
    kycReviewDue: b.client.kycReviewDue,
  };
}
