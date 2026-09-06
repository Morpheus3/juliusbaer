import type { IdeaMatch, IdeasResponse, Opportunity, TradeIdea } from '@jb/contracts';
import { cashflows } from '../domain/cashflows.js';
import { daysBetween } from '../domain/dates.js';
import { exposure } from '../domain/exposure.js';
import { mandateStatus } from '../domain/mandate.js';
import { generateTradeIdeas } from '../domain/risk/tradeIdeas.js';
import type { RubricRepository } from '../repositories/rubricRepository.js';
import type { WorkflowRepository } from '../repositories/workflowRepository.js';
import type { BookService } from './bookService.js';
import { toScores, type StoredRubric } from './riskService.js';
import type { SignalService } from './signalService.js';

const METHOD = [
  'The trade-idea rules that run for one client in the risk room run here for every client in the book, from the same mandate, exposure, cash-flow and rubric inputs; no language model is involved.',
  'A query matches an idea when the signal it names motivated the idea or when its words appear in the idea’s title or rationale. Without a query, every idea in the book is listed.',
  'Ideas that fail the suitability gate are kept and shown as blocked with the failed rule, so the RM knows why not.',
  'Opportunities are rules with reasons: a dated cash need against thin liquid coverage is a lending conversation; repeated breaches are a discretionary-mandate conversation; succession, next-generation and deployment come from quoted notes.',
  'Uptake counts outreach drafts and sent messages whose context names the signal.',
];

const SUCCESSION =
  /succession|estate|trust structure|holding structure|heirs?|inherit|next generation|second generation|hand(?:ing)? over|handover|children/i;
const NEXT_GEN =
  /next generation|second generation|treasury function to him|son|daughter|eldest|children/i;
const DEPLOYMENT =
  /has not executed|not executed|waiting for a better entry|deferred the decision|agreed .* but has not/i;

export class IdeasService {
  constructor(
    private readonly book: BookService,
    private readonly rubric: RubricRepository,
    private readonly signals: SignalService,
    private readonly workflow: WorkflowRepository,
  ) {}

