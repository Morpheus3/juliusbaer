import { randomUUID } from 'node:crypto';
import type { ConfirmResponse } from '@jb/contracts';
import {
  DraftRequest,
  OverrideRequest,
  TriageRequest,
  DecideRequest,
  DeferCallRequest,
  type AskRequest,
  type AssistantResponse,
  type Proposal,
} from '@jb/contracts';
import { z } from 'zod';
import { compose } from '../assistant/compose.js';
import { planFromGrammar } from '../assistant/grammar.js';
import { Plan, Shape, TOOL_DESCRIPTIONS, type ProposalDraft } from '../assistant/plan.js';
import { toView, type AssistantTools, type Executed } from '../assistant/tools.js';
import type { ClaudeGateway } from '../llm/gateway.js';
import { ASSISTANT_COMPOSER_PROMPT, ASSISTANT_PLANNER_PROMPT } from '../llm/prompts/assistant.js';
import type { CallPlanRepository } from '../repositories/callPlanRepository.js';
import type { ClientRepository } from '../repositories/clientRepository.js';
import type { CallPlanService } from './callPlanService.js';
import type { DatasetContext } from './datasetContext.js';
import type { RiskService } from './riskService.js';
import type { RubricService } from './rubricService.js';
import type { SignalService } from './signalService.js';
import type { WorkflowService } from './workflowService.js';

const PROPOSAL_TTL_MS = 5 * 60_000;

const ComposerOutput = z.object({
  answer: z.string(),
  bullets: z.array(z.string()).max(6),
  followUps: z.array(z.string()).max(3),
});

interface StoredProposal {
  proposal: Proposal;
  sentence: string;
  clock: string;
  expiresAt: number;
}

export class ProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalError';
  }
}

/**
 * The conversation layer: one pipeline, two planners. Claude plans and writes when a key is present;
 * the grammar and the templates do the same work without one. Tools only read. Tasks become
 * proposals that the RM confirms; confirmation performs the same call the screens make.
 */
export class AssistantService {
  private readonly proposals = new Map<string, StoredProposal>();

  constructor(
    private readonly ctx: DatasetContext,
    private readonly clients: ClientRepository,
    private readonly tools: AssistantTools,
    private readonly gateway: ClaudeGateway,
    private readonly signals: SignalService,
    private readonly risk: RiskService,
    private readonly rubric: RubricService,
    private readonly workflow: WorkflowService,
    private readonly calls: CallPlanService,
    private readonly audit: CallPlanRepository,
  ) {}

