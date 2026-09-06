/**
 * The template composer: writes the answer from tool results without a language model. One
 * writer per question shape; unknown shapes get a generic summary per tool. Every figure comes
 * from a tool result. Claude, when live, rewrites these facts; it never adds one.
 */
import type { AnswerCard, HorizonItem, Signal } from '@jb/contracts';
import { daysBetween } from '../domain/dates.js';
import type { Plan } from './plan.js';
import type { Executed, ToolResult } from './tools.js';

export interface Composition {
  answer: string;
  bullets: string[];
  cards: AnswerCard[];
  followUps: string[];
  warnings: string[];
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const money = (n: number): string => `${n < 0 ? '−' : ''}${usd.format(Math.abs(n))}`;
const pct = (n: number, d = 1): string => `${n > 0 ? '+' : ''}${n.toFixed(d)}%`;
const day = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

type DataOf<T extends ToolResult['tool']> = Extract<ToolResult, { tool: T }>['data'];

function pick<T extends ToolResult['tool']>(ex: Executed[], tool: T): DataOf<T> | null {
  const hit = ex.find((e) => e.result?.tool === tool);
  if (!hit?.result) {
    return null;
  }
  return hit.result.data as unknown as DataOf<T> | null;
}

export function compose(
  plan: Plan,
  ex: Executed[],
  clock: string,
  clientName: string | null,
): Composition {
  const errors = ex.filter((e) => e.error).map((e) => `${e.call.tool}: ${e.error ?? ''}`);
  const base: Composition = { answer: '', bullets: [], cards: [], followUps: [], warnings: errors };
  const who = clientName ?? 'this client';
  const link = plan.scopeClientId ? `/clients/${plan.scopeClientId}` : null;

  switch (plan.shape) {
    case null:
      break;
    case 'help':
      return {
        ...base,
        answer: `${typeof plan.entities.note === 'string' ? `${plan.entities.note} ` : ''}I answer from the workbench's own engines: ask about a client, a group of clients, or the market signals; say “show me …” to open a room; or say what to do (“defer Lau to Monday, travelling”) and I will propose it for your confirmation.`,
        bullets: [
          'Client: “why is Lau first”, “what is his LTV”, “what did the Fed hold do to Zhang”, “does selling the perpetual clear the limit”, “what did he say about the property”, “run the escalation scenario, severe”.',
          'Book: “who should hear about the Fed hold”, “who has excluded holdings”, “which clients have not been contacted in 60 days”, “who has KYC due in 45 days”, “compare Lau and Zhang”, “how is the book”.',
          'Market: “what are the latest signals”, “what scenarios do we have”.',
          'Tasks: “defer … to …, because …”, “log the call: …”, “approve the collateral action”, “dismiss the KYC alert”, “override appetite to 1 because …”, “draft the email”. Nothing is written until you confirm.',
        ],
        followUps: ['who should I call first today?', 'what are the latest market signals?'],
      };
    case 'go':
      return { ...base, answer: `Opening ${plan.navigate ?? 'the page'}.` };
    case 'do':
      return {
        ...base,
        answer: plan.proposals.length
          ? `I have prepared ${plan.proposals.length} task${plan.proposals.length === 1 ? '' : 's'} for ${who}. Nothing is written until you confirm each card.`
          : `I could not turn that into a task for ${who}.`,
      };
    case 'book-summary': {
      const b = pick(ex, 'book');
      if (!b) {
        break;
      }
      const k = b.kpis;
      return {
        ...base,
        answer: `${k.clients} clients hold ${money(k.aumUsd)}, ${pct(k.ytdChangePct)} since the baseline. ${k.items.now} item${k.items.now === 1 ? '' : 's'} need action now, ${k.items.week} this week, ${k.items.month} this month.`,
        bullets: [
          `${k.clientsInBreach} client${k.clientsInBreach === 1 ? '' : 's'} outside a mandate band; ${k.facilitiesNearTrigger} facilit${k.facilitiesNearTrigger === 1 ? 'y' : 'ies'} within 5 points of the margin-call trigger.`,
          `KYC: ${k.kycOverdue} overdue, ${k.kycDueSoon} due within 45 days. Rubric assessed for ${k.rubricAssessed} of ${k.clients}.`,
          `Most urgent: ${b.clients
            .slice(0, 3)
            .map((c) => `${c.name} (${c.urgencyScore})`)
            .join(', ')}.`,
        ],
        followUps: ['who should I call first today?', 'which clients need action now?'],
      };
    }
    case 'call-sheet': {
      const p = pick(ex, 'callPlan');
      if (!p) {
        break;
      }
      const today = p.entries.filter(
        (e) => e.status === 'planned' && e.kind === 'call' && e.day === p.planDay,
      );
      return {
        ...base,
        answer: `${today.length} call${today.length === 1 ? '' : 's'} today (${day(p.planDay)}), packed by due date then priority. ${today[0] ? `First: ${today[0].clientName}, ${today[0].slot ? `${today[0].slot.rmStart}–${today[0].slot.rmEnd}` : 'write first'}.` : ''}`,
        cards: [
          {
            title: 'Call sheet',
            columns: ['#', 'Client', 'Due', 'Slot', 'Channel', 'Priority', 'Why'],
            rows: today.map((e, i) => ({
              cells: [
                String(i + 1),
                e.clientName,
                e.dueBy <= clock ? 'today' : day(e.dueBy),
                e.slot ? `${e.slot.rmStart}–${e.slot.rmEnd}` : 'write first',
                e.channel,
                String(e.priority),
                e.talkingPoints[0] ?? '',
              ],
              link: e.link,
            })),
          },
        ],
        followUps: today[0] ? [`why is ${today[0].clientName.split(' ')[0]} first?`] : [],
      };
    }
    case 'why-first': {
      const p = pick(ex, 'callPlan');
      const e = p?.entries.find((x) => x.clientId === plan.scopeClientId);
      if (!p || !e) {
        break;
      }
      const rank =
        p.entries
          .filter((x) => x.status === 'planned' && x.kind === 'call')
          .findIndex((x) => x.clientId === e.clientId) + 1;
      const terms = e.terms.filter((t) => t.points !== 0);
      return {
        ...base,
        answer: `${e.clientName} is ${rank > 0 ? `call ${rank}` : e.status} with priority ${e.priority}, due ${e.dueBy <= clock ? 'today' : day(e.dueBy)}: ${e.dueReason}. ${e.slot ? `Best slot ${e.slot.rmStart}–${e.slot.rmEnd} (${e.slot.note}), ${e.channel} in ${e.language}.` : `No shared business hours; write first.`}`,
        bullets: terms.map((t) => `${t.term}: ${t.points > 0 ? '+' : ''}${t.points} — ${t.detail}`),
        followUps: [
          `what should I say to ${e.clientName.split(' ')[0]}?`,
          `defer ${e.clientName.split(' ')[0]} to tomorrow`,
        ],
      };
    }
    case 'client-summary': {
      const o = pick(ex, 'clientOverview');
      const r = pick(ex, 'risk');
      const cf = pick(ex, 'clientCashflows');
      if (!o) {
        break;
      }
      const bullets: string[] = [];
      if (r) {
        bullets.push(
          `Combined risk ${r.matrix.cell}, composite ${r.gauge.composite.toFixed(1)}/10; ${r.actions.length} ranked action${r.actions.length === 1 ? '' : 's'}${r.actions[0] ? `, first: ${r.actions[0].title}` : ''}.`,
        );
        if (r.mismatches.length) {
          bullets.push(`Mismatches: ${r.mismatches.join('; ')}.`);
        }
      }
      for (const f of cf?.facilities ?? []) {
        bullets.push(
          `${f.type} at ${f.ltvPct.toFixed(1)}% LTV against a ${f.marginCallLtvPct}% trigger.`,
        );
      }
      const next = cf?.needs
        .filter((n) => n.status !== 'running')
        .sort((a, b) => a.daysUntil - b.daysUntil)[0];
      if (next) {
        bullets.push(
          `Next cash need: ${next.description}, ${next.currency} ${Math.round(next.amount).toLocaleString('en-US')} from ${day(next.dueFrom)}.`,
        );
      }
      if (o.alerts.length) {
        bullets.push(
          `${o.alerts.length} active alert${o.alerts.length === 1 ? '' : 's'}: ${o.alerts
            .slice(0, 3)
            .map((a) => a.title)
            .join('; ')}.`,
        );
      }
      return {
        ...base,
        answer: `${o.client.name}, ${o.client.lifeStage.toLowerCase()}, ${o.client.riskProfile} ${o.client.riskToleranceScore}/10, booked in ${o.client.bookingCentre}. Household ${money(o.kpis.aumUsd)}, ${pct(o.kpis.ytdChangePct)} since the baseline, ${o.kpis.cashPct.toFixed(0)}% cash. Last contact ${o.client.lastContactDate ? `${day(o.client.lastContactDate)} (${o.client.lastContactChannel ?? ''})` : 'none on record'}.`,
        bullets,
        followUps: [
          'what happened since the baseline?',
          'what should I do next?',
          'what did he say last time?',
        ],
      };
    }
    case 'what-happened': {
      const c = pick(ex, 'clientChange');
      const s = pick(ex, 'signals');
      if (!c) {
        break;
      }
      const total = c.endUsd - c.startUsd;
      const movers = [...c.movers]
        .sort((a, b) => Math.abs(b.priceEffectUsd) - Math.abs(a.priceEffectUsd))
        .slice(0, 3);
      const reaching = (s?.signals ?? [])
        .filter((x) => (x.client?.exposedPct ?? 0) > 0)
        .sort((a, b) => (b.client?.exposedPct ?? 0) - (a.client?.exposedPct ?? 0));
      return {
        ...base,
        answer: `${money(total)} (${pct((c.endUsd / c.startUsd - 1) * 100)}) from ${day(c.from)} to ${day(c.to)}: price ${money(c.priceEffectUsd)}, FX ${money(c.fxEffectUsd)}, flows ${money(c.flowEffectUsd)}.`,
        bullets: [
          ...movers.map(
            (m) =>
              `${m.name}: ${money(m.priceEffectUsd)}${m.pricePct !== null ? ` (${pct(m.pricePct)})` : ''}`,
          ),
          ...reaching
            .slice(0, 3)
            .map(
              (x) =>
                `${day(x.date)} ${x.title}: ${x.client?.exposedPct.toFixed(0)}% of the household exposed`,
            ),
        ],
        followUps: ['what could happen next?', 'what should I do?'],
      };
    }
    case 'ltv': {
      const cf = pick(ex, 'clientCashflows');
      if (!cf) {
        break;
      }
      if (cf.facilities.length === 0) {
        return { ...base, answer: `${who} has no credit facility on record.` };
      }
      const f = cf.facilities[0];
      if (!f) {
        break;
      }
      const head = f.marginCallLtvPct - f.ltvPct;
      const series = f.ltvSeries;
      const prev = series.length >= 2 ? series[series.length - 2] : undefined;
      return {
        ...base,
        answer: `${f.type} in ${f.currency}: drawn ${f.drawn.toLocaleString('en-US')} of ${f.limit.toLocaleString('en-US')}, LTV ${f.ltvPct.toFixed(1)}% against a ${f.marginCallLtvPct}% margin-call trigger, ${head.toFixed(1)} points of headroom${prev ? ` (${prev.headroom.toFixed(1)} at ${day(prev.snapshotDate)}${prev.headroom > head ? ', falling' : prev.headroom < head ? ', improving' : ''})` : ''}.`,
        bullets: series.map(
          (p) =>
            `${day(p.snapshotDate)}: LTV ${p.ltvPct.toFixed(1)}%, headroom ${p.headroom.toFixed(1)}`,
        ),
        followUps: [
          'what happens in the escalation scenario?',
          'what should I do about the collateral?',
        ],
      };
    }
    case 'cash': {
      const cf = pick(ex, 'clientCashflows');
      if (!cf) {
        break;
      }
      const needs = cf.needs
        .filter((n) => n.status !== 'running')
        .sort((a, b) => a.daysUntil - b.daysUntil);
      return {
        ...base,
        answer: `Daily-liquid assets ${money(cf.liquidity.dailyUsd)}; needs in the next twelve months ${money(cf.coverage12m.needsUsd)}${cf.coverage12m.ratio !== null ? `, covered ${cf.coverage12m.ratio.toFixed(1)}x` : ''}. Gated ${money(cf.liquidity.gatedUsd)}, illiquid ${money(cf.liquidity.illiquidUsd)}.`,
        bullets: [
          ...needs
            .slice(0, 4)
            .map(
              (n) =>
                `${day(n.dueFrom)}: ${n.description}, ${n.currency} ${Math.round(n.amount).toLocaleString('en-US')} (${money(n.amountUsd)}), ${n.certainty.toLowerCase()}, in ${n.daysUntil} days`,
            ),
          ...cf.commitments.map(
            (c) => `Uncalled ${money(c.uncalledUsd)} to ${c.fundName}, ${c.window}`,
          ),
        ],
        followUps: ['what is his LTV?', 'what could happen to liquidity in a severe scenario?'],
      };
    }
    case 'rubric': {
      const r = pick(ex, 'rubric');
      const o = pick(ex, 'clientOverview');
      if (r === null) {
        return {
          ...base,
          answer: `${who} has no rubric assessment yet. Open the rubric room to assess capacity, appetite and horizon.`,
          followUps: [],
        };
      }
      const dims = r.dimensions.map(
        (d) =>
          `${d.dimension} ${d.effectiveScore}${d.overrideScore !== null ? ` (system ${d.systemScore}, overridden)` : ''}, confidence ${Math.round(d.confidence.overall * 100)}%`,
      );
      return {
        ...base,
        answer: `Rubric ${r.status === 'locked' ? 'locked' : 'draft'}, assessed ${day(r.createdAt.slice(0, 10))}: ${dims.join('; ')}. Stated profile ${r.stated.riskProfile} ${r.stated.riskScore}/10, horizon ${r.stated.horizonYears} years${o ? `` : ''}.`,
        bullets: r.mismatches.map((m) => `${m.severity}: ${m.message}`),
        followUps: ['why is appetite scored that way?', 'what actions follow from the mismatches?'],
      };
    }
    case 'risk': {
      const r = pick(ex, 'risk');
      if (!r) {
        break;
      }
      return {
        ...base,
        answer: `${r.matrix.cell}: vulnerability ${r.vulnerability.level}, signal risk ${r.signalRisk.level}, composite ${r.gauge.composite.toFixed(1)}/10${r.signalRisk.stressPct !== null ? `; base-case stress of recent signals ${pct(r.signalRisk.stressPct)}` : ''}.`,
        bullets: [
          ...r.vulnerability.reasons.slice(0, 3),
          ...r.actions
            .slice(0, 4)
            .map(
              (a) =>
                `#${a.rank} ${a.title} (${a.urgency}, suitability ${a.suitability.status}${a.decision ? `, ${a.decision.decision}` : ''})`,
            ),
        ],
        followUps: ['approve the first action', 'what trade ideas fit?'],
      };
    }
    case 'ideas': {
      const r = pick(ex, 'risk');
      if (!r) {
        break;
      }
      const ok = r.tradeIdeas.filter((i) => i.suitability.status !== 'blocked');
      const blocked = r.tradeIdeas.filter((i) => i.suitability.status === 'blocked');
      return {
        ...base,
        answer: `${ok.length} idea${ok.length === 1 ? '' : 's'} pass suitability${blocked.length ? `, ${blocked.length} blocked and shown so you know why not` : ''}.`,
        bullets: [
          ...ok.map(
            (i) =>
              `${i.direction.toUpperCase()} ${i.title}: ${i.rationale} (confidence ${Math.round(i.confidence * 100)}%)`,
          ),
          ...blocked.map(
            (i) =>
              `Blocked: ${i.title} — ${i.suitability.checks
                .filter((c) => !c.passed)
                .map((c) => c.detail)
                .join('; ')}`,
          ),
        ],
        followUps: ['draft the email about the first idea'],
      };
    }
    case 'exposure': {
      const e = pick(ex, 'clientExposure');
      if (!e) {
        break;
      }
      const top = [...e.names].sort((a, b) => b.totalPct - a.totalPct).slice(0, 5);
      return {
        ...base,
        answer: `Household ${money(e.totalUsd)} looked through at ${day(e.snapshotDate)}. Largest names: ${top
          .slice(0, 3)
          .map(
            (n) =>
              `${n.exposureName} ${n.totalPct.toFixed(1)}%${n.breached ? ` (over the ${n.limitPct}% limit)` : ''}`,
          )
          .join(', ')}.`,
        bullets: [
          ...e.bySector
            .slice(0, 3)
            .map((s) => `${s.key}: ${s.lookthroughPct.toFixed(1)}% looked through`),
          ...e.byRegion.slice(0, 3).map((s) => `${s.key}: ${s.lookthroughPct.toFixed(1)}%`),
        ],
        cards: [
          {
            title: 'Exposure by name',
            columns: ['Name', 'Direct', 'Via notes', 'Total %', 'Limit'],
            rows: top.map((n) => ({
              cells: [
                n.exposureName,
                money(n.directUsd),
                money(n.viaNotesUsd),
                `${n.totalPct.toFixed(1)}%`,
                n.limitPct !== null ? `${n.limitPct}%${n.breached ? ' ✗' : ''}` : '—',
              ],
              link: link ? `${link}/portfolio/exposure` : null,
            })),
          },
        ],
        followUps: ['does trimming the largest position clear the limit?'],
      };
    }
    case 'sell-clears-limit': {
      const e = pick(ex, 'clientExposure');
      const phrase = strOf(plan.entities.instrument).toLowerCase();
      if (!e) {
        break;
      }
      const words = phrase.split(/\s+/).filter((w) => w.length >= 3);
      const score = (s: string): number => words.filter((w) => s.toLowerCase().includes(w)).length;
      const name = [...e.names].sort((a, b) => score(b.exposureName) - score(a.exposureName))[0];
      const src = e.names
        .flatMap((n) => n.sources.map((s) => ({ n, s })))
        .sort((a, b) => score(b.s.name) - score(a.s.name))[0];
      if (!name || !src || (score(name.exposureName) === 0 && score(src.s.name) === 0)) {
        return {
          ...base,
          answer: `I could not find “${phrase}” among ${who}'s looked-through exposures.`,
          followUps: ['what is his exposure?'],
        };
      }
      const target = score(src.s.name) >= score(name.exposureName) ? src.n : name;
      const sold = score(src.s.name) >= score(name.exposureName) ? src.s.usd : target.totalUsd;
      const afterTotal = e.totalUsd - sold;
      const afterUsd = target.totalUsd - sold;
      const afterPct = afterTotal > 0 ? (afterUsd / afterTotal) * 100 : 0;
      const limit = target.limitPct;
      return {
        ...base,
        answer: `Selling ${money(sold)} of ${src.s.name} takes ${target.exposureName} from ${target.totalPct.toFixed(1)}% to ${afterPct.toFixed(1)}% of the household${limit !== null ? `, ${afterPct <= limit ? 'inside' : 'still above'} the ${limit}% limit` : ''}. Held via ${target.sources.map((s) => `${s.name} (${s.via})`).join(', ')}.`,
        bullets: [
          `Assumes proceeds stay as cash and other positions are unchanged; run the impact room for the collateral effect.`,
        ],
        followUps: ['what is his LTV?', 'what trade ideas fit?'],
      };
    }
    case 'notes': {
      const n = pick(ex, 'clientNotes');
      if (!n) {
        break;
      }
      const kw = typeof plan.entities.keyword === 'string' ? plan.entities.keyword : null;
      const notes = n.notes.slice(0, 4);
      return {
        ...base,
        answer: notes.length
          ? `${n.notes.length} note${n.notes.length === 1 ? '' : 's'}${kw ? ` mention “${kw}”` : ' on record'}; quoted, newest first.`
          : `No note${kw ? ` mentions “${kw}”` : 's on record'}.`,
        bullets: notes.map((x) => `${day(x.date)} · ${x.channel} · “${x.text}”`),
        followUps: ['what should I avoid raising?'],
      };
    }
    case 'signal-impact': {
      const s = pick(ex, 'signals');
      const r = pick(ex, 'risk');
      const id = typeof plan.entities.signalId === 'string' ? plan.entities.signalId : null;
      if (!s) {
        break;
      }
      const reaching = s.signals.filter((x) => (x.client?.exposedPct ?? 0) > 0);
      const one = id ? s.signals.find((x) => x.id === id) : null;
      if (one) {
        const c = one.client;
        return {
          ...base,
          answer:
            c && c.exposedPct > 0
              ? `${one.title} (${day(one.date)}, ${one.severity.toLowerCase()}) reaches ${c.exposedPct.toFixed(1)}% of ${who}'s household (${money(c.exposedUsd)}). ${c.whyItMatters}`
              : `${one.title} does not reach ${who}'s holdings.`,
          bullets: c
            ? c.affected
                .slice(0, 5)
                .map(
                  (a) =>
                    `${a.name}: ${money(a.marketValueUsd)}${a.via !== 'direct' ? ` via ${a.via}` : ''}`,
                )
            : [],
          followUps: r ? ['what should I do about it?', `run the impact of this signal`] : [],
        };
      }
      return {
        ...base,
        answer: `${reaching.length} signal${reaching.length === 1 ? '' : 's'} reach ${who}'s holdings${r?.signalRisk.stressPct !== null && r ? `; base-case stress ${pct(r.signalRisk.stressPct)}` : ''}.`,
        bullets: reaching
          .slice(0, 5)
          .map(
            (x) =>
              `${day(x.date)} ${x.title} (${x.severity.toLowerCase()}): ${x.client?.exposedPct.toFixed(0)}% exposed — ${x.client?.whyItMatters ?? ''}`,
          ),
        followUps: ['what could happen in a severe case?'],
      };
    }
    case 'scenario': {
      const i = pick(ex, 'impact');
      const sc = pick(ex, 'scenarios');
      if (i) {
        const nm = strOf(plan.entities.scenarioName, 'the scenario');
        return {
          ...base,
          answer: `${nm} (${strOf(plan.entities.severity, 'base')}): household ${pct(i.total_pct)} (${money(i.total_usd)}), from ${money(i.start_usd)} to ${money(i.stressed_usd)}. Confidence band ${money(i.confidence.low_usd)} to ${money(i.confidence.high_usd)}.`,
          bullets: [
            ...i.collateral.map(
              (c) =>
                `Facility ${c.facility_id}: LTV ${c.ltv_before_pct.toFixed(1)}% → ${c.ltv_after_pct.toFixed(1)}%${c.breached_after ? ' — margin call' : ''}`,
            ),
            ...(i.liquidity.coverage_before !== null && i.liquidity.coverage_after !== null
              ? [
                  `Liquidity coverage ${i.liquidity.coverage_before.toFixed(1)}x → ${i.liquidity.coverage_after.toFixed(1)}x`,
                ]
              : []),
            ...i.by_asset_class
              .filter((a) => a.impact_usd !== 0)
              .slice(0, 4)
              .map((a) => `${a.asset_class}: ${money(a.impact_usd)} (${pct(a.impact_pct)})`),
          ],
          followUps: ['what should I do about the collateral?'],
        };
      }
      if (sc) {
        return {
          ...base,
          answer: `${sc.scenarios.length} named scenarios are available.`,
          bullets: sc.scenarios.map((s) => `${s.name}: ${s.description}`),
          followUps: sc.scenarios[0]
            ? [`run ${sc.scenarios[0].name} on the client in context`]
            : [],
        };
      }
      break;
    }
    case 'signals-today': {
      const s = pick(ex, 'signals');
      if (!s) {
        break;
      }
      const recent = [...s.signals].sort((a, b) => a.ageDays - b.ageDays).slice(0, 6);
      return {
        ...base,
        answer: `${s.signals.length} signal${s.signals.length === 1 ? '' : 's'} on record at ${day(s.clock)}; positions dated ${day(s.snapshotDate)}${s.stale ? ' (stale)' : ''}.`,
        bullets: recent.map(
          (x) =>
            `${day(x.date)} · ${x.severity} · ${x.title} — confidence ${x.confidence.overall}%`,
        ),
        followUps: recent[0] ? [`who should hear about ${shortTitle(recent[0])}?`] : [],
      };
    }
    case 'kyc': {
      const o = pick(ex, 'clientOverview');
      if (!o) {
        break;
      }
      const d = daysBetween(clock, o.client.kycReviewDue);
      return {
        ...base,
        answer: `${o.client.name}'s KYC review is due ${day(o.client.kycReviewDue)}, ${d < 0 ? `${-d} days overdue` : `in ${d} days`}. Last contact ${o.client.lastContactDate ? day(o.client.lastContactDate) : 'none on record'}.`,
        followUps: ['who else has KYC due in 45 days?'],
      };
    }
    case 'find': {
      const f = pick(ex, 'findClients');
      if (!f) {
        break;
      }
      const filt = Object.entries(f.filters)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k} ${String(v)}`)
        .join(', ');
      return {
        ...base,
        answer: `${f.clients.length} client${f.clients.length === 1 ? '' : 's'} match${f.clients.length === 1 ? 'es' : ''}${filt ? ` (${filt})` : ''}.`,
        cards: [
          {
            title: 'Matching clients',
            columns: ['Client', 'AUM', 'Urgency', 'Why'],
            rows: f.clients.map((c) => ({
              cells: [c.name, money(c.aumUsd), String(c.urgencyScore), c.why],
              link: c.link,
            })),
          },
        ],
        followUps: f.clients[0] ? [`open ${f.clients[0].name.split(' ')[0]}`] : [],
      };
    }
    case 'compare': {
      const c = pick(ex, 'compareClients');
      if (!c) {
        break;
      }
      const rows = c.rows;
      return {
        ...base,
        answer: `${rows.map((r) => `${r.name}: ${money(r.overview.kpis.aumUsd)}, ${pct(r.overview.kpis.ytdChangePct)}, urgency ${r.urgencyScore ?? '—'}`).join('; ')}.`,
        cards: [
          {
            title: 'Side by side',
            columns: ['', ...rows.map((r) => r.name)],
            rows: [
              { cells: ['AUM', ...rows.map((r) => money(r.overview.kpis.aumUsd))], link: null },
              {
                cells: ['Since baseline', ...rows.map((r) => pct(r.overview.kpis.ytdChangePct))],
                link: null,
              },
              {
                cells: ['Cash', ...rows.map((r) => `${r.overview.kpis.cashPct.toFixed(1)}%`)],
                link: null,
              },
              {
                cells: [
                  'Profile',
                  ...rows.map(
                    (r) =>
                      `${r.overview.client.riskProfile} ${r.overview.client.riskToleranceScore}/10`,
                  ),
                ],
                link: null,
              },
              { cells: ['Urgency', ...rows.map((r) => String(r.urgencyScore ?? '—'))], link: null },
              { cells: ['Top item', ...rows.map((r) => r.topItem ?? '—')], link: null },
              {
                cells: ['Alerts', ...rows.map((r) => String(r.overview.alerts.length))],
                link: null,
              },
              {
                cells: [
                  'Last contact',
                  ...rows.map((r) =>
                    r.overview.client.lastContactDate
                      ? day(r.overview.client.lastContactDate)
                      : '—',
                  ),
                ],
                link: null,
              },
            ],
          },
        ],
      };
    }
    default:
      break;
  }
  return generic(plan, ex, base);
}

function shortTitle(s: Signal): string {
  return s.title.split(/[:,(]/)[0]?.trim().toLowerCase() ?? s.title;
}

/** When no writer fits: one line per tool result. */
function generic(plan: Plan, ex: Executed[], base: Composition): Composition {
  const bullets: string[] = [];
  for (const e of ex) {
    const r = e.result;
    if (!r) {
      continue;
    }
    if (r.tool === 'book') {
      bullets.push(
        `Book: ${r.data.kpis.clients} clients, ${money(r.data.kpis.aumUsd)}, ${r.data.kpis.items.now} Now items.`,
      );
    } else if (r.tool === 'callPlan') {
      bullets.push(
        `Call plan: ${r.data.capacity.plannedToday} calls today; first ${r.data.entries[0]?.clientName ?? '—'}.`,
      );
    } else if (r.tool === 'clientOverview') {
      bullets.push(
        `${r.data.client.name}: ${money(r.data.kpis.aumUsd)}, ${pct(r.data.kpis.ytdChangePct)}, ${r.data.alerts.length} alerts.`,
      );
    } else if (r.tool === 'risk') {
      bullets.push(
        `Risk ${r.data.matrix.cell}, composite ${r.data.gauge.composite.toFixed(1)}; ${r.data.actions.length} actions.`,
      );
    } else if (r.tool === 'signals') {
      bullets.push(`${r.data.signals.length} signals at the clock.`);
    } else if (r.tool === 'workflow') {
      bullets.push(
        `Workflow: ${r.data.steps.filter((s) => s.status === 'done').length} of 9 steps done, ${r.data.alerts.length} alerts, ${r.data.outreach.length} drafts.`,
      );
    } else {
      bullets.push(`${r.tool}: available.`);
    }
  }
  return {
    ...base,
    answer: bullets.length
      ? `Here is what the engines say.`
      : `I could not compute an answer${plan.rationale ? ` (${plan.rationale})` : ''}.`,
    bullets,
  };
}

export function itemsLine(items: HorizonItem[]): string {
  return items
    .slice(0, 3)
    .map((i) => i.title)
    .join('; ');
}

const strOf = (v: unknown, fallback = ''): string =>
  typeof v === 'string' && v.length > 0 ? v : fallback;
