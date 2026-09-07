import type { AgentControlsRequest, TeamResponse, TeamRmRow } from '@jb/contracts';
import { daysBetween } from '../domain/dates.js';
import { mandateStatus } from '../domain/mandate.js';
import type { ClaudeGateway } from '../llm/gateway.js';
import type { CallPlanRepository } from '../repositories/callPlanRepository.js';
import type { PromiseRepository } from '../repositories/promiseRepository.js';
import type { TeamRepository } from '../repositories/teamRepository.js';
import { currentActor } from './actor.js';
import type { BookService } from './bookService.js';
import type { CallPlanService } from './callPlanService.js';
import type { CommunicationGateway } from './communicationGateway.js';
import type { IdeasService } from './ideasService.js';
import type { PlaybookService } from './playbookService.js';
import type { PromiseService } from './promiseService.js';

const METHOD = [
  'Every figure is aggregated by RM from the same engines the RM sees, under the caller’s scope: a head sees the team, an admin the bank, an RM only their own row.',
  'Risk: lane items and urgency per client from the horizon engine; escalations against the previous snapshot; the ten worst households by urgency.',
  'Conduct: rubric overrides this month with their reasons, override rate = overrides ÷ assessments; client-directed breaches from the mandate board; exclusions and KYC from the alerts; unanswered messages older than two days; a random sample of decided items for explainability review.',
  'Coverage: clients contacted within the cadence for their wealth band (call policy), clients silent for 90 days, review notes in the last twelve months, promises past due.',
  'Approvals: actions approved by an RM with no checker decision, oldest first.',
  'Capacity: today’s calls and later calls from the call plan, deferrals by the RM.',
  'Commercial: management-fee transactions this year as the revenue proxy. Real revenue, RoA and pipeline need a feed.',
  'The machine: model calls and errors today from the traces, tasks confirmed from language, gate outcomes, shadow-mode agreement per playbook against the threshold in the playbook file, and the pause switch.',
];

export class TeamService {
  constructor(
    private readonly book: BookService,
    private readonly calls: CallPlanService,
    private readonly promises: PromiseService,
    private readonly ideas: IdeasService,
    private readonly playbooks: PlaybookService,
    private readonly gateway: CommunicationGateway,
    private readonly repo: TeamRepository,
    private readonly refs: PromiseRepository,
    private readonly audit: CallPlanRepository,
    private readonly llm: ClaudeGateway,
  ) {}

