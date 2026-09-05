/**
 * Ranked RM actions. Candidates come from alerts, the rubric and the signal impact; each carries
 * evidence, benefit, trade-off, a suitability result and a score that sets the rank. Nothing here
 * executes anything: the RM approves or rejects, and that decision is logged.
 */
import type {
  ClientAlert,
  MatrixCell,
  RankedAction,
  Signal,
  Suitability,
  Urgency,
} from '@jb/contracts';
import { sha256 } from '../../llm/prompts/registry.js';
import type { RubricScores } from './combined.js';

const URGENCY_BY_CELL: Record<MatrixCell, Urgency> = {
  URGENT: 'now',
  'Act Now': 'now',
  Discuss: 'week',
  Review: 'month',
  Monitor: 'month',
};
const URGENCY_WEIGHT: Record<Urgency, number> = { now: 3, week: 2, month: 1 };

export interface ActionContext {
  clientId: string;
  clientName: string;
  cell: MatrixCell;
  alerts: ClientAlert[];
  signals: Signal[];
  rubric: RubricScores | null;
  stressPct: number | null;
  cashNeedsPct: number | null;
  daysToNextNeed: number | null;
  kycDaysToDue: number | null;
}

type Draft = Omit<RankedAction, 'id' | 'rank' | 'score' | 'scoreParts' | 'decision'> & {
  severity: number;
  deadlineDays: number | null;
};

function suitability(
  checks: { rule: string; passed: boolean; detail: string; blocking?: boolean }[],
): Suitability {
  const failedBlocking = checks.some((c) => !c.passed && (c.blocking ?? false));
  const failed = checks.some((c) => !c.passed);
  return {
    status: failedBlocking ? 'blocked' : failed ? 'review' : 'ok',
    checks: checks.map(({ rule, passed, detail }) => ({ rule, passed, detail })),
  };
}

const humanApproval = {
  rule: 'Human approval',
  passed: true,
  detail: 'No automated execution; the RM must approve and log.',
};

