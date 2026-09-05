/**
 * Horizon engine: assigns each open item to Now / next 7 days / next 30 days using the item's
 * deadline and its trend across snapshots, then compares with the lane it would have held one
 * snapshot earlier so the RM sees momentum, not just state.
 */
import type { ClientAlert, HorizonItem, Momentum, Signal, Theme, Urgency } from '@jb/contracts';
import { sha256 } from '../../llm/prompts/registry.js';
import { daysBetween } from '../dates.js';

const LANE_RANK: Record<Urgency, number> = { now: 3, week: 2, month: 1 };

export interface LaneInputs {
  clientId: string;
  clientName: string;
  clock: string;
  alerts: ClientAlert[];
  /** Signals reaching the client, already filtered to the clock. */
  signals: Signal[];
  /** LTV headroom now and one snapshot earlier per facility, for trend. */
  ltvTrend: { facilityId: string; headroomNow: number; headroomPrev: number | null }[];
  /** Mandate deviation now and one snapshot earlier per portfolio/asset class, for drift velocity. */
  driftTrend: { portfolioId: string; assetClass: string; devNow: number; devPrev: number | null }[];
  kycReviewDue: string;
}

const THEME_BY_KIND: Record<ClientAlert['kind'], Theme> = {
  MARGIN_CALL_PROXIMITY: 'collateral',
  MANDATE_BREACH: 'mandate',
  CONCENTRATION: 'concentration',
  LOOKTHROUGH_CONCENTRATION: 'concentration',
  SUSTAINABILITY_EXCLUSION: 'compliance',
  KYC_DUE: 'compliance',
  CASH_NEED_APPROACHING: 'liquidity',
  LIQUIDITY_SHORTFALL: 'liquidity',
  STALE_VALUATION: 'valuation',
  UNANSWERED_CONTACT: 'contact',
};

function escalate(lane: Urgency): Urgency {
  return lane === 'month' ? 'week' : 'now';
}

/** Lane and reason for one alert, given trends. Pure. */
export function laneForAlert(
  a: ClientAlert,
  inp: LaneInputs,
): { lane: Urgency; reason: string; dueDate: string | null } {
  switch (a.kind) {
    case 'MARGIN_CALL_PROXIMITY': {
      const f = inp.ltvTrend.find((t) => String(a.evidence.facilityId) === t.facilityId);
      const headroom = f?.headroomNow ?? 99;
      const falling =
        f?.headroomPrev !== null && f?.headroomPrev !== undefined && f.headroomNow < f.headroomPrev;
      if (headroom < 2 || (a.severity === 'high' && falling)) {
        return {
          lane: 'now',
          reason: `${headroom.toFixed(1)} points of headroom${falling ? ' and falling since the last snapshot' : ''}.`,
          dueDate: null,
        };
      }
      return {
        lane: falling ? 'week' : 'month',
        reason: falling
          ? 'Headroom is shrinking snapshot to snapshot.'
          : 'Headroom is stable; keep under review.',
        dueDate: null,
      };
    }
    case 'UNANSWERED_CONTACT':
      return { lane: 'now', reason: 'A client message is waiting for a reply.', dueDate: null };
    case 'KYC_DUE': {
      const days = daysBetween(inp.clock, inp.kycReviewDue);
      return {
        lane: days < 0 ? 'now' : days <= 14 ? 'week' : 'month',
        reason: days < 0 ? `Overdue by ${-days} days.` : `Due in ${days} days.`,
        dueDate: inp.kycReviewDue,
      };
    }
    case 'CASH_NEED_APPROACHING': {
      const m = /from (\d{4}-\d{2}-\d{2})/.exec(a.title);
      const due = m?.[1] ?? null;
      const days = due ? daysBetween(inp.clock, due) : 999;
      return {
        lane: days <= 30 ? 'week' : 'month',
        reason: `Need starts in ${days} days; funding has to be arranged before it does.`,
        dueDate: due,
      };
    }
    case 'LIQUIDITY_SHORTFALL':
      return {
        lane: a.severity === 'high' ? 'week' : 'month',
        reason:
          a.severity === 'high'
            ? 'Daily-liquid assets do not cover the next 12 months.'
            : 'Coverage is thin; plan before the first need.',
        dueDate: null,
      };
    case 'MANDATE_BREACH': {
      const rows =
        (a.evidence.rows as { assetClass: string; deviationPts: number }[] | undefined) ?? [];
      const worsening = rows.some((r) => {
        const t = inp.driftTrend.find(
          (d) => d.portfolioId === String(a.evidence.portfolioId) && d.assetClass === r.assetClass,
        );
        return (
          t?.devPrev !== null &&
          t?.devPrev !== undefined &&
          Math.abs(t.devNow) > Math.abs(t.devPrev) + 1
        );
      });
      return {
        lane: worsening ? 'week' : 'month',
        reason: worsening
          ? 'The breach widened by more than a point since the last snapshot.'
          : 'Breach is stable; address at the next review.',
        dueDate: null,
      };
    }
    case 'CONCENTRATION':
    case 'LOOKTHROUGH_CONCENTRATION':
      return {
        lane: a.severity === 'high' ? 'week' : 'month',
        reason: a.severity === 'high' ? 'Well above the limit.' : 'Marginally above the limit.',
        dueDate: null,
      };
    case 'SUSTAINABILITY_EXCLUSION':
      return {
        lane: 'week',
        reason: 'A binding exclusion is breached; the client asked for this policy.',
        dueDate: null,
      };
    case 'STALE_VALUATION':
      return { lane: 'month', reason: 'Mark is old but not urgent.', dueDate: null };
    default:
      return { lane: 'month', reason: '', dueDate: null };
  }
}

