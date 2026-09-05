import type { RubricScore } from '@jb/contracts';
import {
  DIMENSIONS,
  type AuditResponse,
  type Dimension,
  type DimensionResult,
  type LlmAssessment,
  type OverrideRequest,
  type RubricAssessmentResponse,
  type RubricBookResponse,
  type RubricDefinition,
} from '@jb/contracts';
import { z } from 'zod';
import { daysBetween } from '../domain/dates.js';
import {
  confidence,
  impliedAppetiteFromStated,
  mismatches,
  systemScore,
  toScore,
} from '../domain/rubric/combine.js';
import { snapshotForClock } from '../domain/signals/build.js';
import type { ClaudeGateway } from '../llm/gateway.js';
import { RUBRIC_ASSESSOR_PROMPT } from '../llm/prompts/rubricAssessor.js';
import type { ClientDetailRepository } from '../repositories/clientDetailRepository.js';
import type { AssessmentRow, RubricRepository } from '../repositories/rubricRepository.js';
import type { SignalRepository } from '../repositories/signalRepository.js';
import type { VectorRepository } from '../repositories/vectorRepository.js';
import { AnalyticsUnavailableError } from './analyticsClient.js';
import { ClientNotFoundError, NoVectorRunError } from './vectorService.js';

const RM_ID = 'RM-SG-014';

/** Shape returned by the analytics service's /rubric/assess. */
const PyAssess = z.object({
  client_id: z.string(),
  vector_run_id: z.string(),
  engine_version: z.string(),
  features: z.record(z.string(), z.number().nullable()),
  dimensions: z.array(
    z.object({
      dimension: z.enum(['capacity', 'appetite', 'horizon']),
      rules: z.object({
        score: z.number(),
        raw: z.number(),
        contributions: z.array(
          z.object({
            rule: z.string(),
            feature: z.string(),
            value: z.number().nullable(),
            effect: z.number(),
            note: z.string(),
          }),
        ),
      }),
      statistical: z.object({
        score: z.number(),
        probabilities: z.record(z.string(), z.number()),
        calibrated_confidence: z.number(),
        top_features: z.array(z.object({ feature: z.string(), importance: z.number() })),
        model: z.string(),
        training: z.object({
          archetype_samples: z.number(),
          seed: z.number(),
          holdout_accuracy: z.number(),
        }),
      }),
    }),
  ),
});
const PyDefinitions = z.object({
  definitions: z.array(
    z.object({
      dimension: z.enum(['capacity', 'appetite', 'horizon']),
      title: z.string(),
      subtitle: z.string(),
      levels: z.array(z.object({ score: z.number(), label: z.string(), description: z.string() })),
    }),
  ),
});

/** What the LLM assessor must return. */
const LlmOutput = z.object({
  capacity: z.object({
    score: z.number().int().min(1).max(3),
    rationale: z.string(),
    evidence: z.array(z.string()),
    caveats: z.array(z.string()),
  }),
  appetite: z.object({
    score: z.number().int().min(1).max(3),
    rationale: z.string(),
    evidence: z.array(z.string()),
    caveats: z.array(z.string()),
  }),
  horizon: z.object({
    score: z.number().int().min(1).max(3),
    rationale: z.string(),
    evidence: z.array(z.string()),
    caveats: z.array(z.string()),
  }),
  stated_vs_observed: z.string(),
});

interface StoredResult {
  dimensions: DimensionResult[];
  mismatches: RubricAssessmentResponse['mismatches'];
  stated: RubricAssessmentResponse['stated'];
  definitions: RubricDefinition[];
  llmMode: RubricAssessmentResponse['llmMode'];
  features: Record<string, number | null>;
}