  async ask(req: AskRequest, clock: string | undefined): Promise<AssistantResponse> {
    const meta = await this.ctx.meta();
    const at = clock && clock < meta.today ? clock : meta.today;
    const [clientRows, feed, scenarios] = await Promise.all([
      this.clients.listAll(),
      this.signals.feed(at, undefined),
      this.signals.scenarios().catch(() => ({ scenarios: [] })),
    ]);
    const clientRefs = clientRows.map((c) => ({ clientId: c.clientId, name: c.clientName }));
    const signalRefs = feed.signals.map((s) => ({ id: s.id, title: s.title, date: s.date }));
    const scenarioRefs = scenarios.scenarios.map((s) => ({ id: s.id, name: s.name }));
    const warnings: string[] = [];

    // 1. Plan
    let plan: Plan | null = null;
    let planner: AssistantResponse['planner'] = 'grammar';
    if (this.gateway.mode === 'live') {
      const r = await this.gateway.structured({
        prompt: ASSISTANT_PLANNER_PROMPT,
        input: {
          sentence: req.text,
          contextClientId: req.clientId ?? null,
          route: req.route ?? null,
          clock: at,
          clients: clientRefs,
          signals: signalRefs,
          scenarios: scenarioRefs,
          tools: TOOL_DESCRIPTIONS,
          shapes: Shape.options,
        },
        schema: Plan,
        tier: 'fast',
        ...(req.clientId ? { clientId: req.clientId } : {}),
      });
      if (r.status === 'ok') {
        plan = r.data;
        planner = 'claude';
      } else {
        warnings.push(`Planner fell back to the grammar: ${r.note}`);
      }
    }
    plan ??= planFromGrammar(req.text, {
      clock: at,
      contextClientId: req.clientId ?? null,
      clients: clientRefs,
      signals: signalRefs,
      scenarios: scenarioRefs,
    });
    const scopeName = clientRefs.find((c) => c.clientId === plan.scopeClientId)?.name ?? null;

    // 2. Execute (read-only)
    const executed: Executed[] = await Promise.all(plan.calls.map((c) => this.tools.run(c, at)));

    // 3. Proposals
    const proposals = plan.proposals
      .map((d) => this.materialise(d, executed, clientRefs, req.text, at))
      .filter((p): p is Proposal => p !== null);

    // 4. Compose
    const templ = compose(plan, executed, at, scopeName);
    warnings.push(...templ.warnings);
    let composer: AssistantResponse['composer'] = 'template';
    let answer = templ.answer;
    let bullets = templ.bullets;
    let followUps = templ.followUps;
    if (this.gateway.mode === 'live' && plan.intent !== 'go' && plan.intent !== 'help') {
      const r = await this.gateway.structured({
        prompt: ASSISTANT_COMPOSER_PROMPT,
        input: {
          question: req.text,
          scope: scopeName,
          clock: at,
          facts: { answer: templ.answer, bullets: templ.bullets, cards: templ.cards },
          results: executed.map((e) => ({
            tool: e.call.tool,
            args: e.call.args,
            error: e.error,
            data: trim(e.result?.data),
          })),
        },
        schema: ComposerOutput,
        tier: 'analysis',
        ...(plan.scopeClientId ? { clientId: plan.scopeClientId } : {}),
      });
      if (r.status === 'ok') {
        const unmatched = unmatchedFigures(
          r.data.answer + ' ' + r.data.bullets.join(' '),
          JSON.stringify({ facts: templ, results: executed.map((e) => e.result?.data) }),
        );
        if (unmatched.length > 0) {
          warnings.push(
            `${unmatched.length} figure${unmatched.length === 1 ? '' : 's'} in the written answer could not be matched to tool results: ${unmatched.join(', ')}.`,
          );
        }
        composer = 'claude';
        answer = r.data.answer;
        bullets = r.data.bullets;
        followUps = r.data.followUps;
      } else {
        warnings.push(`Writer fell back to the template: ${r.note}`);
      }
    }

    return {
      intent: plan.intent,
      scope: { clientId: plan.scopeClientId, clientName: scopeName },
      answer,
      bullets,
      cards: templ.cards,
      navigate: plan.navigate,
      proposals,
      trace: executed.map(toView),
      planner,
      composer,
      warnings,
      followUps,
      clock: at,
    };
  }

