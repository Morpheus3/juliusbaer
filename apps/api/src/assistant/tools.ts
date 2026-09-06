/**
 * The tool executor: every tool a planner may call, implemented over the existing services and
 * domain modules. Tools never write. The same catalog will back the MCP server and the drawer.
 */
import type {
  BookResponse,
  CallPlanResponse,
  CashflowsResponse,
  ChangeResponse,
  ClientAlert,
  ClientOverviewResponse,
  CombinedRiskResponse,
  DatasetMeta,
  ExposureResponse,
  ImpactRequest,
  IdeasResponse,
  ImpactResponse,
  NotesResponse,
  PromisesResponse,
  RubricAssessmentResponse,
  Scenario,
  SignalsResponse,
  ToolCallView,
  WorkflowResponse,
} from '@jb/contracts';
import { ImpactRequest as ImpactRequestSchema } from '@jb/contracts';
import { daysBetween } from '../domain/dates.js';
import { snapshotForClock } from '../domain/signals/build.js';
import type { BookService } from '../services/bookService.js';
import type { CallPlanService } from '../services/callPlanService.js';
import type { ClientDetailService } from '../services/clientDetailService.js';
import type { DatasetContext } from '../services/datasetContext.js';
import type { RiskService } from '../services/riskService.js';
import type { RubricService } from '../services/rubricService.js';
import type { SignalService } from '../services/signalService.js';
import type { WorkflowService } from '../services/workflowService.js';
import type { IdeasService } from '../services/ideasService.js';
import type { PromiseService } from '../services/promiseService.js';
import type { ToolCall, ToolName } from './plan.js';

export interface FoundClient {
  clientId: string;
  name: string;
  aumUsd: number;
  urgencyScore: number;
  why: string;
  value: number | null;
  link: string;
}

export interface FindArgs {
  alertKind?: ClientAlert['kind'];
  theme?: string;
  lane?: 'now' | 'week' | 'month';
  uncontactedDays?: number;
  signalId?: string;
  minExposedPct?: number;
  kycDueWithinDays?: number;
  cashNeedWithinDays?: number;
  wealthBand?: string;
  place?: string;
  language?: string;
}

export interface CompareRow {
  clientId: string;
  name: string;
  overview: ClientOverviewResponse;
  urgencyScore: number | null;
  topItem: string | null;
}

export type ToolResult =
  | { tool: 'meta'; data: DatasetMeta }
  | { tool: 'book'; data: BookResponse }
  | { tool: 'callPlan'; data: CallPlanResponse }
  | { tool: 'clientOverview'; data: ClientOverviewResponse }
  | { tool: 'clientCashflows'; data: CashflowsResponse }
  | { tool: 'clientNotes'; data: NotesResponse }
  | { tool: 'clientChange'; data: ChangeResponse }
  | { tool: 'clientExposure'; data: ExposureResponse }
  | { tool: 'signals'; data: SignalsResponse }
  | { tool: 'risk'; data: CombinedRiskResponse }
  | { tool: 'rubric'; data: RubricAssessmentResponse | null }
  | { tool: 'workflow'; data: WorkflowResponse }
  | {
      tool: 'audit';
      data: {
        events: {
          kind: string;
          summary: string;
          actor: string;
          createdAt: string;
          clientId: string | null;
        }[];
      };
    }
  | { tool: 'scenarios'; data: { scenarios: Scenario[] } }
  | { tool: 'impact'; data: ImpactResponse }
  | { tool: 'findClients'; data: { filters: FindArgs; clients: FoundClient[] } }
  | { tool: 'compareClients'; data: { rows: CompareRow[] } }
  | { tool: 'promises'; data: PromisesResponse }
  | { tool: 'ideas'; data: IdeasResponse };