export class RubricService {
  constructor(
    private readonly repo: RubricRepository,
    private readonly vectors: VectorRepository,
    private readonly clients: ClientDetailRepository,
    private readonly signals: SignalRepository,
    private readonly gateway: ClaudeGateway,
    private readonly analyticsUrl: string,
    private readonly today: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async assess(clientId: string, clock: string | undefined): Promise<RubricAssessmentResponse> {
    const at = clock && clock < this.today ? clock : this.today;
    const [bundle, run, facts, vector, quality] = await Promise.all([
      this.clients.bundle(clientId),
      this.vectors.latestRun(),
      this.vectors.factual(clientId),
      this.vectors.vector(clientId),
      this.repo.qualityCounts(clientId),
    ]);
    if (!bundle) {
      throw new ClientNotFoundError(clientId);
    }
    if (!run || !facts || !vector) {
      throw new NoVectorRunError();
    }
    const py = PyAssess.parse(await this.callAnalytics(`/rubric/assess/${clientId}`));
    const definitions = PyDefinitions.parse(
      await this.callAnalytics('/rubric/definitions'),
    ).definitions.map((d) => ({
      ...d,
      levels: d.levels.map((l) => ({ ...l, score: toScore(l.score) })),
    }));

    // LLM assessor: evidence-only input. Events limited to the log.
    const events = await this.signals.inputs();
    const llmInput = {
      client_id: clientId,
      clock: at,
      rubric: definitions,
      factual_record: facts,
      behavioural_vector: vector.features,
      feature_manifest: run.manifest.map((m) => ({
        name: m.name,
        label: m.label,
        unit: m.unit,
        rubric: m.rubric,
        higher_means: m.higherMeans,
      })),
      rules_assessor: py.dimensions.map((d) => ({
        dimension: d.dimension,
        score: d.rules.score,
        contributions: d.rules.contributions,
      })),
      rm_notes: bundle.notes
        .filter((n) => n.noteDate <= at)
        .map((n) => ({ date: n.noteDate, channel: n.channel, note: n.note })),
      events: events.events
        .filter((e) => e.eventDate <= at)
        .map((e) => ({ id: e.eventId, date: e.eventDate, description: e.description })),
    };
    const llm = await this.gateway.structured({
      prompt: RUBRIC_ASSESSOR_PROMPT,
      input: llmInput,
      schema: LlmOutput,
      clientId,
    });

    const snapshot = snapshotForClock(at);
    const freshness = Math.max(0.5, 1 - daysBetween(snapshot, at) / 180);
    const dataQuality = Math.max(0.4, 1 - quality.errors * 0.15 - quality.warnings * 0.05);

    const dims: DimensionResult[] = py.dimensions.map((d) => {
      const dim = d.dimension;
      const llmDim = llm.status === 'ok' ? llm.data[dim] : null;
      const llmView: LlmAssessment = {
        status: llm.status,
        score: llmDim ? toScore(llmDim.score) : null,
        rationale: llmDim?.rationale ?? null,
        evidence: llmDim?.evidence ?? [],
        caveats: llmDim?.caveats ?? [],
        traceId: llm.traceId,
        model: llm.status === 'ok' ? llm.model : null,
        note: llm.status === 'ok' ? null : llm.note,
      };
      const scores = {
        rules: toScore(d.rules.score),
        statistical: toScore(d.statistical.score),
        statisticalConfidence: d.statistical.calibrated_confidence,
        llm: llmView.score,
      };
      const sys = systemScore(scores);
      return {
        dimension: dim,
        systemScore: sys,
        overrideScore: null,
        effectiveScore: sys,
        rules: { score: scores.rules, raw: d.rules.raw, contributions: d.rules.contributions },
        statistical: { ...d.statistical, score: scores.statistical },
        llm: llmView,
        confidence: confidence(scores, dataQuality, freshness, llmView),
        observedEvidence: observed(
          dim,
          py.features,
          d.rules.contributions.map((c) => c.rule),
        ),
      };
    });

    const scoreOf = (dim: Dimension): RubricScore =>
      dims.find((x) => x.dimension === dim)?.systemScore ?? 2;
    const stated = {
      riskProfile: bundle.client.riskProfile,
      riskScore: bundle.client.riskToleranceScore,
      horizonYears: bundle.client.investmentHorizonYears,
      impliedAppetite: impliedAppetiteFromStated(bundle.client.riskToleranceScore),
    };
    const mm = mismatches({
      scores: {
        capacity: scoreOf('capacity'),
        appetite: scoreOf('appetite'),
        horizon: scoreOf('horizon'),
      },
      statedRiskScore: stated.riskScore,
      riskAssetPct: py.features.risk_asset_pct ?? 0,
      cashNeeds12mPctAum: py.features.cash_needs_12m_pct_aum ?? 0,
      ltvHeadroomPts: py.features.ltv_headroom_pts ?? null,
      clientName: bundle.client.clientName,
    });

    const stored: StoredResult = {
      dimensions: dims,
      mismatches: mm,
      stated,
      definitions,
      llmMode: llm.status === 'ok' ? llm.mode : 'unavailable',
      features: py.features,
    };
    const row = await this.repo.insert({
      clientId,
      vectorRunId: run.id,
      clock: at,
      result: stored as unknown as Record<string, unknown>,
      engineVersions: {
        rubric: py.engine_version,
        vectors: run.engineVersion,
        llmPrompt: `${RUBRIC_ASSESSOR_PROMPT.id}@${RUBRIC_ASSESSOR_PROMPT.version}`,
        gateway: this.gateway.mode,
      },
    });
    await this.repo.audit({
      kind: 'RUBRIC_ASSESSED',
      actor: 'system',
      clientId,
      entityType: 'rubric_assessment',
      entityId: row.id,
      summary: `Rubric assessed: Capacity ${scoreOf('capacity')}, Appetite ${scoreOf('appetite')}, Horizon ${scoreOf('horizon')} (${dims.length} dimensions, LLM ${llm.status}).`,
      payload: { mismatches: mm.map((m) => m.kind), llmTraceId: llm.traceId },
    });
    return this.toResponse(row, bundle.client.clientName);
  }

  async latest(clientId: string): Promise<RubricAssessmentResponse | null> {
    const row = await this.repo.latest(clientId);
    if (!row) {
      return null;
    }
    const names = await this.repo.clientNames();
    return this.toResponse(row, names.get(clientId) ?? clientId);
  }

  async override(clientId: string, req: OverrideRequest): Promise<RubricAssessmentResponse> {
    const row = await this.repo.latest(clientId);
    if (!row) {
      throw new NoAssessmentError(clientId);
    }
    if (row.status === 'locked') {
      throw new LockedError();
    }
    const stored = row.result as unknown as StoredResult;
    const dim = stored.dimensions.find((d) => d.dimension === req.dimension);
    if (!dim) {
      throw new Error(`dimension ${req.dimension} missing`);
    }
    const o = await this.repo.addOverride({
      assessmentId: row.id,
      clientId,
      dimension: req.dimension,
      systemScore: dim.systemScore,
      overrideScore: req.score,
      reason: req.reason,
      rmId: RM_ID,
    });
    await this.repo.audit({
      kind: 'RUBRIC_OVERRIDE',
      actor: RM_ID,
      clientId,
      entityType: 'rubric_override',
      entityId: o.id,
      summary: `${req.dimension} overridden ${dim.systemScore} → ${req.score}: ${req.reason}`,
      payload: {
        assessmentId: row.id,
        dimension: req.dimension,
        systemScore: dim.systemScore,
        overrideScore: req.score,
      },
    });
    const names = await this.repo.clientNames();
    return this.toResponse(row, names.get(clientId) ?? clientId);
  }

  async lock(clientId: string): Promise<RubricAssessmentResponse> {
    const row = await this.repo.latest(clientId);
    if (!row) {
      throw new NoAssessmentError(clientId);
    }
    const locked = (await this.repo.lock(row.id, RM_ID)) ?? row;
    await this.repo.audit({
      kind: 'RUBRIC_LOCKED',
      actor: RM_ID,
      clientId,
      entityType: 'rubric_assessment',
      entityId: row.id,
      summary: 'Rubric saved and locked.',
      payload: {},
    });
    const names = await this.repo.clientNames();
    return this.toResponse(locked, names.get(clientId) ?? clientId);
  }

  async audit(clientId: string | undefined): Promise<AuditResponse> {
    const rows = await this.repo.auditFor(clientId);
    return {
      events: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        actor: r.actor,
        clientId: r.clientId,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        payload: r.payload,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async book(): Promise<RubricBookResponse> {
    const [rows, names] = await Promise.all([this.repo.latestForAll(), this.repo.clientNames()]);
    const assessed = new Set(rows.map((r) => r.clientId));
    return {
      rows: rows
        .map((r): RubricBookResponse['rows'][number] => {
          const s = r.result as unknown as StoredResult;
          const get = (d: Dimension): RubricScore =>
            s.dimensions.find((x) => x.dimension === d)?.systemScore ?? 2;
          return {
            clientId: r.clientId,
            name: names.get(r.clientId) ?? r.clientId,
            capacity: get('capacity'),
            appetite: get('appetite'),
            horizon: get('horizon'),
            confidence:
              Math.round((s.dimensions.reduce((a, d) => a + d.confidence.overall, 0) / 3) * 100) /
              100,
            mismatches: s.mismatches.length,
            status: r.status === 'locked' ? 'locked' : 'draft',
            assessedAt: r.createdAt.toISOString(),
          };
        })
        .sort((a, b) => a.clientId.localeCompare(b.clientId)),
      missing: [...names.keys()].filter((id) => !assessed.has(id)).sort(),
    };
  }

  private async toResponse(
    row: AssessmentRow,
    clientName: string,
  ): Promise<RubricAssessmentResponse> {
    const s = row.result as unknown as StoredResult;
    const overrides = await this.repo.overrides(row.id);
    const latestOverride = new Map<string, (typeof overrides)[number]>();
    for (const o of overrides) {
      if (!latestOverride.has(o.dimension)) {
        latestOverride.set(o.dimension, o);
      }
    }
    return {
      assessmentId: row.id,
      clientId: row.clientId,
      clientName,
      clock: row.clock,
      createdAt: row.createdAt.toISOString(),
      status: row.status === 'locked' ? 'locked' : 'draft',
      lockedAt: row.lockedAt?.toISOString() ?? null,
      lockedBy: row.lockedBy,
      definitions: s.definitions,
      dimensions: s.dimensions.map((d) => {
        const o = latestOverride.get(d.dimension);
        const overrideScore = o ? toScore(o.overrideScore) : null;
        return { ...d, overrideScore, effectiveScore: overrideScore ?? d.systemScore };
      }),
      mismatches: s.mismatches,
      stated: s.stated,
      overrides: overrides.map((o) => ({
        id: o.id,
        dimension: o.dimension as Dimension,
        systemScore: toScore(o.systemScore),
        overrideScore: toScore(o.overrideScore),
        reason: o.reason,
        rmId: o.rmId,
        createdAt: o.createdAt.toISOString(),
      })),
      engineVersions: row.engineVersions,
      llmMode: s.llmMode,
    };
  }

  private async callAnalytics(path: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.analyticsUrl}${path}`);
    } catch (err) {
      throw new AnalyticsUnavailableError(err instanceof Error ? err.message : String(err));
    }
    if (res.status === 404) {
      throw new NoVectorRunError();
    }
    if (!res.ok) {
      throw new AnalyticsUnavailableError(`${res.status} ${await res.text()}`);
    }
    return res.json();
  }
}

/** Plain-English observations shown under each dimension, built from the features the rules touched. */
function observed(dim: Dimension, f: Record<string, number | null>, rulesHit: string[]): string[] {
  const v = (k: string): number | null => f[k] ?? null;
  const fmt = (n: number | null, d = 1): string => (n === null ? 'n/a' : n.toFixed(d));
  const out: string[] = [];
  if (dim === 'capacity') {
    out.push(`Cash buffer ${fmt(v('cash_pct'))}% of household assets`);
    out.push(
      `${fmt(v('withdrawal_count_ytd'), 0)} withdrawals this year (${fmt(v('withdrawal_pct_aum_ytd'))}% of AUM)`,
    );
    out.push(
      `Liquidity runway ${v('liquidity_runway_months') !== null && (v('liquidity_runway_months') ?? 0) >= 120 ? '120+' : fmt(v('liquidity_runway_months'))} months; ${fmt(v('cash_needs_12m_pct_aum'))}% of AUM due within 12 months`,
    );
    if (v('ltv_pct') !== null) {
      out.push(
        `LTV ${fmt(v('ltv_pct'))}% with ${fmt(v('ltv_headroom_pts'))} points to the margin-call trigger`,
      );
    }
  } else if (dim === 'appetite') {
    out.push(
      `${fmt(v('risk_asset_pct'))}% in risk assets; largest single line ${fmt(v('top1_single_line_pct'))}%`,
    );
    const sb = v('stress_behaviour_score') ?? 0;
    out.push(
      sb > 0.3
        ? `Added ${fmt(v('risk_added_in_stress_pct_aum'))}% of AUM to risk assets during the 2026 stress windows`
        : sb < -0.3
          ? `Reduced risk assets by ${fmt(v('risk_reduced_in_stress_pct_aum'))}% of AUM during the stress windows`
          : 'Held positions through the 2026 stress windows',
    );
    out.push(`Realised drawdown ${fmt(v('max_drawdown_pct'))}% across the five snapshots`);
    if ((v('source_of_wealth_overlap_pct') ?? 0) > 15) {
      out.push(
        `${fmt(v('source_of_wealth_overlap_pct'))}% of assets in the same sector as the source of wealth`,
      );
    }
  } else {
    out.push(
      `Stated horizon ${fmt(v('stated_horizon_years'), 0)} years; average holding period ${fmt(v('avg_holding_period_years'))} years`,
    );
    out.push(`Implied turnover ${fmt(v('turnover_pct_aum'))}% of AUM this year`);
    const d = v('days_to_next_cash_need');
    out.push(
      d === null
        ? 'No dated cash needs recorded'
        : d === 0
          ? 'Recurring withdrawals already running'
          : `Next dated cash need in ${fmt(d, 0)} days`,
    );
    if ((v('illiquid_pct') ?? 0) > 20) {
      out.push(`${fmt(v('illiquid_pct'))}% locked in illiquid or gated positions`);
    }
  }
  if (rulesHit.length) {
    out.push(`Rules triggered: ${rulesHit.join('; ')}`);
  }
  return out;
}

export class NoAssessmentError extends Error {
  constructor(clientId: string) {
    super(`No rubric assessment exists for ${clientId}; run an assessment first.`);
    this.name = 'NoAssessmentError';
  }
}
export class LockedError extends Error {
  constructor() {
    super('This assessment is locked; run a new assessment to change scores.');
    this.name = 'LockedError';
  }
}

export { DIMENSIONS };
