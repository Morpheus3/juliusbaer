/**
 * Chapter openers for the client journey: sentences composed from computed facts, each chapter
 * naming the sources it drew on. Templates only; when Claude is live it may rewrite these
 * sentences but never add a fact.
 */
import type {
  CashflowsResponse,
  ChangeResponse,
  ClientOverviewResponse,
  CombinedRiskResponse,
  ImpactResponse,
  RubricAssessmentResponse,
  Scenario,
  Signal,
} from '@jb/contracts';
import { fmtDate, fmtUsdCompact } from '@/lib/format';

export interface Prose {
  sentences: string[];
  sources: string[];
}

const pct = (n: number, digits = 1): string => `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
const money = (n: number): string => `${n < 0 ? '−' : ''}${fmtUsdCompact(Math.abs(n))}`;
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** Chapter 1: who this is, what they hold and owe, what is coming. */
export function standingProse(
  o: ClientOverviewResponse,
  cf: CashflowsResponse | null,
  rubric: RubricAssessmentResponse | null,
  baseline: string,
): Prose {
  const c = o.client;
  const sentences: string[] = [];
  const sources = ['client record', 'holdings'];
  sentences.push(
    `${c.name}, ${lower(c.lifeStage)}, ${c.riskProfile} at ${c.riskToleranceScore}/10, booked in ${c.bookingCentre}.`,
  );
  sentences.push(
    `Household ${fmtUsdCompact(o.kpis.aumUsd)}, ${pct(o.kpis.ytdChangePct)} since ${fmtDate(baseline)}, ${o.kpis.cashPct.toFixed(0)}% in cash.`,
  );
  if (cf) {
    for (const f of cf.facilities) {
      const headroom = f.marginCallLtvPct - f.ltvPct;
      const series = f.ltvSeries;
      const prev = series.length >= 2 ? series[series.length - 2] : undefined;
      const falling = prev !== undefined && prev.headroom > headroom;
      sentences.push(
        `${f.type} at ${f.ltvPct.toFixed(1)}% LTV against a ${f.marginCallLtvPct.toFixed(0)}% trigger, ${headroom.toFixed(1)} points of headroom${falling ? ` and falling since ${fmtDate(prev.snapshotDate)}` : ''}.`,
      );
      sources.push('credit facility');
    }
    const next = cf.needs
      .filter((n) => n.status !== 'running')
      .sort((a, b) => a.daysUntil - b.daysUntil)[0];
    if (next) {
      const cover =
        cf.coverage12m.ratio === null
          ? 'no cash need falls in the next twelve months'
          : `daily-liquid assets cover ${cf.coverage12m.ratio.toFixed(1)}x of the next twelve months`;
      sentences.push(
        `Needs ${next.currency} ${Math.round(next.amount).toLocaleString('en-US')} for ${lower(next.description)} from ${fmtDate(next.dueFrom)}; ${cover}.`,
      );
      sources.push('planned cash needs');
    }
  }
  if (rubric) {
    const by = Object.fromEntries(rubric.dimensions.map((d) => [d.dimension, d.effectiveScore]));
    const mm = rubric.mismatches.length;
    sentences.push(
      `Rubric: capacity ${by.capacity ?? '—'}, appetite ${by.appetite ?? '—'}, horizon ${by.horizon ?? '—'}${mm > 0 ? `, ${mm} mismatch${mm > 1 ? 'es' : ''}` : ''}.`,
    );
    sources.push('rubric assessment');
  }
  return { sentences, sources: [...new Set(sources)] };
}

/** Chapter 2: how the household got here since the baseline, and which events reached it. */
export function happenedProse(change: ChangeResponse | null, reaching: Signal[]): Prose {
  const sentences: string[] = [];
  const sources: string[] = [];
  if (change) {
    const total = change.endUsd - change.startUsd;
    sentences.push(
      `${money(total)} since ${fmtDate(change.from)}: price ${money(change.priceEffectUsd)}, FX ${money(change.fxEffectUsd)}, flows ${money(change.flowEffectUsd)}.`,
    );
    const movers = [...change.movers]
      .sort((a, b) => Math.abs(b.priceEffectUsd) - Math.abs(a.priceEffectUsd))
      .slice(0, 2);
    if (movers.length > 0) {
      sentences.push(
        `Largest movers: ${movers
          .map(
            (m) => `${m.name} (${m.pricePct === null ? money(m.priceEffectUsd) : pct(m.pricePct)})`,
          )
          .join(', ')}.`,
      );
    }
    sources.push('attribution');
  }
  const top = [...reaching].sort(
    (a, b) => (b.client?.exposedPct ?? 0) - (a.client?.exposedPct ?? 0),
  )[0];
  if (top?.client) {
    sentences.push(
      `${reaching.length} signal${reaching.length === 1 ? '' : 's'} reached the household; the largest, ${top.title} (${fmtDate(top.date)}), touches ${top.client.exposedPct.toFixed(0)}% of it.`,
    );
    sources.push('signal engine');
  } else if (change) {
    sentences.push('No market signal on record reaches the current holdings.');
  }
  return { sentences, sources };
}

/** Chapter 3: what the signals imply, and what the chosen scenario does. */
export function couldHappenProse(
  risk: CombinedRiskResponse | null,
  scenario: Scenario | null,
  impact: ImpactResponse | null,
): Prose {
  const sentences: string[] = [];
  const sources: string[] = [];
  if (risk) {
    sentences.push(
      `Combined risk sits at ${risk.matrix.cell}: vulnerability ${risk.vulnerability.level}, signal risk ${risk.signalRisk.level}, composite ${risk.gauge.composite.toFixed(1)}/10.`,
    );
    if (risk.signalRisk.stressPct !== null) {
      sentences.push(
        `Base-case stress of recent signals ${pct(risk.signalRisk.stressPct)}${risk.signalRisk.severeStressPct !== null ? `, severe ${pct(risk.signalRisk.severeStressPct)}` : ''}.`,
      );
    }
    sources.push('combined risk');
  }
  if (scenario && impact) {
    const parts = [`${scenario.name}: ${pct(impact.total_pct)} (${money(impact.total_usd)})`];
    for (const c of impact.collateral) {
      parts.push(
        `LTV ${c.ltv_before_pct.toFixed(1)}% → ${c.ltv_after_pct.toFixed(1)}%${c.breached_after ? ', margin call' : ''}`,
      );
    }
    if (impact.liquidity.coverage_before !== null && impact.liquidity.coverage_after !== null) {
      parts.push(
        `liquidity coverage ${impact.liquidity.coverage_before.toFixed(1)}x → ${impact.liquidity.coverage_after.toFixed(1)}x`,
      );
    }
    sentences.push(`${parts.join('; ')}.`);
    sources.push('impact engine');
  }
  return { sentences, sources };
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const meanAbs = (o: Record<string, number>): number => mean(Object.values(o).map(Math.abs));

/** How hard a scenario hits one asset class, on a scale comparable to equity percentage moves. */
export function shockMagnitude(s: Scenario['shock'], assetClass: string): number {
  const equity = meanAbs(s.equity_pct) + 0.5 * meanAbs(s.sector_overlay_pct);
  switch (assetClass) {
    case 'Equity':
    case 'Structured Products':
      return equity;
    case 'Fixed Income':
      return meanAbs(s.rates_bps) / 10 + meanAbs(s.credit_spread_bps) / 10;
    case 'Commodities':
      return Math.abs(s.gold_pct) + Math.abs(s.brent_pct);
    case 'Alternatives':
      return 0.5 * equity;
    default:
      return meanAbs(s.fx_pct_vs_usd);
  }
}

/** Whether the scenario moves the given class against the holder. */
function adverse(s: Scenario['shock'], assetClass: string): boolean {
  switch (assetClass) {
    case 'Fixed Income':
      return mean(Object.values(s.rates_bps)) > 0 || mean(Object.values(s.credit_spread_bps)) > 0;
    case 'Commodities':
      return s.gold_pct + s.brent_pct < 0;
    default:
      return mean(Object.values(s.equity_pct)) < 0;
  }
}

/**
 * One named scenario for chapter 3, chosen for the client: the one that moves the household's
 * allocation most, with adverse scenarios preferred. Deterministic and explained.
 */
export function pickScenario(
  allocation: { assetClass: string; weightPct: number }[],
  scenarios: Scenario[],
): { scenario: Scenario; reason: string } | null {
  if (scenarios.length === 0 || allocation.length === 0) {
    return null;
  }
  const dominant = [...allocation].sort((a, b) => b.weightPct - a.weightPct)[0];
  if (!dominant) {
    return null;
  }
  let best: { scenario: Scenario; score: number } | null = null;
  for (const sc of scenarios) {
    let score = 0;
    for (const a of allocation) {
      score += (a.weightPct / 100) * shockMagnitude(sc.shock, a.assetClass);
    }
    if (adverse(sc.shock, dominant.assetClass)) {
      score *= 1.25;
    }
    if (best === null || score > best.score) {
      best = { scenario: sc, score };
    }
  }
  if (best === null) {
    return null;
  }
  return {
    scenario: best.scenario,
    reason: `Chosen because ${dominant.assetClass} is ${dominant.weightPct.toFixed(0)}% of the household and this scenario moves it most${adverse(best.scenario.shock, dominant.assetClass) ? ', against the holder' : ''}.`,
  };
}
