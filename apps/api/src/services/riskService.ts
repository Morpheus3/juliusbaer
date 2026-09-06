import type {
  CombinedRiskResponse,
  DecideRequest,
  Level,
  Mismatch,
  RankedAction,
} from '@jb/contracts';
import { deriveAlerts } from '../domain/alerts.js';
import { cashflows } from '../domain/cashflows.js';
import { daysBetween } from '../domain/dates.js';
import { exposure } from '../domain/exposure.js';
import { mandateStatus } from '../domain/mandate.js';
import { generateActions } from '../domain/risk/actions.js';
import {
  gauge,
  matrixCell,
  MATRIX,
  signalRisk,
  vulnerability,
  type RubricScores,
} from '../domain/risk/combined.js';
import { generateTradeIdeas } from '../domain/risk/tradeIdeas.js';
import { buildSignals, snapshotForClock } from '../domain/signals/build.js';
import type { ClientDetailRepository } from '../repositories/clientDetailRepository.js';
import type { DecisionRepository } from '../repositories/decisionRepository.js';
import type { RubricRepository } from '../repositories/rubricRepository.js';
import type { SignalRepository } from '../repositories/signalRepository.js';
import type { VectorRepository } from '../repositories/vectorRepository.js';
import { AnalyticsUnavailableError } from './analyticsClient.js';
import type { DatasetContext } from './datasetContext.js';
import type { SignalService } from './signalService.js';
import { ClientNotFoundError } from './vectorService.js';

/** Signals older than this (dataset days before the clock) do not count toward signal risk. */
const LOOKBACK_DAYS = 90;
const MAX_SIGNALS_FOR_STRESS = 5;

interface StoredRubric {
  dimensions: {
    dimension: string;
    systemScore: number;
    overrideScore?: number | null;
    effectiveScore?: number;
  }[];
  mismatches: Mismatch[];
}

export class RiskService {
  constructor(
    private readonly clients: ClientDetailRepository,
    private readonly signals: SignalRepository,
    private readonly rubric: RubricRepository,
    private readonly vectors: VectorRepository,
    private readonly decisions: DecisionRepository,
    private readonly signalService: SignalService,
    private readonly ctx: DatasetContext,
  ) {}

