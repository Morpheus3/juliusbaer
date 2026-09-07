import type {
  DraftRequest,
  OutreachDraft,
  SendRequest,
  TriageRequest,
  WorkflowResponse,
  WorkflowStep,
  WorkflowStepKey,
  GateResult,
} from '@jb/contracts';
import { z } from 'zod';
import { daysBetween } from '../domain/dates.js';
import { STALE_AFTER_DAYS } from './signalService.js';
import { reviewAction } from '../domain/workflow/review.js';
import { templateDraft } from '../domain/workflow/outreachTemplate.js';
import type { ClaudeGateway } from '../llm/gateway.js';
import { OUTREACH_DRAFTER_PROMPT } from '../llm/prompts/outreachDrafter.js';
import type { ClientDetailRepository } from '../repositories/clientDetailRepository.js';
import type { DecisionRepository } from '../repositories/decisionRepository.js';
import type { RubricRepository } from '../repositories/rubricRepository.js';
import type { SignalRepository } from '../repositories/signalRepository.js';
import type { OutreachRow, WorkflowRepository } from '../repositories/workflowRepository.js';
import type { AccessRepository } from '../repositories/accessRepository.js';
import type { CommunicationGateway } from './communicationGateway.js';
import { currentActor } from './actor.js';
import type { DatasetContext } from './datasetContext.js';
import type { RiskService } from './riskService.js';
import type { SignalService } from './signalService.js';
import { ClientNotFoundError } from './vectorService.js';

const STEPS: { key: WorkflowStepKey; title: string }[] = [
  { key: 'select', title: 'Select customer' },
  { key: 'portfolio', title: 'Review portfolio' },
  { key: 'signal', title: 'Inspect signal' },
  { key: 'impact', title: 'Run impact' },
  { key: 'rubric', title: 'Validate rubric' },
  { key: 'mismatch', title: 'Compare mismatch' },
  { key: 'action', title: 'Choose action' },
  { key: 'comms', title: 'Draft comms' },
  { key: 'log', title: 'Log decision' },
];

const LlmDraft = z.object({
  subject: z.string(),
  body: z.string(),
  facts_used: z.array(z.string()),
  caveats: z.array(z.string()),
});

export class WorkflowService {
  constructor(
    private readonly repo: WorkflowRepository,
    private readonly clients: ClientDetailRepository,
    private readonly rubric: RubricRepository,
    private readonly decisions: DecisionRepository,
    private readonly signals: SignalRepository,
    private readonly risk: RiskService,
    private readonly signalService: SignalService,
    private readonly gateway: ClaudeGateway,
    private readonly ctx: DatasetContext,
    private readonly access: AccessRepository,
    private readonly fallbackCheckerId: string,
    private readonly gate: CommunicationGateway,
  ) {}