  /** Turns a planner's draft into a concrete card: resolves alerts and actions, fills defaults, warns. */
  private materialise(
    d: ProposalDraft,
    executed: Executed[],
    clients: { clientId: string; name: string }[],
    sentence: string,
    clock: string,
  ): Proposal | null {
    const client = clients.find((c) => c.clientId === d.clientId);
    if (!client) {
      return null;
    }
    const id = `p_${randomUUID().slice(0, 8)}`;
    const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS).toISOString();
    const mk = (
      title: string,
      effect: string,
      body: Record<string, unknown>,
      warning: string | null,
    ): Proposal => ({
      id,
      kind: d.kind,
      clientId: client.clientId,
      clientName: client.name,
      title,
      effect,
      body,
      warning,
      expiresAt,
    });
    const words = (d.match ?? '')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 4);
    const score = (s: string): number => words.filter((w) => s.toLowerCase().includes(w)).length;
    let p: Proposal | null = null;
    switch (d.kind) {
      case 'defer': {
        const until = typeof d.args.until === 'string' ? d.args.until : null;
        const reason =
          typeof d.args.reason === 'string' && d.args.reason.length >= 5
            ? d.args.reason
            : `Deferred from the assistant: “${sentence.slice(0, 200)}”`;
        p = mk(
          `Defer the call with ${client.name}${until ? ` to ${until}` : ''}`,
          `POST /book/call-plan/${client.clientId}/defer`,
          { until, reason },
          until
            ? until <= clock
              ? 'The date is not after the clock.'
              : null
            : 'No date understood; say “to Monday”, “to tomorrow” or a date.',
        );
        break;
      }
      case 'done': {
        const note = typeof d.args.note === 'string' ? d.args.note : null;
        p = mk(
          `Mark the call with ${client.name} done at ${clock}`,
          `POST /book/call-plan/${client.clientId}/done`,
          note ? { note } : {},
          null,
        );
        break;
      }
      case 'draft': {
        const risk = executed.find((e) => e.result?.tool === 'risk')?.result;
        const approved =
          risk?.tool === 'risk'
            ? risk.data.actions.filter((a) => a.decision?.decision === 'approved').map((a) => a.id)
            : [];
        const body = DraftRequest.parse({
          channel: d.args.channel ?? 'email',
          tone: d.args.tone ?? 'formal',
          actionIds: approved,
          signalIds: [],
        });
        p = mk(
          `Draft ${body.channel} outreach for ${client.name} in the reporting language`,
          `POST /clients/${client.clientId}/outreach/draft`,
          body,
          approved.length === 0
            ? 'No approved action to draft from; the draft will cover the open items only.'
            : null,
        );
        break;
      }
      case 'triage': {
        const wf = executed.find((e) => e.result?.tool === 'workflow')?.result;
        const alerts =
          wf?.tool === 'workflow' ? wf.data.alerts.filter((a) => a.triage === null) : [];
        const best = [...alerts].sort(
          (a, b) => score(`${b.title} ${b.kind}`) - score(`${a.title} ${a.kind}`),
        )[0];
        if (!best || score(`${best.title} ${best.kind}`) === 0) {
          p = mk(
            `Triage an alert for ${client.name}`,
            `POST /clients/${client.clientId}/alerts/:alertId/triage`,
            {},
            alerts.length
              ? `Which alert? Open: ${alerts.map((a) => a.title).join('; ')}`
              : 'No open alert to triage.',
          );
          break;
        }
        const body = TriageRequest.parse({
          decision: d.args.decision ?? 'triaged',
          ...(typeof d.args.reason === 'string' ? { reason: d.args.reason } : {}),
        });
        p = mk(
          `${body.decision === 'dismissed' ? 'Dismiss' : 'Triage'} “${best.title}”`,
          `POST /clients/${client.clientId}/alerts/${best.id}/triage`,
          { alertId: best.id, ...body },
          null,
        );
        break;
      }
      case 'decision': {
        const risk = executed.find((e) => e.result?.tool === 'risk')?.result;
        const entityType = d.args.entityType === 'trade_idea' ? 'trade_idea' : 'action';
        const pool =
          risk?.tool === 'risk'
            ? entityType === 'action'
              ? risk.data.actions
                  .filter((a) => a.decision === null)
                  .map((a) => ({
                    id: a.id,
                    title: a.title,
                    blocked: a.suitability.status === 'blocked',
                  }))
              : risk.data.tradeIdeas
                  .filter((i) => i.decision === null)
                  .map((i) => ({
                    id: i.id,
                    title: i.title,
                    blocked: i.suitability.status === 'blocked',
                  }))
            : [];
        const n = /\b(?:action|idea|#)\s*(\d)\b/i.exec(d.match ?? '')?.[1];
        const byRank =
          n !== undefined && risk?.tool === 'risk' && entityType === 'action'
            ? risk.data.actions.find((a) => a.rank === Number(n))
            : undefined;
        const best = byRank
          ? { id: byRank.id, title: byRank.title, blocked: byRank.suitability.status === 'blocked' }
          : [...pool].sort((a, b) => score(b.title) - score(a.title))[0];
        if (!best || (!byRank && score(best.title) === 0 && pool.length !== 1)) {
          p = mk(
            `Decide on an ${entityType === 'action' ? 'action' : 'idea'} for ${client.name}`,
            `POST /clients/${client.clientId}/actions/:id/decide`,
            {},
            pool.length
              ? `Which one? Open: ${pool.map((a) => a.title).join('; ')}`
              : 'Nothing open to decide.',
          );
          break;
        }
        const body = DecideRequest.parse({
          entityType,
          decision: d.args.decision ?? 'approved',
          ...(typeof d.args.note === 'string' ? { note: d.args.note } : {}),
        });
        p = mk(
          `${body.decision === 'approved' ? 'Approve' : 'Reject'} “${best.title}”`,
          `POST /clients/${client.clientId}/actions/${best.id}/decide`,
          { actionId: best.id, ...body },
          best.blocked && body.decision === 'approved'
            ? 'Blocked by a suitability rule; approval will be refused.'
            : null,
        );
        break;
      }
      case 'override': {
        const parsed = OverrideRequest.safeParse({
          dimension: d.args.dimension,
          score: d.args.score,
          reason: d.args.reason,
        });
        p = mk(
          `Override ${strOf(d.args.dimension) || 'a rubric dimension'} to ${typeof d.args.score === 'number' ? String(d.args.score) : '?'} for ${client.name}`,
          `POST /clients/${client.clientId}/rubric/override`,
          {
            dimension: d.args.dimension ?? null,
            score: d.args.score ?? null,
            reason: d.args.reason ?? null,
          },
          parsed.success
            ? null
            : 'Needs a dimension (capacity, appetite, horizon), a score 1–3 and a reason of at least ten characters.',
        );
        break;
      }
      default:
        p = null;
    }
    if (p) {
      this.proposals.set(p.id, {
        proposal: p,
        sentence,
        clock,
        expiresAt: Date.now() + PROPOSAL_TTL_MS,
      });
      this.sweep();
    }
    return p;
  }

  /** Performs a confirmed proposal with the same service call the screens use, then logs its origin. */
  async confirm(proposalId: string): Promise<ConfirmResponse> {
    const stored = this.proposals.get(proposalId);
    if (!stored || stored.expiresAt < Date.now()) {
      this.proposals.delete(proposalId);
      throw new ProposalError(
        'This proposal has expired or was already used. Ask again to get a fresh card.',
      );
    }
    const { proposal: p, clock, sentence } = stored;
    if (p.warning && !/will cover the open items|Blocked by a suitability rule/.test(p.warning)) {
      throw new ProposalError(`Cannot confirm: ${p.warning}`);
    }
    let result: string;
    switch (p.kind) {
      case 'defer': {
        const body = DeferCallRequest.parse(p.body);
        await this.calls.defer(p.clientId, body, clock);
        result = `Call deferred to ${body.until}.`;
        break;
      }
      case 'done':
        await this.calls.done(
          p.clientId,
          { ...(typeof p.body.note === 'string' ? { note: p.body.note } : {}) },
          clock,
        );
        result = 'Call marked done.';
        break;
      case 'draft': {
        const body = DraftRequest.parse(p.body);
        const draft = await this.workflow.draft(p.clientId, body, clock);
        result = `Draft “${draft.subject}” created (${draft.language}, ${draft.source}).`;
        break;
      }
      case 'triage': {
        const alertId = strOf(p.body.alertId);
        const body = TriageRequest.parse({
          decision: p.body.decision,
          ...(typeof p.body.reason === 'string' ? { reason: p.body.reason } : {}),
        });
        await this.workflow.triage(p.clientId, alertId, body);
        result = `Alert ${body.decision}.`;
        break;
      }
      case 'decision': {
        const actionId = strOf(p.body.actionId);
        const body = DecideRequest.parse({
          entityType: p.body.entityType,
          decision: p.body.decision,
          ...(typeof p.body.note === 'string' ? { note: p.body.note } : {}),
        });
        await this.risk.decide(p.clientId, actionId, body, clock);
        result = `${body.entityType === 'action' ? 'Action' : 'Idea'} ${body.decision}.`;
        break;
      }
      case 'override': {
        const body = OverrideRequest.parse(p.body);
        await this.rubric.override(p.clientId, body);
        result = `${body.dimension} overridden to ${body.score}.`;
        break;
      }
      default:
        throw new ProposalError('Unknown proposal kind.');
    }
    const meta = await this.ctx.meta();
    await this.audit.record({
      kind: 'ASSISTANT_CONFIRMED',
      actor: meta.rm.id,
      clientId: p.clientId,
      entityType: 'proposal',
      entityId: p.id,
      summary: `Confirmed from language: ${p.title}`,
      payload: {
        origin: 'language',
        sentence,
        kind: p.kind,
        effect: p.effect,
        body: p.body,
        clock,
      },
    });
    this.proposals.delete(proposalId);
    return { proposalId, kind: p.kind, clientId: p.clientId, result };
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, s] of this.proposals) {
      if (s.expiresAt < now) {
        this.proposals.delete(id);
      }
    }
  }
}

/** Keeps tool results small for the writer: arrays capped, long strings cut. */
function trim(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) {
    return v.slice(0, 12).map((x) => trim(x, depth + 1));
  }
  if (v && typeof v === 'object') {
    if (depth > 4) {
      return '…';
    }
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, trim(x, depth + 1)]),
    );
  }
  if (typeof v === 'string' && v.length > 400) {
    return `${v.slice(0, 400)}…`;
  }
  return v;
}

/** Figures in the written answer that do not occur anywhere in the facts, for the honesty warning. */
export function unmatchedFigures(answer: string, facts: string): string[] {
  const nums = answer.match(/\d[\d,]*\.?\d*/g) ?? [];
  const compact = facts.replace(/,/g, '');
  const out: string[] = [];
  for (const raw of new Set(nums)) {
    const n = raw.replace(/,/g, '');
    if (n.replace(/\D/g, '').length < 2) {
      continue;
    }
    const digits = n.replace(/\.0+$/, '');
    if (!compact.includes(digits) && !compact.includes(digits.replace(/\.\d+$/, ''))) {
      out.push(raw);
    }
  }
  return out;
}

const strOf = (v: unknown): string => (typeof v === 'string' ? v : '');