  async combined(clientId: string, clock: string | undefined): Promise<CombinedRiskResponse> {
    const meta = await this.ctx.meta();
    const at = clock && clock < meta.today ? clock : meta.today;
    const [bundle, inputs, rubricRow, vector, decisions] = await Promise.all([
      this.clients.bundle(clientId),
      this.signals.inputs(),
      this.rubric.latest(clientId),
      this.vectors.vector(clientId),
      this.decisions.latestForClient(clientId),
    ]);
    if (!bundle) {
      throw new ClientNotFoundError(clientId);
    }
    const snapshot = snapshotForClock(inputs.snapshots, at);
    const mandate = mandateStatus(bundle, snapshot);
    const exp = exposure(bundle, snapshot);
    const cf = cashflows(bundle, at, snapshot);
    const alerts = deriveAlerts(bundle, mandate, exp, cf, { clock: at, snapshot });
    const all = buildSignals(inputs, at, bundle);
    const recent = all.filter(
      (s) => daysBetween(s.date, at) <= LOOKBACK_DAYS && (s.client?.exposedPct ?? 0) > 0,
    );
    const forStress = [...recent]
      .sort((a, b) => (b.client?.exposedUsd ?? 0) - (a.client?.exposedUsd ?? 0))
      .slice(0, MAX_SIGNALS_FOR_STRESS);

    const notes: string[] = [];
    let stressPct: number | null = null;
    let stressUsd: number | null = null;
    let severeStressPct: number | null = null;
    if (forStress.length > 0) {
      const ids = forStress.map((s) => s.id);
      try {
        const [base, severe] = await Promise.all([
          this.signalService.impact(
            clientId,
            { signalIds: ids, severity: 'base', save: false, snapshotDate: snapshot },
            at,
          ),
          this.signalService.impact(
            clientId,
            { signalIds: ids, severity: 'severe', save: false, snapshotDate: snapshot },
            at,
          ),
        ]);
        stressPct = base.total_pct;
        stressUsd = base.total_usd;
        severeStressPct = severe.total_pct;
      } catch (err) {
        if (!(err instanceof AnalyticsUnavailableError)) {
          throw err;
        }
        notes.push(
          `Impact engine unavailable, signal risk read from severity and exposure only (${err.message}).`,
        );
      }
    } else {
      notes.push(
        `No signal in the last ${LOOKBACK_DAYS} days reaches this household; signal risk is low by construction.`,
      );
    }

    const stored = rubricRow ? (rubricRow.result as unknown as StoredRubric) : null;
    const rubricScores: RubricScores | null = stored ? toScores(stored) : null;
    const mismatches = stored?.mismatches ?? [];
    if (!stored) {
      notes.push(
        'No rubric assessment yet: vulnerability is read from alerts alone. Run the rubric for a fuller picture.',
      );
    }

    const vul = vulnerability(rubricScores, mismatches, alerts);
    const sig = signalRisk(forStress, stressPct);
    const cell = matrixCell(vul.level, sig.level);
    const features = vector?.features ?? {};
    const topName = exp.names[0];
    const g = gauge({
      stressPct,
      severeStressPct,
      mismatches,
      rubric: rubricScores,
      top1LookthroughPct: topName?.totalPct ?? null,
      top1LimitPct: topName?.limitPct ?? null,
      mandateDriftPts: features.mandate_drift_pts ?? null,
    });

    const actions = generateActions({
      clientId,
      clientName: bundle.client.clientName,
      cell,
      alerts,
      signals: forStress,
      rubric: rubricScores,
      stressPct,
      cashNeedsPct: features.cash_needs_12m_pct_aum ?? null,
      daysToNextNeed: features.days_to_next_cash_need ?? null,
      kycDaysToDue: daysBetween(at, bundle.client.kycReviewDue),
    });
    const ideas = generateTradeIdeas({
      bundle,
      snapshot,
      mandate,
      exposure: exp,
      cashflows: cf,
      rubric: rubricScores,
      signals: forStress,
    });

    const withDecision = <T extends { id: string; decision: RankedAction['decision'] }>(
      item: T,
    ): T => {
      const d = decisions.get(item.id);
      return d
        ? {
            ...item,
            decision: {
              decision: d.decision as 'approved' | 'rejected',
              note: d.note,
              actor: d.actor,
              at: d.createdAt.toISOString(),
            },
          }
        : item;
    };

    return {
      clientId,
      clientName: bundle.client.clientName,
      clock: at,
      snapshotDate: snapshot,
      rubric:
        rubricRow && rubricScores
          ? {
              ...rubricScores,
              assessedAt: rubricRow.createdAt.toISOString(),
              status: rubricRow.status,
            }
          : null,
      vulnerability: vul,
      signalRisk: {
        ...sig,
        signalIds: forStress.map((s) => s.id),
        stressPct,
        stressUsd,
        severeStressPct,
      },
      matrix: { cell, row: vul.level, column: sig.level, grid: MATRIX },
      gauge: g,
      facts: facts(cf, exp, severeStressPct, mandate),
      mismatches: mismatches.map((m) => m.message),
      alerts,
      actions: actions.map(withDecision),
      tradeIdeas: ideas.map(withDecision),
      notes,
    };
  }