/** Lane for the most exposed high/severe signal of the last 30 days. */
export function laneForSignals(
  signals: Signal[],
  clock: string,
): { signal: Signal; lane: Urgency; reason: string } | null {
  const recent = signals.filter((s) => {
    const exposed = s.client?.exposedPct ?? 0;
    const severe = s.severity === 'SEVERE' && exposed >= 10;
    const high = s.severity === 'HIGH' && exposed >= 25;
    return daysBetween(s.date, clock) <= 30 && (severe || high);
  });
  const top = recent.sort((a, b) => (b.client?.exposedUsd ?? 0) - (a.client?.exposedUsd ?? 0))[0];
  if (!top?.client) {
    return null;
  }
  const now = top.severity === 'SEVERE' && top.client.exposedPct >= 20;
  return {
    signal: top,
    lane: now ? 'now' : 'week',
    reason: `${top.severity.toLowerCase()} signal ${daysBetween(top.date, clock)} days ago reaching ${top.client.exposedPct.toFixed(0)}% of the household.`,
  };
}

export function buildItems(
  inp: LaneInputs,
  previous: Map<string, Urgency> | null,
  baseLink: string,
): HorizonItem[] {
  const items: HorizonItem[] = [];
  for (const a of inp.alerts) {
    const { lane, reason, dueDate } = laneForAlert(a, inp);
    const id = `hz-${sha256(`${inp.clientId}|${a.id}`)}`;
    items.push({
      id,
      clientId: inp.clientId,
      clientName: inp.clientName,
      lane,
      previousLane: null,
      momentum: 'same',
      theme: THEME_BY_KIND[a.kind],
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      laneReason: reason,
      dueDate,
      evidence: a.evidence,
      link: `${baseLink}/${inp.clientId}${a.kind === 'MARGIN_CALL_PROXIMITY' || a.kind === 'LIQUIDITY_SHORTFALL' ? '/portfolio/cashflows' : a.kind === 'MANDATE_BREACH' || a.kind === 'CONCENTRATION' || a.kind === 'LOOKTHROUGH_CONCENTRATION' ? '/portfolio/exposure' : ''}`,
    });
  }
  const sig = laneForSignals(inp.signals, inp.clock);
  if (sig?.signal.client) {
    items.push({
      id: `hz-${sha256(`${inp.clientId}|signal|${sig.signal.id}`)}`,
      clientId: inp.clientId,
      clientName: inp.clientName,
      lane: sig.lane,
      previousLane: null,
      momentum: 'same',
      theme: 'signal',
      severity: sig.signal.severity === 'SEVERE' ? 'high' : 'medium',
      title: `Discuss: ${sig.signal.title}`,
      detail: sig.signal.client.whyItMatters,
      laneReason: sig.reason,
      dueDate: null,
      evidence: { signalId: sig.signal.id, exposedPct: sig.signal.client.exposedPct },
      link: `${baseLink}/${inp.clientId}/impact?signals=${sig.signal.id}`,
    });
  }
  if (previous) {
    for (const it of items) {
      const prev = previous.get(it.id) ?? null;
      it.previousLane = prev;
      it.momentum = momentum(it.lane, prev);
    }
  }
  return items;
}

export function momentum(lane: Urgency, previous: Urgency | null): Momentum {
  if (previous === null) {
    return 'new';
  }
  if (LANE_RANK[lane] > LANE_RANK[previous]) {
    return 'escalated';
  }
  if (LANE_RANK[lane] < LANE_RANK[previous]) {
    return 'eased';
  }
  return 'same';
}

const SEVERITY_W = { high: 3, medium: 2, low: 1 };

/** Client urgency: lane weight × severity, plus a bonus for escalations, so the ranking reflects motion. */
export function urgencyScore(items: HorizonItem[]): number {
  return (
    Math.round(
      items.reduce(
        (s, i) =>
          s +
          LANE_RANK[i.lane] * SEVERITY_W[i.severity] +
          (i.momentum === 'escalated' || i.momentum === 'new' ? 1 : 0),
        0,
      ) * 10,
    ) / 10
  );
}

export { escalate };
