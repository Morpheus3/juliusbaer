/**
 * Trade ideas: rule-generated from mandate status, look-through exposure, liquidity, the rubric and
 * recent signals. Every idea passes a suitability gate; failed ideas are kept and shown with the
 * rule that blocked them, because the RM should see what the system considered.
 */
import type {
  CashflowsResponse,
  ExposureResponse,
  MandateStatusResponse,
  Signal,
  Suitability,
  TradeIdea,
} from '@jb/contracts';
import { sha256 } from '../../llm/prompts/registry.js';
import type {
  ClientBundle,
  HoldingRecord,
  InstrumentRecord,
} from '../../repositories/clientDetailRepository.js';
import { round2 } from '../dates.js';
import type { RubricScores } from './combined.js';

const RISK_CLASSES = new Set(['Equity', 'Structured Products', 'Commodities', 'Alternatives']);
const ILLIQUID = new Set(['Illiquid', 'Quarterly Gate']);
const fmtUsd = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

export interface IdeaContext {
  bundle: ClientBundle;
  snapshot: string;
  mandate: MandateStatusResponse;
  exposure: ExposureResponse;
  cashflows: CashflowsResponse;
  rubric: RubricScores | null;
  signals: Signal[];
}

interface Check {
  rule: string;
  passed: boolean;
  detail: string;
  blocking?: boolean;
}

function gate(checks: Check[]): Suitability {
  const blocked = checks.some((c) => !c.passed && (c.blocking ?? false));
  const review = checks.some((c) => !c.passed);
  return {
    status: blocked ? 'blocked' : review ? 'review' : 'ok',
    checks: checks.map(({ rule, passed, detail }) => ({ rule, passed, detail })),
  };
}

/** Rubric-driven checks that apply to every idea. */
function rubricChecks(
  rubric: RubricScores | null,
  buysRisk: boolean,
  buysIlliquid: boolean,
): Check[] {
  const out: Check[] = [
    {
      rule: 'Human approval',
      passed: true,
      detail: 'RM approves and logs; nothing executes automatically.',
    },
  ];
  if (!rubric) {
    out.push({
      rule: 'Rubric available',
      passed: false,
      detail:
        'No rubric assessment yet; suitability against the client profile cannot be confirmed.',
    });
    return out;
  }
  out.push({
    rule: 'Appetite consistency',
    passed: !(buysRisk && rubric.appetite === 1),
    detail:
      buysRisk && rubric.appetite === 1
        ? 'Adds risk assets while behavioural Appetite scores 1.'
        : 'Consistent with the Appetite score.',
    blocking: true,
  });
  out.push({
    rule: 'Horizon consistency',
    passed: !(buysIlliquid && rubric.horizon === 1),
    detail:
      buysIlliquid && rubric.horizon === 1
        ? 'Adds illiquid exposure while the effective horizon is short.'
        : 'Consistent with the Horizon score.',
    blocking: true,
  });
  return out;
}

function pickDiversified(
  bundle: ClientBundle,
  assetClass: string,
  exclusionBound: boolean,
  preferHeld: HoldingRecord[],
): InstrumentRecord | null {
  const ok = (i: InstrumentRecord): boolean =>
    i.assetClass === assetClass &&
    !i.concentrationLimitApplies &&
    !(exclusionBound && i.sustainabilityExcluded) &&
    !ILLIQUID.has(i.liquidityTier);
  const heldIds = new Set(preferHeld.map((h) => h.instrumentId));
  const all = [...bundle.instruments.values()].filter(ok);
  return all.find((i) => heldIds.has(i.instrumentId)) ?? all[0] ?? null;
}