  async decide(
    clientId: string,
    actionId: string,
    req: DecideRequest,
    clock: string | undefined,
  ): Promise<{ ok: true }> {
    const actor = await this.ctx.rmId();
    const current = await this.combined(clientId, clock);
    const known =
      req.entityType === 'action'
        ? current.actions.some((a) => a.id === actionId)
        : current.tradeIdeas.some((i) => i.id === actionId);
    if (!known) {
      throw new UnknownActionError(actionId);
    }
    await this.decisions.record(
      {
        actionId,
        clientId,
        entityType: req.entityType,
        decision: req.decision,
        note: req.note ?? null,
        actor,
        snapshot: { at: new Date().toISOString() },
      },
      {
        kind:
          req.entityType === 'action'
            ? req.decision === 'approved'
              ? 'ACTION_APPROVED'
              : 'ACTION_REJECTED'
            : req.decision === 'approved'
              ? 'TRADE_IDEA_APPROVED'
              : 'TRADE_IDEA_REJECTED',
        actor,
        clientId,
        entityType: req.entityType,
        entityId: actionId,
        summary: `${req.entityType === 'action' ? 'Action' : 'Trade idea'} ${req.decision}${req.note ? `: ${req.note}` : ''}. No order was placed; execution requires the trading desk.`,
        payload: { actionId, decision: req.decision },
      },
    );
    return { ok: true };
  }
}

function toScores(stored: StoredRubric): RubricScores {
  const get = (d: string): 1 | 2 | 3 => {
    const x = stored.dimensions.find((v) => v.dimension === d);
    const n = x?.effectiveScore ?? x?.overrideScore ?? x?.systemScore ?? 2;
    return n <= 1 ? 1 : n >= 3 ? 3 : 2;
  };
  return { capacity: get('capacity'), appetite: get('appetite'), horizon: get('horizon') };
}

function facts(
  cf: ReturnType<typeof cashflows>,
  exp: ReturnType<typeof exposure>,
  severeStressPct: number | null,
  mandate: ReturnType<typeof mandateStatus>,
): CombinedRiskResponse['facts'] {
  const cov = cf.coverage12m.ratio;
  const top = exp.names[0];
  const breaches = mandate.portfolios.reduce(
    (s, p) => s + p.rows.filter((r) => r.status !== 'within').length,
    0,
  );
  const tone = (level: Level): 'crit' | 'warn' | 'ok' =>
    level === 'high' ? 'crit' : level === 'medium' ? 'warn' : 'ok';
  return [
    {
      label: 'Liquidity coverage',
      value: cov === null ? 'no dated needs' : `${cov.toFixed(1)}x`,
      tone: cov === null ? 'neutral' : tone(cov < 1 ? 'high' : cov < 1.5 ? 'medium' : 'low'),
      detail: `Daily-liquid assets against confirmed and likely needs in the next 12 months (${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(cf.coverage12m.needsUsd)}).`,
    },
    {
      label: 'Largest look-through name',
      value: top ? `${top.exposureName} ${top.totalPct.toFixed(1)}%` : '—',
      tone: top?.breached ? 'crit' : 'ok',
      detail: top
        ? `Limit ${top.limitPct ?? 'n/a'}%; includes ${top.viaNotesUsd > 0 ? 'exposure through structured notes' : 'direct holdings only'}.`
        : 'No single-name exposure.',
    },
    {
      label: 'Severe-case drawdown',
      value: severeStressPct === null ? 'n/a' : `${severeStressPct.toFixed(1)}%`,
      tone:
        severeStressPct === null
          ? 'neutral'
          : tone(severeStressPct <= -10 ? 'high' : severeStressPct <= -5 ? 'medium' : 'low'),
      detail: 'Modelled impact of the recent signals at 2x severity. Not a forecast.',
    },
    {
      label: 'Mandate breaches',
      value: String(breaches),
      tone: breaches > 2 ? 'crit' : breaches > 0 ? 'warn' : 'ok',
      detail: 'Asset classes outside their bands across managed portfolios.',
    },
  ];
}

export class UnknownActionError extends Error {
  constructor(actionId: string) {
    super(`${actionId} is not a current action or trade idea for this client at this clock.`);
    this.name = 'UnknownActionError';
  }
}