  async state(clientId: string, clock: string | undefined): Promise<WorkflowResponse> {
    const meta = await this.ctx.meta();
    const at = clock && clock < meta.today ? clock : meta.today;
    const [bundle, risk, triage, rubricRow, decisions, drafts, feed, runs] = await Promise.all([
      this.clients.bundle(clientId),
      this.risk.combined(clientId, at),
      this.repo.triageFor(clientId),
      this.rubric.latest(clientId),
      this.decisions.latestForClient(clientId),
      this.repo.outreachFor(clientId),
      this.signalService.feed(at, clientId),
      this.signalService.savedRuns(clientId),
    ]);
    if (!bundle) {
      throw new ClientNotFoundError(clientId);
    }
    const alerts = risk.alerts.map((a) => {
      const t = triage.get(a.id);
      return {
        ...a,
        triage: t
          ? {
              decision: t.decision as 'triaged' | 'dismissed',
              reason: t.reason,
              actor: t.actor,
              at: t.createdAt.toISOString(),
            }
          : null,
      };
    });
    const rubricScores = risk.rubric
      ? {
          capacity: risk.rubric.capacity,
          appetite: risk.rubric.appetite,
          horizon: risk.rubric.horizon,
        }
      : null;
    const reviews = risk.actions
      .filter((a) => a.decision?.decision === 'approved')
      .map((a) => {
        const check = decisions.get(`check:${a.id}`);
        return reviewAction(a, {
          kycDaysToDue: daysBetween(at, bundle.client.kycReviewDue),
          pep: bundle.client.pepStatus,
          rubric: rubricScores,
          rubricLocked: rubricRow?.status === 'locked',
          rmLevel: currentActor()?.level ?? 1,
          checker: check
            ? {
                decision: check.decision as 'approved' | 'rejected',
                actor: check.actor,
                at: check.createdAt.toISOString(),
                note: check.note,
              }
            : null,
        });
      });
    const outreach = drafts.map(toDraft);
    const sent = outreach.some((o) => o.status === 'sent');
    const triagedAny = alerts.some((a) => a.triage !== null);
    const approvedAny = risk.actions.some((a) => a.decision?.decision === 'approved');
    const status = (done: boolean, current: boolean): WorkflowStep['status'] =>
      done ? 'done' : current ? 'current' : 'todo';
    const doneFlags: Record<WorkflowStepKey, boolean> = {
      select: true,
      portfolio: true,
      signal: triagedAny || feed.signals.length === 0,
      impact: runs.runs.length > 0 || risk.signalRisk.stressPct !== null,
      rubric: rubricRow !== null,
      mismatch: rubricRow !== null,
      action: approvedAny,
      comms: outreach.length > 0,
      log: sent || reviews.some((r) => r.canProceed && r.checker !== null),
    };
    let currentSet = false;
    const steps: WorkflowStep[] = STEPS.map((s, i) => {
      const done = doneFlags[s.key];
      const current = !done && !currentSet;
      if (current) {
        currentSet = true;
      }
      return {
        key: s.key,
        index: i + 1,
        title: s.title,
        status: status(done, current),
        detail: stepDetail(s.key, {
          alerts: alerts.length,
          triaged: alerts.filter((a) => a.triage).length,
          signals: feed.signals.length,
          runs: runs.runs.length,
          rubric: rubricRow ? rubricRow.status : null,
          mismatches: risk.mismatches.length,
          approved: risk.actions.filter((a) => a.decision?.decision === 'approved').length,
          drafts: outreach.length,
          sent,
        }),
        link: stepLink(s.key, clientId),
      };
    });
    return {
      clientId,
      clientName: bundle.client.clientName,
      reportingLanguage: bundle.client.reportingLanguage,
      clock: at,
      rm: { id: meta.rm.id, level: currentActor()?.level ?? 1, checkerId: await this.checkerId() },
      steps,
      alerts,
      stale: {
        isStale: feed.stale,
        snapshotAgeDays: feed.snapshotAgeDays,
        detail: feed.stale
          ? `Positions are ${feed.snapshotAgeDays} days older than the clock (threshold ${STALE_AFTER_DAYS}).`
          : `Positions are ${feed.snapshotAgeDays} day${feed.snapshotAgeDays === 1 ? '' : 's'} old.`,
      },
      reviews,
      outreach,
      guardrails: [
        {
          name: 'Stale data warning',
          status: feed.stale ? 'warning' : 'active',
          detail: feed.stale
            ? 'Valuation older than the threshold; figures may be stale.'
            : `Warns when positions are more than ${STALE_AFTER_DAYS} dataset days older than the clock.`,
        },
        {
          name: 'Explainability',
          status: 'active',
          detail: 'Every recommendation carries its evidence, sources and confidence.',
        },
        {
          name: 'Maker-checker',
          status: 'active',
          detail:
            'Collateral, rebalancing and liquidity actions need a second RM before they proceed.',
        },
        {
          name: 'Suitability record',
          status: rubricRow?.status === 'locked' ? 'active' : 'warning',
          detail:
            rubricRow?.status === 'locked'
              ? 'Locked rubric attached to the audit trail.'
              : 'Lock the rubric so the suitability record is frozen.',
        },
        {
          name: 'No automated trading',
          status: 'active',
          detail:
            'Nothing in this workbench places an order; approvals are decisions for the desk.',
        },
      ],
    };
  }

  /** The second pair of eyes: a checker in the caller's team, else the team head, else the configured fallback. */
  private async checkerId(): Promise<string> {
    const actor = currentActor();
    if (actor?.roles.includes('checker') || actor?.roles.includes('team_head')) {
      return actor.rmId ?? actor.subject;
    }
    const found = actor ? await this.access.checkerFor(actor.teamId, actor.rmId) : null;
    return found ?? this.fallbackCheckerId;
  }

  /** The gate's verdict without sending, so the RM sees what would block before pressing send. */
  async gatePreview(clientId: string, outreachId: string, body: string): Promise<GateResult> {
    const existing = await this.repo.outreachById(outreachId);
    if (existing?.clientId !== clientId) {
      throw new ClientNotFoundError(clientId);
    }
    return this.gate.gate(existing, body, 'rm');
  }