  async search(
    q: string | undefined,
    signalId: string | undefined,
    clock: string | undefined,
  ): Promise<IdeasResponse> {
    const [per, rubrics, feed, drafts] = await Promise.all([
      this.book.perClient(clock),
      this.rubric.latestForAll(),
      this.signals.feed(clock, undefined),
      this.workflow.allOutreach(),
    ]);
    const at = per.at;
    const rubricBy = new Map(
      rubrics.map((r) => [r.clientId, toScores(r.result as unknown as StoredRubric)]),
    );
    const sig = signalId ? (feed.signals.find((s) => s.id === signalId) ?? null) : null;
    const words = (q ?? '')
      .toLowerCase()
      .split(/\W+/)
      .filter(
        (w) =>
          w.length >= 4 &&
          ![
            'about',
            'should',
            'which',
            'clients',
            'client',
            'after',
            'hear',
            'idea',
            'ideas',
          ].includes(w),
      );
    const score = (s: string): number => words.filter((w) => s.toLowerCase().includes(w)).length;

    const matches: IdeaMatch[] = [];
    const blocked: IdeaMatch[] = [];
    const opportunities: Opportunity[] = [];
    for (const { bundle: b, inputs, items } of per.rows) {
      const mandate = mandateStatus(b, per.snapshot);
      const exp = exposure(b, per.snapshot);
      const cf = cashflows(b, at, per.snapshot);
      const ideas = generateTradeIdeas({
        bundle: b,
        snapshot: per.snapshot,
        mandate,
        exposure: exp,
        cashflows: cf,
        rubric: rubricBy.get(b.client.clientId) ?? null,
        signals: inputs.signals,
      });
      const aum = b.holdings
        .filter((h) => h.snapshotDate === per.snapshot)
        .reduce((s, h) => s + h.marketValueUsd, 0);
      for (const idea of ideas) {
        const bySignal = sig ? idea.motivatedBy.signalIds.includes(sig.id) : false;
        const byWords = words.length > 0 ? score(`${idea.title} ${idea.rationale}`) > 0 : false;
        if ((sig || words.length > 0) && !bySignal && !byWords) {
          continue;
        }
        const row: IdeaMatch = {
          clientId: b.client.clientId,
          clientName: b.client.clientName,
          aumUsd: aum,
          language: b.client.reportingLanguage,
          residence: b.client.countryOfResidence,
          idea,
          why: whyFor(idea, bySignal, sig?.title ?? null),
          link: `/clients/${b.client.clientId}/trade-ideas`,
        };
        (idea.suitability.status === 'blocked' ? blocked : matches).push(row);
      }

      // Opportunities
      const soon = b.cashNeeds
        .map((n) => ({ n, d: daysBetween(at, n.dueFrom) }))
        .filter((x) => x.d >= -30 && x.d <= 365)
        .sort((x, y) => x.d - y.d)[0];
      if (soon && cf.coverage12m.ratio !== null && cf.coverage12m.ratio < 2) {
        opportunities.push({
          clientId: b.client.clientId,
          clientName: b.client.clientName,
          kind: 'lending',
          title: `Lending conversation ahead of ${soon.n.description}`,
          why: `${soon.n.currency} ${Math.round(soon.n.amount).toLocaleString('en-US')} needed from ${soon.n.dueFrom}; daily-liquid assets cover ${cf.coverage12m.ratio.toFixed(1)}x of twelve-month needs${b.facilities.length ? `; ${b.facilities.length} facility already in place` : '; no facility on record'}.`,
          quote: null,
          quoteDate: null,
          link: `/clients/${b.client.clientId}/portfolio/cashflows`,
        });
      }
      const breaches = items.filter((i) => i.theme === 'mandate' || i.theme === 'concentration');
      if (
        breaches.length >= 2 &&
        mandate.portfolios.some((p) => p.managed && /advisory/i.test(p.serviceModel))
      ) {
        opportunities.push({
          clientId: b.client.clientId,
          clientName: b.client.clientName,
          kind: 'mandate',
          title: 'Discretionary-mandate conversation',
          why: `${breaches.length} open mandate or concentration items on an advisory portfolio: ${breaches
            .slice(0, 2)
            .map((i) => i.title)
            .join('; ')}.`,
          quote: null,
          quoteDate: null,
          link: `/clients/${b.client.clientId}/portfolio/exposure`,
        });
      }
      for (const n of [...b.notes].sort((x, y) => (x.noteDate < y.noteDate ? 1 : -1))) {
        const sentence = (re: RegExp): string | null =>
          n.note.split(/(?<=[.!?])\s+/).find((s) => re.test(s)) ?? null;
        const s1 = sentence(SUCCESSION);
        if (
          s1 &&
          !opportunities.some((o) => o.clientId === b.client.clientId && o.kind === 'succession')
        ) {
          opportunities.push({
            clientId: b.client.clientId,
            clientName: b.client.clientName,
            kind: 'succession',
            title: 'Succession and structuring conversation',
            why: 'A note raises succession, estate or structure.',
            quote: s1.trim(),
            quoteDate: n.noteDate,
            link: `/clients/${b.client.clientId}`,
          });
        }
        const s2 = sentence(NEXT_GEN);
        if (
          s2 &&
          s2 !== s1 &&
          !opportunities.some(
            (o) => o.clientId === b.client.clientId && o.kind === 'next-generation',
          )
        ) {
          opportunities.push({
            clientId: b.client.clientId,
            clientName: b.client.clientName,
            kind: 'next-generation',
            title: 'Next-generation relationship',
            why: 'A note mentions the next generation taking a role.',
            quote: s2.trim(),
            quoteDate: n.noteDate,
            link: `/clients/${b.client.clientId}`,
          });
        }
        const s3 = sentence(DEPLOYMENT);
        if (
          s3 &&
          !opportunities.some((o) => o.clientId === b.client.clientId && o.kind === 'deployment')
        ) {
          opportunities.push({
            clientId: b.client.clientId,
            clientName: b.client.clientName,
            kind: 'deployment',
            title: 'Decision debt: agreed but not executed',
            why: 'A note records an agreement the client has not acted on.',
            quote: s3.trim(),
            quoteDate: n.noteDate,
            link: `/clients/${b.client.clientId}#do`,
          });
        }
      }
    }
    matches.sort((a, b) => b.idea.confidence - a.idea.confidence || b.aumUsd - a.aumUsd);

    const recent = feed.signals.filter(
      (s) => (s.severity === 'SEVERE' || s.severity === 'HIGH') && s.ageDays <= 60,
    );
    const uptake = recent.map((s) => {
      const rows = drafts.filter((d) => {
        const ctxSignals = (d.context as { signals?: { id: string }[] }).signals ?? [];
        return ctxSignals.some((x) => x.id === s.id);
      });
      const reached = per.rows.filter((r) => r.inputs.signals.some((x) => x.id === s.id)).length;
      return {
        signalId: s.id,
        title: s.title,
        date: s.date,
        reached,
        drafted: new Set(rows.map((r) => r.clientId)).size,
        sent: new Set(rows.filter((r) => r.status === 'sent').map((r) => r.clientId)).size,
      };
    });

    return {
      clock: at,
      query: q ?? null,
      signal: sig ? { id: sig.id, title: sig.title, date: sig.date } : null,
      matches,
      blocked,
      opportunities,
      uptake,
      method: METHOD,
    };
  }
}

function whyFor(idea: TradeIdea, bySignal: boolean, signalTitle: string | null): string {
  const facts = idea.motivatedBy.facts.slice(0, 2).join('; ');
  return `${bySignal && signalTitle ? `Motivated by ${signalTitle}. ` : ''}${facts}${
    idea.suitability.status === 'blocked'
      ? ` · blocked: ${idea.suitability.checks
          .filter((c) => !c.passed)
          .map((c) => c.rule)
          .join(', ')}`
      : ''
  }`;
}