  async monday(clock: string | undefined): Promise<TeamResponse> {
    const actor = currentActor();
    const [
      per,
      plan,
      openPromises,
      ideas,
      pb,
      controls,
      overrides,
      assessments,
      approvals,
      traces,
      auditToday,
      shadow,
      sample,
    ] = await Promise.all([
      this.book.perClient(clock),
      this.calls.plan(clock),
      this.promises.openAll(clock),
      this.ideas.search(undefined, undefined, clock),
      this.playbooks.doc(),
      this.gateway.agentsPaused(),
      this.repo.overridesSince(new Date(Date.now() - 30 * 86_400_000).toISOString()),
      this.repo.assessmentsByClient(),
      this.repo.pendingApprovals(),
      this.repo.tracesToday(),
      this.repo.auditCountsToday(),
      this.repo.shadowAgreement(),
      this.repo.explainabilitySample(3),
    ]);
    const at = per.at;
    const policy = plan.policy;
    const fees = await this.repo.feesYtdByClient(at.slice(0, 4));
    const rows = new Map<string, TeamRmRow>();
    const worst: TeamResponse['worst'] = [];
    const names = new Map<string, string>();

    for (const { bundle: b, inputs, items } of per.rows) {
      const c = b.client;
      names.set(c.clientId, c.clientName);
      const row = rows.get(c.rmId) ?? blank(c.rmId, c.rmName);
      const aum = b.holdings
        .filter((h) => h.snapshotDate === per.snapshot)
        .reduce((s, h) => s + h.marketValueUsd, 0);
      const urgency = items.reduce(
        (s, i) =>
          s +
          ({ now: 3, week: 2, month: 1 }[i.lane] * { high: 3, medium: 2, low: 1 }[i.severity] +
            (i.momentum === 'escalated' || i.momentum === 'new' ? 1 : 0)),
        0,
      );
      row.clients += 1;
      row.aumUsd += aum;
      row.urgencySum += urgency;
      row.items.now += items.filter((i) => i.lane === 'now').length;
      row.items.week += items.filter((i) => i.lane === 'week').length;
      row.items.month += items.filter((i) => i.lane === 'month').length;
      row.escalated += items.filter((i) => i.momentum === 'escalated').length;
      const themeCounts = new Map(row.themes.map((t) => [t.theme, t.count]));
      for (const i of items) {
        themeCounts.set(i.theme, (themeCounts.get(i.theme) ?? 0) + 1);
      }
      row.themes = [...themeCounts.entries()]
        .map(([theme, count]) => ({ theme: theme, count }))
        .sort((x, y) => y.count - x.count);

      // Coverage
      const notes = b.notes
        .filter((n) => n.noteDate <= at)
        .sort((x, y) => (x.noteDate < y.noteDate ? 1 : -1));
      const last = notes[0];
      const cadence = policy.cadenceDays[c.wealthBand] ?? policy.cadenceDays.default ?? 90;
      const days = last ? daysBetween(last.noteDate, at) : daysBetween(c.clientSince, at);
      if (days <= cadence) {
        row.withinCadence += 1;
      }
      if (days > 90) {
        row.uncontacted90 += 1;
      }
      if (notes.some((n) => /review/i.test(n.note) && daysBetween(n.noteDate, at) <= 365)) {
        row.reviewsLast12m += 1;
      }
      row.promisesOverdue += openPromises.promises.filter(
        (p) => p.clientId === c.clientId && (p.overdueDays ?? 0) > 0,
      ).length;

      // Conduct
      row.assessments += assessments.get(c.clientId) ?? 0;
      row.overrides += overrides.filter((o) => o.clientId === c.clientId).length;
      const mandate = mandateStatus(b, per.snapshot);
      row.clientDirectedBreaches += mandate.portfolios.filter(
        (p) =>
          p.rows.some((r) => r.status !== 'within') &&
          b.notes.some((n) =>
            /client (instruct|confirm|direct)|at the client's request|asked us to keep/i.test(
              n.note,
            ),
          ),
      ).length;
      row.exclusionsBreached += inputs.alerts.filter(
        (a) => a.kind === 'SUSTAINABILITY_EXCLUSION',
      ).length;
      row.kycOverdue += daysBetween(at, c.kycReviewDue) < 0 ? 1 : 0;
      row.unansweredOver2d += inputs.alerts.some(
        (a) => a.kind === 'UNANSWERED_CONTACT' && last && daysBetween(last.noteDate, at) > 2,
      )
        ? 1
        : 0;

      // Capacity
      const entry = plan.entries.find((e) => e.clientId === c.clientId);
      if (entry?.status === 'planned' && entry.kind === 'call') {
        if (entry.day === plan.planDay) {
          row.callsToday += 1;
        } else {
          row.callsLater += 1;
        }
      }
      if (entry?.status === 'deferred') {
        row.deferrals += 1;
      }
      row.feesYtdUsd += fees.get(c.clientId) ?? 0;
      rows.set(c.rmId, row);
      worst.push({
        clientId: c.clientId,
        clientName: c.clientName,
        rmId: c.rmId,
        urgencyScore: Math.round(urgency * 10) / 10,
        topItem:
          items.sort(
            (x, y) =>
              ({ now: 3, week: 2, month: 1 })[y.lane] - { now: 3, week: 2, month: 1 }[x.lane],
          )[0]?.title ?? null,
        link: `/clients/${c.clientId}`,
      });
    }
    worst.sort((a, b) => b.urgencyScore - a.urgencyScore);