  async triage(clientId: string, alertId: string, req: TriageRequest): Promise<void> {
    const actor = await this.ctx.rmId();
    await this.repo.triage(
      { alertId, clientId, decision: req.decision, reason: req.reason ?? null, actor },
      {
        kind: req.decision === 'dismissed' ? 'ALERT_DISMISSED' : 'ALERT_TRIAGED',
        actor,
        clientId,
        entityType: 'alert',
        entityId: alertId,
        summary: `Alert ${alertId} ${req.decision}${req.reason ? `: ${req.reason}` : ''}.`,
        payload: {},
      },
    );
  }

  async check(
    clientId: string,
    actionId: string,
    req: { decision: 'approved' | 'rejected'; note?: string | undefined },
  ): Promise<void> {
    const checker = await this.checkerId();
    await this.decisions.record(
      {
        actionId: `check:${actionId}`,
        clientId,
        entityType: 'action_check',
        decision: req.decision,
        note: req.note ?? null,
        actor: checker,
        snapshot: { at: new Date().toISOString() },
      },
      {
        kind: req.decision === 'approved' ? 'CHECKER_APPROVED' : 'CHECKER_REJECTED',
        actor: checker,
        clientId,
        entityType: 'action',
        entityId: actionId,
        summary: `Second RM ${req.decision} action ${actionId}${req.note ? `: ${req.note}` : ''}.`,
        payload: {},
      },
    );
  }

  async draft(
    clientId: string,
    req: DraftRequest,
    clock: string | undefined,
  ): Promise<OutreachDraft> {
    const meta = await this.ctx.meta();
    const at = clock && clock < meta.today ? clock : meta.today;
    const [bundle, risk, inputs] = await Promise.all([
      this.clients.bundle(clientId),
      this.risk.combined(clientId, at),
      this.signals.inputs(),
    ]);
    if (!bundle) {
      throw new ClientNotFoundError(clientId);
    }
    const actions = risk.actions
      .filter((a) =>
        req.actionIds.length ? req.actionIds.includes(a.id) : a.decision?.decision === 'approved',
      )
      .slice(0, 3);
    const feed = await this.signalService.feed(at, clientId);
    const signalIds = req.signalIds.length
      ? req.signalIds
      : [...new Set(actions.flatMap((a) => a.sources.signalIds))]
          .concat(risk.signalRisk.signalIds)
          .slice(0, 2);
    const signals = feed.signals.filter((s) => signalIds.includes(s.id));
    const impactSummary =
      risk.signalRisk.stressPct !== null
        ? `Our modelling of the recent developments suggests an impact of about ${risk.signalRisk.stressPct.toFixed(1)}% on the portfolio in the base case; this is an estimate, not a forecast.`
        : null;
    const context = {
      client_name: bundle.client.clientName,
      reporting_language: bundle.client.reportingLanguage,
      rm_name: meta.rm.name,
      channel: req.channel,
      tone: req.tone,
      actions: actions.map((a) => ({ title: a.title, evidence: a.evidence, benefit: a.benefit })),
      signals: signals.map((s) => ({
        id: s.id,
        title: s.title,
        why_it_matters: s.client?.whyItMatters ?? '',
      })),
      impact_summary: impactSummary,
      events: inputs.events
        .filter((e) => e.eventDate <= at)
        .slice(-6)
        .map((e) => ({ id: e.eventId, date: e.eventDate, description: e.description })),
    };
    const llm = await this.gateway.structured({
      prompt: OUTREACH_DRAFTER_PROMPT,
      input: context,
      schema: LlmDraft,
      clientId,
    });
    let subject: string;
    let body: string;
    let facts: string[];
    let caveats: string[];
    let source: 'claude' | 'template';
    if (llm.status === 'ok') {
      ({ subject, body } = llm.data);
      facts = llm.data.facts_used;
      caveats = llm.data.caveats;
      source = 'claude';
    } else {
      const t = templateDraft(
        {
          clientName: bundle.client.clientName,
          rmName: meta.rm.name,
          reportingLanguage: bundle.client.reportingLanguage,
          actions: actions.map((a) => ({ title: a.title, evidence: a.evidence })),
          signals: signals.map((s) => ({
            title: s.title,
            whyItMatters: s.client?.whyItMatters ?? '',
          })),
          impactSummary,
        },
        req.channel,
      );
      ({ subject, body } = t);
      facts = t.factsUsed;
      caveats = [...t.caveats, llm.note];
      source = 'template';
    }
    const actor = meta.rm.id;
    const row = await this.repo.insertOutreach(
      {
        clientId,
        channel: req.channel,
        language: source === 'claude' ? bundle.client.reportingLanguage : 'English',
        subject,
        body,
        status: 'draft',
        source,
        llmTraceId: llm.traceId,
        context: { ...context, facts_used: facts, caveats, action_ids: actions.map((a) => a.id) },
        actor,
      },
      {
        kind: 'OUTREACH_DRAFTED',
        actor,
        clientId,
        entityType: 'outreach',
        entityId: 'pending',
        summary: `Outreach drafted (${source}, ${req.channel}) about ${actions[0]?.title ?? signals[0]?.title ?? 'the portfolio'}.`,
        payload: { source, llmTraceId: llm.traceId },
      },
    );
    return toDraft(row);
  }