export function generateActions(ctx: ActionContext): RankedAction[] {
  const drafts: Draft[] = [];
  const baseUrgency = URGENCY_BY_CELL[ctx.cell];

  for (const a of ctx.alerts) {
    const sev = a.severity === 'high' ? 3 : a.severity === 'medium' ? 2 : 1;
    switch (a.kind) {
      case 'MARGIN_CALL_PROXIMITY':
        drafts.push({
          urgency: 'now',
          category: 'collateral',
          title: 'Discuss collateral: top-up, reduce drawing or de-risk collateral',
          evidence: a.detail,
          benefit: 'Avoids a forced sale at the trigger and keeps the client in control of timing.',
          tradeOff: 'Reduces available leverage or requires fresh assets.',
          suitability: suitability([
            humanApproval,
            {
              rule: 'Credit policy',
              passed: true,
              detail: 'Any change to the facility follows the credit approval path.',
            },
          ]),
          sources: { alertIds: [a.id], signalIds: [], rubric: [] },
          severity: sev + 1,
          deadlineDays: 0,
        });
        break;
      case 'MANDATE_BREACH':
        drafts.push({
          urgency: baseUrgency,
          category: 'rebalance',
          title: `Rebalance toward the mandate bands: ${a.title.split(':')[0] ?? ''}`,
          evidence: a.detail,
          benefit: 'Restores the agreed risk profile and removes a governance exception.',
          tradeOff:
            'Transaction costs and possible realised gains or losses; may cut a position the client wants to keep.',
          suitability: suitability([
            humanApproval,
            {
              rule: 'Mandate direction',
              passed: true,
              detail: 'Moves weights toward the agreed bands.',
            },
            {
              rule: 'Client-directed waiver',
              passed: true,
              detail: 'Check the notes for a waiver before proposing a trim.',
            },
          ]),
          sources: { alertIds: [a.id], signalIds: [], rubric: [] },
          severity: sev,
          deadlineDays: 30,
        });
        break;
      case 'CONCENTRATION':
      case 'LOOKTHROUGH_CONCENTRATION':
        drafts.push({
          urgency: a.severity === 'high' ? 'week' : baseUrgency,
          category: 'rebalance',
          title: `Trim concentrated exposure: ${a.title.split(' at ')[0]?.split(':')[0] ?? ''}`,
          evidence: `${a.title}. ${a.detail}`,
          benefit:
            'Reduces single-name risk to within the agreed limit, including exposure through notes.',
          tradeOff:
            'May crystallise gains or sell a position the client identifies with; notes may not be saleable before maturity.',
          suitability: suitability([
            humanApproval,
            {
              rule: 'Single-position limit',
              passed: true,
              detail: 'Brings the household inside the limit.',
            },
            {
              rule: 'Liquidity of the sale',
              passed: a.kind === 'CONCENTRATION',
              detail:
                a.kind === 'CONCENTRATION'
                  ? 'Direct holding, saleable.'
                  : 'Part of the exposure sits in structured notes that are illiquid before maturity; only the direct line can be trimmed now.',
            },
          ]),
          sources: { alertIds: [a.id], signalIds: [], rubric: [] },
          severity: sev,
          deadlineDays: 14,
        });
        break;
      case 'SUSTAINABILITY_EXCLUSION':
        drafts.push({
          urgency: 'week',
          category: 'compliance',
          title: `Replace an excluded holding: ${a.title.split(' is excluded')[0] ?? ''}`,
          evidence: a.detail,
          benefit:
            "Brings the portfolio back inside the mandate's binding exclusions the client asked for.",
          tradeOff:
            'A legacy or family position may carry sentiment; realised gains may be taxable.',
          suitability: suitability([
            humanApproval,
            { rule: 'Mandate exclusions', passed: true, detail: 'Removes an excluded instrument.' },
          ]),
          sources: { alertIds: [a.id], signalIds: [], rubric: [] },
          severity: 3,
          deadlineDays: 7,
        });
        break;
      case 'KYC_DUE':
        drafts.push({
          urgency:
            (ctx.kycDaysToDue ?? 99) < 0
              ? 'now'
              : (ctx.kycDaysToDue ?? 99) <= 14
                ? 'week'
                : 'month',
          category: 'compliance',
          title: 'Complete the KYC review',
          evidence: a.title,
          benefit: 'Keeps the relationship in good standing; overdue KYC can block trading.',
          tradeOff: 'Client time.',
          suitability: suitability([humanApproval]),
          sources: { alertIds: [a.id], signalIds: [], rubric: [] },
          severity: sev,
          deadlineDays: ctx.kycDaysToDue,
        });
        break;
      case 'CASH_NEED_APPROACHING':
      case 'LIQUIDITY_SHORTFALL':
        drafts.push({
          urgency:
            a.kind === 'LIQUIDITY_SHORTFALL' || (ctx.daysToNextNeed ?? 999) <= 45
              ? 'week'
              : 'month',
          category: 'liquidity',
          title:
            a.kind === 'LIQUIDITY_SHORTFALL'
              ? 'Plan liquidity for the next 12 months'
              : `Fund the upcoming need: ${a.title.split(':')[0] ?? ''}`,
          evidence: `${a.title}. ${a.detail}`,
          benefit:
            'Avoids selling into a weak market or drawing on the facility to meet a known liability.',
          tradeOff: 'Raising cash early gives up yield; gated funds cannot be relied on.',
          suitability: suitability([
            humanApproval,
            {
              rule: 'Sell daily-liquid first',
              passed: true,
              detail: 'Raise cash from daily-liquid positions above their band target.',
            },
          ]),
          sources: { alertIds: [a.id], signalIds: [], rubric: [] },
          severity: sev,
          deadlineDays: ctx.daysToNextNeed,
        });
        break;
      case 'UNANSWERED_CONTACT':
        drafts.push({
          urgency: 'now',
          category: 'conversation',
          title: 'Reply to the client and propose a call',
          evidence: a.detail,
          benefit:
            'An unanswered question about moving to deposits is a trust moment; a call beats an email.',
          tradeOff: 'RM time today.',
          suitability: suitability([humanApproval]),
          sources: { alertIds: [a.id], signalIds: [], rubric: [] },
          severity: 3,
          deadlineDays: 0,
        });
        break;
      case 'STALE_VALUATION':
        drafts.push({
          urgency: 'month',
          category: 'valuation',
          title: `Request an updated valuation: ${a.title.split(' valued')[0] ?? ''}`,
          evidence: a.detail,
          benefit: 'Collateral and exposure figures rest on a mark that is months old.',
          tradeOff: 'Depends on the issuer or fund administrator.',
          suitability: suitability([humanApproval]),
          sources: { alertIds: [a.id], signalIds: [], rubric: [] },
          severity: 1,
          deadlineDays: 30,
        });
        break;
      default:
        break;
    }
  }

  // Signal-driven conversation: the most exposed recent high-severity signal.
  const top = [...ctx.signals]
    .filter(
      (s) =>
        (s.client?.exposedPct ?? 0) >= 10 && (s.severity === 'HIGH' || s.severity === 'SEVERE'),
    )
    .sort((a, b) => (b.client?.exposedUsd ?? 0) - (a.client?.exposedUsd ?? 0))[0];
  if (top?.client) {
    drafts.push({
      urgency: ctx.cell === 'URGENT' || ctx.cell === 'Act Now' ? 'now' : 'week',
      category: 'conversation',
      title: `Call client: impact of "${top.title.length > 60 ? `${top.title.slice(0, 58)}…` : top.title}"`,
      evidence: `${top.client.whyItMatters} ${ctx.stressPct !== null ? `Modelled base-case impact of recent signals ${ctx.stressPct.toFixed(1)}% of AUM.` : ''}`,
      benefit:
        'Client hears it from you first; trust maintained; opens the rebalancing conversation.',
      tradeOff: 'RM time; risk of prompting an emotional decision if the framing is poor.',
      suitability: suitability([
        humanApproval,
        {
          rule: 'Evidence attached',
          passed: true,
          detail: `Signal ${top.id} with confidence ${top.confidence.overall}% and ${top.client.affected.length} affected holdings.`,
        },
      ]),
      sources: { alertIds: [], signalIds: [top.id], rubric: [] },
      severity: top.severity === 'SEVERE' ? 3 : 2,
      deadlineDays: 7,
    });
  }

  if (ctx.rubric?.appetite === 1) {
    const equityAlert = ctx.alerts.find(
      (a) => a.kind === 'MANDATE_BREACH' && a.detail.includes('Equity'),
    );
    if (equityAlert) {
      drafts.push({
        urgency: 'week',
        category: 'conversation',
        title: 'Re-confirm the risk profile with the client before any rebalancing',
        evidence:
          'Behaviour scores Appetite 1 while the portfolio sits above its equity band; the client may not understand what they hold.',
        benefit: 'Aligns the mandate with the person, not the inherited or drifted portfolio.',
        tradeOff: 'A fuller conversation than a trade instruction.',
        suitability: suitability([humanApproval]),
        sources: { alertIds: [equityAlert.id], signalIds: [], rubric: ['appetite'] },
        severity: 2,
        deadlineDays: 14,
      });
    }
  }

  const scored = drafts.map((d) => {
    const parts = {
      urgency: URGENCY_WEIGHT[d.urgency] * 2,
      severity: d.severity,
      deadline: d.deadlineDays === null ? 0 : Math.max(0, 2 - d.deadlineDays / 30),
      suitability: d.suitability.status === 'ok' ? 1 : d.suitability.status === 'review' ? 0.5 : 0,
    };
    const score =
      Math.round((parts.urgency + parts.severity + parts.deadline + parts.suitability) * 10) / 10;
    const { severity: _s, deadlineDays: _d, ...rest } = d;
    return { ...rest, score, scoreParts: parts };
  });
  scored.sort((a, b) => b.score - a.score);
  const seen = new Map<string, number>();
  return scored.map((a, i) => {
    const key = `${a.category}|${a.title}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return {
      ...a,
      id: `act-${sha256(`${ctx.clientId}|${key}|${n}`)}`,
      rank: i + 1,
      decision: null,
    };
  });
}