    const agreement = shadow.map((s) => ({
      playbookId: s.playbookId,
      name: pb.playbooks.find((p) => p.id === s.playbookId)?.name ?? s.playbookId,
      grades: s.grades,
      agreement: s.grades ? Math.round((s.agree / s.grades) * 100) / 100 : null,
      readyForL2:
        s.grades >= pb.autonomy.minimumGradesForL2 &&
        s.agree / s.grades >= pb.autonomy.agreementThresholdForL2,
    }));
    for (const p of pb.playbooks) {
      if (!agreement.some((a) => a.playbookId === p.id)) {
        agreement.push({
          playbookId: p.id,
          name: p.name,
          grades: 0,
          agreement: null,
          readyForL2: false,
        });
      }
    }

    return {
      clock: at,
      scope: actor?.scope ?? 'own',
      teamId: actor?.teamId ?? null,
      rms: [...rows.values()]
        .map((r) => ({
          ...r,
          aumUsd: Math.round(r.aumUsd),
          urgencySum: Math.round(r.urgencySum * 10) / 10,
          feesYtdUsd: Math.round(r.feesYtdUsd),
        }))
        .sort((a, b) => b.urgencySum - a.urgencySum),
      worst: worst.slice(0, 10),
      approvals: approvals.map((a) => ({
        ...a,
        title: a.actionId,
        category: 'action',
        ageingDays: daysBetween(a.approvedAt.slice(0, 10), new Date().toISOString().slice(0, 10)),
        link: `/clients/${a.clientId}/workflow`,
      })),
      overrides,
      explainabilitySample: sample.map((s) => ({ ...s, link: `/clients/${s.clientId}#decided` })),
      uptake: ideas.uptake,
      machine: {
        gatewayMode: this.llm.mode,
        llmCallsToday: traces.calls,
        llmErrorsToday: traces.errors,
        tracesByPrompt: traces.byPrompt,
        assistantConfirmations: auditToday.get('ASSISTANT_CONFIRMED') ?? 0,
        gateBlocks: auditToday.get('COMMS_GATE_BLOCKED') ?? 0,
        autonomyLevel: pb.autonomy.level,
        agentsPaused: controls.paused,
        shadow: agreement,
        agreementThresholdForL2: pb.autonomy.agreementThresholdForL2,
        minimumGradesForL2: pb.autonomy.minimumGradesForL2,
      },
      method: METHOD,
      needsFeed: [
        'Revenue and return on assets (fees shown are a proxy from management-fee transactions)',
        'Net new money and pipeline',
        'Call recordings and transcripts',
      ],
    };
  }

  async setAgentControls(
    req: AgentControlsRequest,
  ): Promise<{ paused: boolean; reason: string | null }> {
    const actor = currentActor();
    if (!actor || !(actor.roles.includes('team_head') || actor.roles.includes('admin'))) {
      throw new ForbiddenError('Only a team head or an admin may pause or resume agents.');
    }
    await this.refs.setReferenceDoc('agent-controls', {
      version: 1,
      paused: req.paused,
      reason: req.reason ?? null,
      by: actor.subject,
      at: new Date().toISOString(),
    });
    await this.audit.record({
      kind: req.paused ? 'AGENTS_PAUSED' : 'AGENTS_RESUMED',
      actor: actor.rmId ?? actor.subject,
      clientId: null,
      entityType: 'agents',
      entityId: 'all',
      summary: req.paused
        ? `All agents paused${req.reason ? `: ${req.reason}` : ''}`
        : 'Agents resumed',
      payload: { reason: req.reason ?? null },
    });
    return { paused: req.paused, reason: req.reason ?? null };
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

function blank(rmId: string, name: string): TeamRmRow {
  return {
    rmId,
    name,
    clients: 0,
    aumUsd: 0,
    urgencySum: 0,
    items: { now: 0, week: 0, month: 0 },
    escalated: 0,
    themes: [],
    withinCadence: 0,
    uncontacted90: 0,
    reviewsLast12m: 0,
    promisesOverdue: 0,
    overrides: 0,
    assessments: 0,
    clientDirectedBreaches: 0,
    exclusionsBreached: 0,
    kycOverdue: 0,
    unansweredOver2d: 0,
    callsToday: 0,
    callsLater: 0,
    deferrals: 0,
    feesYtdUsd: 0,
  };
}