  async send(clientId: string, outreachId: string, req: SendRequest): Promise<OutreachDraft> {
    const actor = await this.ctx.rmId();
    const existing = await this.repo.outreachById(outreachId);
    if (existing?.clientId !== clientId) {
      throw new ClientNotFoundError(clientId);
    }
    // Every message passes the communication gateway, whoever wrote it.
    const verdict = await this.gate.gate(existing, req.body, 'rm');
    if (!verdict.allowed) {
      throw new GateBlockedError(
        verdict.checks
          .filter((c) => c.status === 'block')
          .map((c) => `${c.name}: ${c.detail}`)
          .join(' '),
      );
    }
    const row = await this.repo.markSent(outreachId, req.subject, verdict.body, {
      kind: 'OUTREACH_SENT',
      actor,
      clientId,
      entityType: 'outreach',
      entityId: outreachId,
      summary: `Outreach logged as sent (${existing.channel}): "${req.subject}". No message left the system; the RM sends through the bank's channel.`,
      payload: {
        edited: req.body !== existing.body || req.subject !== existing.subject,
        gate: verdict.checks,
      },
    });
    if (!row) {
      throw new AlreadySentError();
    }
    return toDraft(row);
  }
}

function toDraft(r: OutreachRow): OutreachDraft {
  const ctx = r.context as { facts_used?: string[]; caveats?: string[] };
  return {
    id: r.id,
    channel: r.channel,
    language: r.language,
    subject: r.subject,
    body: r.body,
    status: r.status as 'draft' | 'sent' | 'discarded',
    source: r.source as 'claude' | 'template',
    llmTraceId: r.llmTraceId,
    factsUsed: ctx.facts_used ?? [],
    caveats: ctx.caveats ?? [],
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
    actor: r.actor,
  };
}

function stepDetail(
  key: WorkflowStepKey,
  c: {
    alerts: number;
    triaged: number;
    signals: number;
    runs: number;
    rubric: string | null;
    mismatches: number;
    approved: number;
    drafts: number;
    sent: boolean;
  },
): string {
  switch (key) {
    case 'select':
      return 'Client selected.';
    case 'portfolio':
      return 'Holdings, exposure and cash flows available.';
    case 'signal':
      return `${c.triaged} of ${c.alerts} alerts triaged; ${c.signals} signals reach this client.`;
    case 'impact':
      return c.runs > 0
        ? `${c.runs} saved scenario${c.runs === 1 ? '' : 's'}.`
        : 'Signal risk modelled; no scenario saved yet.';
    case 'rubric':
      return c.rubric ? `Rubric ${c.rubric}.` : 'Rubric not yet assessed.';
    case 'mismatch':
      return c.rubric
        ? `${c.mismatches} mismatch${c.mismatches === 1 ? '' : 'es'} flagged.`
        : 'Needs the rubric.';
    case 'action':
      return `${c.approved} action${c.approved === 1 ? '' : 's'} approved.`;
    case 'comms':
      return `${c.drafts} draft${c.drafts === 1 ? '' : 's'}.`;
    case 'log':
      return c.sent ? 'Decision and outreach logged.' : 'Send and log to close the loop.';
    default:
      return '';
  }
}

function stepLink(key: WorkflowStepKey, clientId: string): string {
  const base = `/clients/${clientId}`;
  switch (key) {
    case 'select':
    case 'portfolio':
      return key === 'select' ? base : `${base}/portfolio`;
    case 'signal':
      return `/signals?client=${clientId}`;
    case 'impact':
      return `${base}/impact`;
    case 'rubric':
    case 'mismatch':
      return `${base}/rubric`;
    case 'action':
      return `${base}/actions`;
    case 'comms':
    case 'log':
      return `${base}/workflow`;
    default:
      return base;
  }
}

export class GateBlockedError extends Error {
  constructor(message: string) {
    super(`The communication gateway blocked this message. ${message}`);
    this.name = 'GateBlockedError';
  }
}

export class AlreadySentError extends Error {
  constructor() {
    super('This outreach has already been logged as sent; draft a new one to send again.');
    this.name = 'AlreadySentError';
  }
}