export function generateTradeIdeas(ctx: IdeaContext): TradeIdea[] {
  const { bundle, snapshot, mandate, exposure, cashflows, rubric } = ctx;
  const ideas: Omit<TradeIdea, 'id' | 'decision'>[] = [];
  const holdings = bundle.holdings.filter((h) => h.snapshotDate === snapshot);
  const household = holdings.reduce((s, h) => s + h.marketValueUsd, 0);
  const recentRates = ctx.signals
    .filter((s) => Object.values(s.shock.rates_bps).some((v) => v > 0))
    .map((s) => s.id);
  const stale = new Set(
    holdings.filter((h) => h.valuationDate !== h.snapshotDate).map((h) => h.portfolioId),
  );

  const confidence = (base: number, portfolioId: string, heuristic: boolean): [number, string] => {
    let c = base;
    const notes: string[] = ['Rule-derived from mandate, holdings and cash-need data.'];
    if (heuristic) {
      c -= 0.15;
      notes.push('Relies on look-through or keyword heuristics.');
    }
    if (stale.has(portfolioId)) {
      c -= 0.1;
      notes.push('A position in this portfolio carries a stale mark.');
    }
    if (!rubric) {
      c -= 0.1;
      notes.push('No rubric assessment yet.');
    }
    return [Math.round(Math.max(0.3, c) * 100) / 100, notes.join(' ')];
  };

  for (const p of mandate.portfolios.filter((x) => x.managed)) {
    const pfHoldings = holdings.filter((h) => h.portfolioId === p.portfolioId);
    const pfValue = pfHoldings.reduce((s, h) => s + h.marketValueUsd, 0);
    const exclusionBound =
      p.exclusionBreaches.length > 0 ||
      bundle.mandates.some(
        (m) => m.mandateCode === p.mandateCode && /exclusion/i.test(m.mandateNotes),
      );
    const over = p.rows
      .filter((r) => r.status === 'above')
      .sort((a, b) => b.deviationPts - a.deviationPts);
    const under = p.rows
      .filter((r) => r.status === 'below')
      .sort((a, b) => a.deviationPts - b.deviationPts);

    // 1. Overweight class → trim to the band ceiling, fund the most underweight class.
    for (const o of over) {
      const amount = (o.deviationPts / 100) * pfValue;
      const sellFrom = pfHoldings
        .filter((h) => h.assetClass === o.assetClass && !ILLIQUID.has(h.liquidityTier))
        .sort((a, b) => b.marketValueUsd - a.marketValueUsd)[0];
      if (!sellFrom || amount < 1000) {
        continue;
      }
      const target = under[0];
      const buyInst = target
        ? pickDiversified(bundle, target.assetClass, exclusionBound, pfHoldings)
        : null;
      const buysRisk = target ? RISK_CLASSES.has(target.assetClass) : false;
      const [conf, note] = confidence(0.85, p.portfolioId, false);
      ideas.push({
        direction: buyInst ? 'switch' : 'sell',
        title: `${p.name}: reduce ${o.assetClass} by ${o.deviationPts.toFixed(1)} points to the band ceiling${target ? `, add to ${target.assetClass}` : ''}`,
        rationale: `${o.assetClass} is ${o.weightPct.toFixed(1)}% against a ${o.minPct}–${o.maxPct}% band${target ? `; ${target.assetClass} is ${target.weightPct.toFixed(1)}% against ${target.minPct}–${target.maxPct}%` : ''}. Selling ${fmtUsd(amount)} of the largest liquid ${o.assetClass} line brings the class to its ceiling.`,
        sell: {
          instrumentId: sellFrom.instrumentId,
          name: sellFrom.instrumentName,
          portfolioId: p.portfolioId,
          amountUsd: round2(Math.min(amount, sellFrom.marketValueUsd)),
        },
        buy: buyInst
          ? {
              instrumentId: buyInst.instrumentId,
              name: buyInst.instrumentName,
              portfolioId: p.portfolioId,
              amountUsd: round2(Math.min(amount, sellFrom.marketValueUsd)),
            }
          : null,
        motivatedBy: {
          signalIds: [],
          facts: [
            `${o.assetClass} ${o.weightPct.toFixed(1)}% vs max ${o.maxPct}%`,
            ...(target
              ? [`${target.assetClass} ${target.weightPct.toFixed(1)}% vs min ${target.minPct}%`]
              : []),
          ],
        },
        suitability: gate([
          ...rubricChecks(rubric, buysRisk, false),
          {
            rule: 'Mandate direction',
            passed: true,
            detail: 'Moves both classes toward their bands.',
          },
          {
            rule: 'Client-directed position',
            passed: !bundle.notes.some((n) => n.note.toLowerCase().includes('waiver')),
            detail: bundle.notes.some((n) => n.note.toLowerCase().includes('waiver'))
              ? 'A note mentions a suitability waiver; confirm before trimming.'
              : 'No waiver recorded in the notes.',
          },
        ]),
        confidence: conf,
        confidenceNote: note,
      });
    }

    // 2. Single-line over limit → trim to the limit into a diversified fund of the same class.
    for (const s of p.singleLineBreaches) {
      const h = pfHoldings.find((x) => x.instrumentId === s.instrumentId);
      const limit = p.maxSinglePositionPct ?? 0;
      if (!h || limit <= 0) {
        continue;
      }
      const amount = ((s.weightPct - limit) / 100) * pfValue;
      const buyInst = pickDiversified(bundle, h.assetClass, exclusionBound, pfHoldings);
      const [conf, note] = confidence(0.85, p.portfolioId, false);
      ideas.push({
        direction: 'switch',
        title: `${p.name}: trim ${s.name} to the ${limit}% single-position limit`,
        rationale: `${s.name} is ${s.weightPct.toFixed(1)}% of the portfolio against a ${limit}% limit. Selling ${fmtUsd(amount)} restores the limit; proceeds to a diversified ${h.assetClass.toLowerCase()} fund keep the asset class weight unchanged.`,
        sell: {
          instrumentId: h.instrumentId,
          name: h.instrumentName,
          portfolioId: p.portfolioId,
          amountUsd: round2(amount),
        },
        buy: buyInst
          ? {
              instrumentId: buyInst.instrumentId,
              name: buyInst.instrumentName,
              portfolioId: p.portfolioId,
              amountUsd: round2(amount),
            }
          : null,
        motivatedBy: {
          signalIds: [],
          facts: [`${s.name} ${s.weightPct.toFixed(1)}% vs limit ${limit}%`],
        },
        suitability: gate([
          ...rubricChecks(rubric, false, false),
          { rule: 'Single-position limit', passed: true, detail: 'Brings the line to the limit.' },
          {
            rule: 'Liquidity of the sale',
            passed: !ILLIQUID.has(h.liquidityTier),
            detail: ILLIQUID.has(h.liquidityTier)
              ? `${h.liquidityTier}: cannot be sold at will.`
              : `${h.liquidityTier} liquidity.`,
            blocking: ILLIQUID.has(h.liquidityTier),
          },
          {
            rule: 'Source-of-wealth overlap',
            passed: !new RegExp(h.sector ?? '§', 'i').test(bundle.client.sourceOfWealth),
            detail: "Flagged where the holding sits in the same sector as the client's business.",
          },
        ]),
        confidence: conf,
        confidenceNote: note,
      });
    }

    // 3. Excluded holdings in an exclusion-bound mandate → switch to a non-excluded equivalent.
    for (const e of p.exclusionBreaches) {
      const h = pfHoldings.find((x) => x.instrumentId === e.instrumentId);
      if (!h) {
        continue;
      }
      const inst = bundle.instruments.get(h.instrumentId);
      const replacement =
        [...bundle.instruments.values()].find(
          (i) =>
            i.assetClass === h.assetClass &&
            i.subAssetClass === inst?.subAssetClass &&
            !i.sustainabilityExcluded &&
            !i.concentrationLimitApplies,
        ) ?? pickDiversified(bundle, h.assetClass, true, pfHoldings);
      const [conf, note] = confidence(0.9, p.portfolioId, false);
      ideas.push({
        direction: 'switch',
        title: `${p.name}: replace excluded ${e.name}`,
        rationale: `${e.name} (${e.weightPct.toFixed(1)}%) falls within the mandate's binding exclusions. Switching into ${replacement?.instrumentName ?? 'a compliant equivalent'} keeps the asset class weight.`,
        sell: {
          instrumentId: h.instrumentId,
          name: h.instrumentName,
          portfolioId: p.portfolioId,
          amountUsd: round2(h.marketValueUsd),
        },
        buy: replacement
          ? {
              instrumentId: replacement.instrumentId,
              name: replacement.instrumentName,
              portfolioId: p.portfolioId,
              amountUsd: round2(h.marketValueUsd),
            }
          : null,
        motivatedBy: {
          signalIds: [],
          facts: [
            `Mandate notes declare binding exclusions`,
            `${e.name} flagged sustainability_excluded`,
          ],
        },
        suitability: gate([
          ...rubricChecks(rubric, false, false),
          { rule: 'Mandate exclusions', passed: true, detail: 'Removes an excluded instrument.' },
          {
            rule: 'Family or legacy position',
            passed: !bundle.notes.some((n) => /family holding|legacy/i.test(n.note)),
            detail: 'Notes may describe the position as a family holding; discuss before selling.',
          },
        ]),
        confidence: conf,
        confidenceNote: note,
      });
    }
  }

  // 4. Look-through concentration: only the direct part is saleable.
  for (const n of exposure.names.filter((x) => x.breached && x.viaNotesUsd > 0)) {
    const direct = n.sources.filter((s) => s.via === 'direct').sort((a, b) => b.usd - a.usd)[0];
    if (!direct) {
      continue;
    }
    const limitUsd = ((n.limitPct ?? 0) / 100) * household;
    const excess = n.totalUsd - limitUsd;
    const sellable = Math.min(excess, direct.usd);
    const [conf, note] = confidence(0.8, direct.portfolioId, true);
    ideas.push({
      direction: 'sell',
      title: `Reduce ${n.exposureName} exposure held through notes and shares`,
      rationale: `${n.exposureName} is ${n.totalPct.toFixed(1)}% of the household once notes are looked through (${fmtUsd(n.viaNotesUsd)} via notes), against a ${n.limitPct ?? 0}% limit. Only the direct line is saleable before maturity; selling ${fmtUsd(sellable)} of it ${sellable < excess ? 'reduces but does not clear the excess' : 'clears the excess'}.`,
      sell: {
        instrumentId: direct.instrumentId,
        name: direct.name,
        portfolioId: direct.portfolioId,
        amountUsd: round2(sellable),
      },
      buy: null,
      motivatedBy: {
        signalIds: [],
        facts: [
          `${n.exposureName} ${n.totalPct.toFixed(1)}% look-through vs limit ${n.limitPct ?? 0}%`,
        ],
      },
      suitability: gate([
        ...rubricChecks(rubric, false, false),
        {
          rule: 'Notes illiquid before maturity',
          passed: sellable >= excess,
          detail:
            sellable >= excess
              ? 'Direct line is large enough to clear the excess.'
              : 'Residual excess remains until the note matures.',
        },
      ]),
      confidence: conf,
      confidenceNote: note,
    });
  }

  // 5. Liquidity coverage below 1.5x → raise cash from the most overweight daily-liquid class.
  const cov = cashflows.coverage12m;
  if (cov.ratio !== null && cov.ratio < 1.5 && cov.needsUsd > 0) {
    const shortfall = cov.needsUsd * 1.5 - cov.dailyLiquidUsd;
    const candidates = holdings
      .filter(
        (h) =>
          h.liquidityTier === 'Daily' &&
          h.assetClass !== 'Cash and Equivalents' &&
          RISK_CLASSES.has(h.assetClass),
      )
      .sort((a, b) => b.marketValueUsd - a.marketValueUsd);
    const sellFrom = candidates[0];
    const cash =
      [...bundle.instruments.values()].find(
        (i) => i.assetClass === 'Cash and Equivalents' && i.currency === bundle.client.baseCurrency,
      ) ?? [...bundle.instruments.values()].find((i) => i.assetClass === 'Cash and Equivalents');
    if (sellFrom && shortfall > 0) {
      const [conf, note] = confidence(0.8, sellFrom.portfolioId, false);
      ideas.push({
        direction: 'switch',
        title: `Raise ${fmtUsd(shortfall)} of cash ahead of the next 12 months' needs`,
        rationale: `Daily-liquid assets cover ${cov.ratio.toFixed(1)}x of ${fmtUsd(cov.needsUsd)} in confirmed and likely needs; 1.5x is the buffer. Selling the largest daily-liquid risk position and holding ${bundle.client.baseCurrency} cash removes the forced-sale risk.`,
        sell: {
          instrumentId: sellFrom.instrumentId,
          name: sellFrom.instrumentName,
          portfolioId: sellFrom.portfolioId,
          amountUsd: round2(Math.min(shortfall, sellFrom.marketValueUsd)),
        },
        buy: cash
          ? {
              instrumentId: cash.instrumentId,
              name: cash.instrumentName,
              portfolioId: sellFrom.portfolioId,
              amountUsd: round2(Math.min(shortfall, sellFrom.marketValueUsd)),
            }
          : null,
        motivatedBy: {
          signalIds: [],
          facts: [`Coverage ${cov.ratio.toFixed(2)}x`, `Needs 12m ${fmtUsd(cov.needsUsd)}`],
        },
        suitability: gate([
          ...rubricChecks(rubric, false, false),
          {
            rule: 'Reduces yield',
            passed: true,
            detail: 'Cash earns less than the position sold; accepted for a dated liability.',
          },
        ]),
        confidence: conf,
        confidenceNote: note,
      });
    }
  }

  // 6. Rates rose and the horizon is short → shorten duration.
  const horizonScore = rubric?.horizon ?? null;
  if (recentRates.length > 0 && horizonScore !== null && horizonScore <= 2) {
    const longBonds = holdings.filter(
      (h) =>
        h.assetClass === 'Fixed Income' &&
        /due (\d{4})/.test(h.instrumentName) &&
        Number(/due (\d{4})/.exec(h.instrumentName)?.[1] ?? 0) - Number(snapshot.slice(0, 4)) > 10,
    );
    const shortInst = [...bundle.instruments.values()].find(
      (i) => i.assetClass === 'Fixed Income' && /short duration/i.test(i.subAssetClass),
    );
    for (const b of longBonds) {
      const [conf, note] = confidence(0.75, b.portfolioId, false);
      ideas.push({
        direction: 'switch',
        title: `Shorten duration: switch ${b.instrumentName} into ${shortInst?.instrumentName ?? 'short-duration bonds'}`,
        rationale: `Rates rose in ${recentRates.length} recent signal${recentRates.length === 1 ? '' : 's'} and the effective horizon scores ${horizonScore}; a bond maturing in ${/due (\d{4})/.exec(b.instrumentName)?.[1] ?? ''} cannot be held to maturity by this client. Switching ${fmtUsd(b.marketValueUsd)} cuts the loss from further yield rises${b.unrealisedPnlBase !== null && b.unrealisedPnlBase < 0 ? ' but crystallises the current unrealised loss' : ''}.`,
        sell: {
          instrumentId: b.instrumentId,
          name: b.instrumentName,
          portfolioId: b.portfolioId,
          amountUsd: round2(b.marketValueUsd),
        },
        buy: shortInst
          ? {
              instrumentId: shortInst.instrumentId,
              name: shortInst.instrumentName,
              portfolioId: b.portfolioId,
              amountUsd: round2(b.marketValueUsd),
            }
          : null,
        motivatedBy: {
          signalIds: recentRates.slice(0, 3),
          facts: [
            `Horizon score ${horizonScore}`,
            `Maturity ${/due (\d{4})/.exec(b.instrumentName)?.[1] ?? ''}`,
          ],
        },
        suitability: gate([
          ...rubricChecks(rubric, false, false),
          {
            rule: 'Client stated preference',
            passed: !bundle.notes.some((n) =>
              /not want to sell|would rather wait|not sell anything at a loss/i.test(n.note),
            ),
            detail:
              'The notes record a reluctance to sell at a loss; this needs a conversation, not an instruction.',
          },
        ]),
        confidence: conf,
        confidenceNote: note,
      });
    }
  }

  // 7. Cash far above the band → deploy toward target.
  for (const p of mandate.portfolios.filter((x) => x.managed)) {
    const cashRow = p.rows.find((r) => r.assetClass === 'Cash and Equivalents');
    if (cashRow?.status !== 'above') {
      continue;
    }
    const pfValue = holdings
      .filter((h) => h.portfolioId === p.portfolioId)
      .reduce((s, h) => s + h.marketValueUsd, 0);
    const amount = ((cashRow.weightPct - cashRow.targetPct) / 100) * pfValue;
    const targets = p.rows
      .filter((r) => r.status === 'below')
      .sort((a, b) => a.deviationPts - b.deviationPts)
      .slice(0, 2);
    const cashHolding = holdings
      .filter((h) => h.portfolioId === p.portfolioId && h.assetClass === 'Cash and Equivalents')
      .sort((a, b) => b.marketValueUsd - a.marketValueUsd)[0];
    const buyInst = targets[0]
      ? pickDiversified(bundle, targets[0].assetClass, false, holdings)
      : null;
    if (!cashHolding || !buyInst) {
      continue;
    }
    const [conf, note] = confidence(0.8, p.portfolioId, false);
    ideas.push({
      direction: 'buy',
      title: `${p.name}: deploy ${fmtUsd(amount)} of excess cash toward the agreed allocation`,
      rationale: `Cash is ${cashRow.weightPct.toFixed(1)}% against a ${cashRow.targetPct}% target${targets.length ? `; ${targets.map((t) => `${t.assetClass} ${t.weightPct.toFixed(1)}% vs min ${t.minPct}%`).join(' and ')}` : ''}. A staged deployment over several dates reduces timing regret.`,
      sell: {
        instrumentId: cashHolding.instrumentId,
        name: cashHolding.instrumentName,
        portfolioId: p.portfolioId,
        amountUsd: round2(amount),
      },
      buy: {
        instrumentId: buyInst.instrumentId,
        name: buyInst.instrumentName,
        portfolioId: p.portfolioId,
        amountUsd: round2(amount),
      },
      motivatedBy: {
        signalIds: [],
        facts: [`Cash ${cashRow.weightPct.toFixed(1)}% vs target ${cashRow.targetPct}%`],
      },
      suitability: gate([
        ...rubricChecks(rubric, RISK_CLASSES.has(buyInst.assetClass), false),
        {
          rule: 'Agreed allocation',
          passed: true,
          detail: 'Moves toward the mandate the client signed.',
        },
        {
          rule: 'Client hesitation on record',
          passed: !bundle.notes.some((n) =>
            /waiting for a better entry|has not executed/i.test(n.note),
          ),
          detail:
            'Notes record repeated deferral; propose a staged schedule rather than a single trade.',
        },
      ]),
      confidence: conf,
      confidenceNote: note,
    });
  }

  const seen = new Map<string, number>();
  return ideas.map((i) => {
    const key = `${i.direction}|${i.title}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return { ...i, id: `idea-${sha256(`${bundle.client.clientId}|${key}|${n}`)}`, decision: null };
  });
}