export interface Executed {
  call: ToolCall;
  result: ToolResult | null;
  error: string | null;
  ms: number;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export class AssistantTools {
  constructor(
    private readonly ctx: DatasetContext,
    private readonly book: BookService,
    private readonly calls: CallPlanService,
    private readonly detail: ClientDetailService,
    private readonly signals: SignalService,
    private readonly risk: RiskService,
    private readonly rubric: RubricService,
    private readonly workflow: WorkflowService,
    private readonly promises: PromiseService,
    private readonly ideas: IdeasService,
  ) {}

  async run(call: ToolCall, clock: string): Promise<Executed> {
    const started = Date.now();
    try {
      const result = await this.dispatch(call, clock);
      return { call, result, error: null, ms: Date.now() - started };
    } catch (err) {
      return {
        call,
        result: null,
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - started,
      };
    }
  }

  private async dispatch(call: ToolCall, clock: string): Promise<ToolResult> {
    const a = call.args;
    const cid = str(a.clientId);
    const need = (): string => {
      if (!cid) {
        throw new Error(`${call.tool} needs a clientId`);
      }
      return cid;
    };
    switch (call.tool) {
      case 'meta':
        return { tool: 'meta', data: await this.ctx.meta() };
      case 'book':
        return { tool: 'book', data: await this.book.cockpit(clock) };
      case 'callPlan':
        return { tool: 'callPlan', data: await this.calls.plan(clock) };
      case 'clientOverview':
        return { tool: 'clientOverview', data: await this.detail.overview(need()) };
      case 'clientCashflows':
        return { tool: 'clientCashflows', data: await this.detail.cashflows(need()) };
      case 'clientNotes': {
        const notes = await this.detail.notes(need());
        const kw = str(a.keyword)?.toLowerCase();
        return {
          tool: 'clientNotes',
          data: kw
            ? { ...notes, notes: notes.notes.filter((n) => n.text.toLowerCase().includes(kw)) }
            : notes,
        };
      }
      case 'clientChange': {
        const meta = await this.ctx.meta();
        const to =
          str(a.to) ??
          snapshotForClock(
            meta.snapshots.map((s) => s.date),
            clock,
          );
        return {
          tool: 'clientChange',
          data: await this.detail.change(need(), str(a.from) ?? meta.baseline, to),
        };
      }
      case 'clientExposure': {
        const meta = await this.ctx.meta();
        const snap = snapshotForClock(
          meta.snapshots.map((s) => s.date),
          clock,
        );
        return { tool: 'clientExposure', data: await this.detail.exposure(need(), snap) };
      }
      case 'signals':
        return { tool: 'signals', data: await this.signals.feed(clock, cid) };
      case 'risk':
        return { tool: 'risk', data: await this.risk.combined(need(), clock) };
      case 'rubric':
        return { tool: 'rubric', data: await this.rubric.latest(need()) };
      case 'workflow':
        return { tool: 'workflow', data: await this.workflow.state(need(), clock) };
      case 'audit': {
        const r = await this.rubric.audit(cid);
        return {
          tool: 'audit',
          data: {
            events: r.events.map((e) => ({
              kind: e.kind,
              summary: e.summary,
              actor: e.actor,
              createdAt: e.createdAt,
              clientId: e.clientId,
            })),
          },
        };
      }
      case 'scenarios':
        return { tool: 'scenarios', data: await this.signals.scenarios() };
      case 'impact': {
        const req: ImpactRequest = ImpactRequestSchema.parse({
          scenarioId: str(a.scenarioId),
          signalIds: Array.isArray(a.signalIds)
            ? a.signalIds.filter((x): x is string => typeof x === 'string')
            : [],
          severity: str(a.severity) ?? 'base',
          save: false,
        });
        return { tool: 'impact', data: await this.signals.impact(need(), req, clock) };
      }
      case 'findClients':
        return { tool: 'findClients', data: await this.find(a, clock) };
      case 'compareClients': {
        const ids = Array.isArray(a.clientIds)
          ? a.clientIds.filter((x): x is string => typeof x === 'string').slice(0, 4)
          : [];
        const [book, overviews] = await Promise.all([
          this.book.cockpit(clock),
          Promise.all(ids.map((id) => this.detail.overview(id))),
        ]);
        return {
          tool: 'compareClients',
          data: {
            rows: overviews.map((o) => {
              const row = book.clients.find((c) => c.clientId === o.client.clientId);
              return {
                clientId: o.client.clientId,
                name: o.client.name,
                overview: o,
                urgencyScore: row?.urgencyScore ?? null,
                topItem: row?.topItem ?? null,
              };
            }),
          },
        };
      }
      case 'promises':
        return {
          tool: 'promises',
          data: cid ? await this.promises.list(cid, clock) : await this.promises.openAll(clock),
        };
      case 'ideas':
        return {
          tool: 'ideas',
          data: await this.ideas.search(str(a.q), str(a.signalId), clock),
        };
      default: {
        const never: never = call.tool;
        throw new Error(`unknown tool ${String(never)}`);
      }
    }
  }

  /** Clients matching the filters, with a one-line why per client. Book-wide, one computation. */
  private async find(
    f: FindArgs,
    clock: string,
  ): Promise<{ filters: FindArgs; clients: FoundClient[] }> {
    const per = await this.book.perClient(clock);
    const at = per.at;
    const out: FoundClient[] = [];
    for (const { bundle: b, inputs, items } of per.rows) {
      const c = b.client;
      const reasons: string[] = [];
      let value: number | null = null;
      let keep = true;
      const aum = b.holdings
        .filter((h) => h.snapshotDate === per.snapshot)
        .reduce((s, h) => s + h.marketValueUsd, 0);

      if (f.alertKind) {
        const hits = inputs.alerts.filter((x) => x.kind === f.alertKind);
        if (hits.length === 0) {
          keep = false;
        } else {
          reasons.push(hits.map((x) => x.title).join('; '));
        }
      }
      if (keep && f.theme) {
        const hits = items.filter((i) => i.theme === f.theme);
        if (hits.length === 0) {
          keep = false;
        } else {
          reasons.push(hits[0]?.title ?? '');
        }
      }
      if (keep && f.lane) {
        const hits = items.filter((i) => i.lane === f.lane);
        if (hits.length === 0) {
          keep = false;
        } else {
          reasons.push(
            `${hits.length} item${hits.length === 1 ? '' : 's'} in the ${f.lane} lane: ${hits
              .slice(0, 2)
              .map((i) => i.title)
              .join('; ')}`,
          );
        }
      }
      if (keep && f.uncontactedDays !== undefined) {
        const last = [...b.notes]
          .filter((n) => n.noteDate <= at)
          .sort((x, y) => (x.noteDate < y.noteDate ? 1 : -1))[0];
        const days = last ? daysBetween(last.noteDate, at) : daysBetween(c.clientSince, at);
        if (days < f.uncontactedDays) {
          keep = false;
        } else {
          value = days;
          reasons.push(
            last
              ? `last note ${last.noteDate} (${days} days ago, ${last.channel.toLowerCase()})`
              : `no note since onboarding ${c.clientSince}`,
          );
        }
      }
      if (keep && f.signalId) {
        const s = inputs.signals.find((x) => x.id === f.signalId);
        const pct = s?.client?.exposedPct ?? 0;
        if (!s || pct < (f.minExposedPct ?? 0.01)) {
          keep = false;
        } else {
          value = pct;
          reasons.push(
            `${pct.toFixed(1)}% of the household exposed${s.client ? `: ${s.client.whyItMatters}` : ''}`,
          );
        }
      }
      if (keep && f.kycDueWithinDays !== undefined) {
        const d = daysBetween(at, c.kycReviewDue);
        if (d > f.kycDueWithinDays) {
          keep = false;
        } else {
          value = d;
          reasons.push(
            d < 0
              ? `KYC overdue by ${-d} days (${c.kycReviewDue})`
              : `KYC due in ${d} days (${c.kycReviewDue})`,
          );
        }
      }
      if (keep && f.cashNeedWithinDays !== undefined) {
        const soon = b.cashNeeds
          .map((n) => ({ n, d: daysBetween(at, n.dueFrom) }))
          .filter((x) => x.d >= -30 && x.d <= (f.cashNeedWithinDays ?? 0))
          .sort((x, y) => x.d - y.d);
        const first = soon[0];
        if (!first) {
          keep = false;
        } else {
          value = first.d;
          reasons.push(
            `${first.n.description}: ${first.n.currency} ${Math.round(first.n.amount).toLocaleString('en-US')} from ${first.n.dueFrom} (${first.d} days)`,
          );
        }
      }
      if (keep && f.wealthBand && c.wealthBand.toUpperCase() !== f.wealthBand.toUpperCase()) {
        keep = false;
      }
      if (keep && f.place) {
        const p = f.place.toLowerCase();
        if (
          !c.bookingCentre.toLowerCase().includes(p) &&
          !c.countryOfResidence.toLowerCase().includes(p)
        ) {
          keep = false;
        } else {
          reasons.push(`${c.countryOfResidence} resident, booked in ${c.bookingCentre}`);
        }
      }
      if (
        keep &&
        f.language &&
        !c.reportingLanguage.toLowerCase().includes(f.language.toLowerCase())
      ) {
        keep = false;
      }
      if (!keep) {
        continue;
      }
      if (reasons.length === 0) {
        reasons.push(
          `${c.wealthBand} · ${c.riskProfile} · ${items.length} open item${items.length === 1 ? '' : 's'}`,
        );
      }
      out.push({
        clientId: c.clientId,
        name: c.clientName,
        aumUsd: aum,
        urgencyScore: urgencyOf(items),
        why: reasons.join(' · '),
        value,
        link: `/clients/${c.clientId}`,
      });
    }
    out.sort(
      (x, y) =>
        (y.value ?? 0) - (x.value ?? 0) || y.urgencyScore - x.urgencyScore || y.aumUsd - x.aumUsd,
    );
    return { filters: f, clients: out };
  }
}

const LANE_RANK = { now: 3, week: 2, month: 1 } as const;
const SEV_W = { high: 3, medium: 2, low: 1 } as const;
function urgencyOf(
  items: { lane: keyof typeof LANE_RANK; severity: keyof typeof SEV_W; momentum: string }[],
): number {
  return (
    Math.round(
      items.reduce(
        (s, i) =>
          s +
          LANE_RANK[i.lane] * SEV_W[i.severity] +
          (i.momentum === 'escalated' || i.momentum === 'new' ? 1 : 0),
        0,
      ) * 10,
    ) / 10
  );
}

export function toView(e: Executed): ToolCallView {
  return {
    tool: e.call.tool,
    args: e.call.args,
    ok: e.error === null,
    summary: e.error ?? summarise(e.result),
    ms: e.ms,
  };
}

function summarise(r: ToolResult | null): string {
  if (!r) {
    return 'no result';
  }
  if (r.tool === 'book') {
    return `${r.data.clients.length} clients, ${r.data.items.length} items`;
  }
  if (r.tool === 'callPlan') {
    return `${r.data.entries.length} entries, ${r.data.capacity.plannedToday} calls today`;
  }
  if (r.tool === 'signals') {
    return `${r.data.signals.length} signals`;
  }
  if (r.tool === 'findClients') {
    return `${r.data.clients.length} clients matched`;
  }
  if (r.tool === 'clientNotes') {
    return `${r.data.notes.length} notes`;
  }
  if (r.tool === 'rubric') {
    return r.data ? `assessed ${r.data.createdAt.slice(0, 10)}` : 'not assessed';
  }
  if (r.tool === 'impact') {
    return `${r.data.total_pct.toFixed(1)}% household impact`;
  }
  if (r.tool === 'compareClients') {
    return `${r.data.rows.length} clients`;
  }
  if (r.tool === 'promises') {
    return `${r.data.promises.length} promises`;
  }
  if (r.tool === 'ideas') {
    return `${r.data.matches.length} matches, ${r.data.blocked.length} blocked, ${r.data.opportunities.length} opportunities`;
  }
  return 'ok';
}

export const ALL_TOOLS: ToolName[] = [
  'meta',
  'book',
  'callPlan',
  'clientOverview',
  'clientCashflows',
  'clientNotes',
  'clientChange',
  'clientExposure',
  'signals',
  'risk',
  'rubric',
  'workflow',
  'audit',
  'scenarios',
  'impact',
  'findClients',
  'compareClients',
];

export { num };
