/**
 * Signal engine. Turns the event log and market-context moves into typed signals with
 * severity, transmission channels, a factor shock, a confidence breakdown and, for a
 * chosen client, the holdings each signal touches. Fully deterministic.
 */
import {
  SNAPSHOT_DATES,
  Shock,
  type AffectedHolding,
  type Signal,
  type SignalSeverity,
  type SnapshotDate,
} from '@jb/contracts';
import type { eventLog, instruments, marketContext, signalRules, signalThresholds } from '@jb/db';
import { daysBetween, round2, round4 } from '../dates.js';
import type { ClientBundle } from '../../repositories/clientDetailRepository.js';

export type EventRecord = typeof eventLog.$inferSelect;
export type RuleRecord = typeof signalRules.$inferSelect;
export type ThresholdRecord = typeof signalThresholds.$inferSelect;
export type MarketRecord = typeof marketContext.$inferSelect;
type InstrumentRecord = typeof instruments.$inferSelect;

export interface SignalInputs {
  events: EventRecord[];
  rules: RuleRecord[];
  thresholds: ThresholdRecord[];
  market: MarketRecord[];
  instruments: Map<string, InstrumentRecord>;
  issuers: Map<string, string>;
  lookthrough: {
    instrumentId: string;
    exposureName: string;
    sector: string;
    region: string;
    weight: number;
  }[];
}

export type MatchRule = Record<string, string | boolean>;

const SEVERITY_ORDER: Record<SignalSeverity, number> = { SEVERE: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Latest snapshot on or before the clock date. */
export function snapshotForClock(clock: string): SnapshotDate {
  let chosen: SnapshotDate = SNAPSHOT_DATES[0];
  for (const d of SNAPSHOT_DATES) {
    if (d <= clock) {
      chosen = d;
    }
  }
  return chosen;
}

/** Does an instrument (plus optional look-through leg) satisfy one match rule? All keys in the rule must hold. */
export function instrumentMatches(
  rule: MatchRule,
  inst: InstrumentRecord,
  exposureNames: readonly string[],
  legSector?: string,
  legRegion?: string,
): boolean {
  for (const [key, want] of Object.entries(rule)) {
    switch (key) {
      case 'sector':
        if ((legSector ?? inst.sector) !== want) {
          return false;
        }
        break;
      case 'subAssetClass':
        if (inst.subAssetClass !== want) {
          return false;
        }
        break;
      case 'assetClass':
        if (inst.assetClass !== want) {
          return false;
        }
        break;
      case 'region':
        if ((legRegion ?? inst.region) !== want) {
          return false;
        }
        break;
      case 'currency':
        if (inst.currency !== want) {
          return false;
        }
        break;
      case 'liquidityTier':
        if (inst.liquidityTier !== want) {
          return false;
        }
        break;
      case 'exposureName':
        if (!exposureNames.includes(String(want)) && inst.instrumentName !== want) {
          return false;
        }
        break;
      case 'hasFacility':
        return false; // handled at client level, never matches an instrument on its own
      default:
        return false;
    }
  }
  return true;
}

function describeRule(rule: MatchRule): string {
  return Object.entries(rule)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' & ');
}

/** Which of a client's holdings a rule set touches, via direct attributes, look-through legs or a facility. */
export function affectedHoldings(
  bundle: ClientBundle,
  inputs: SignalInputs,
  rules: MatchRule[],
  snapshot: SnapshotDate,
): AffectedHolding[] {
  const rows = bundle.holdings.filter((h) => h.snapshotDate === snapshot);
  const total = rows.reduce((s, h) => s + h.marketValueUsd, 0);
  const out: AffectedHolding[] = [];
  const seen = new Set<string>();
  const facilityRule = rules.some((r) => r.hasFacility === true);
  const collateralPortfolios = new Set(bundle.facilities.map((f) => f.collateralPortfolioId));

  for (const h of rows) {
    const inst = inputs.instruments.get(h.instrumentId);
    if (!inst) {
      continue;
    }
    const issuer = inputs.issuers.get(h.instrumentId);
    const names = issuer ? [issuer, inst.instrumentName] : [inst.instrumentName];
    const key = `${h.portfolioId}|${h.instrumentId}`;
    let hit: { via: AffectedHolding['via']; by: string } | null = null;

    for (const r of rules) {
      if (instrumentMatches(r, inst, names)) {
        hit = { via: 'direct', by: describeRule(r) };
        break;
      }
    }
    if (!hit) {
      for (const leg of inputs.lookthrough.filter((l) => l.instrumentId === h.instrumentId)) {
        for (const r of rules) {
          if (instrumentMatches(r, inst, [leg.exposureName], leg.sector, leg.region)) {
            hit = { via: 'lookthrough', by: `${describeRule(r)} via leg ${leg.exposureName}` };
            break;
          }
        }
        if (hit) {
          break;
        }
      }
    }
    if (!hit && facilityRule && collateralPortfolios.has(h.portfolioId) && h.advanceRatePct > 0) {
      hit = { via: 'facility', by: 'collateral for a Lombard facility' };
    }
    if (hit && !seen.has(key)) {
      seen.add(key);
      out.push({
        portfolioId: h.portfolioId,
        instrumentId: h.instrumentId,
        name: h.instrumentName,
        assetClass: h.assetClass,
        marketValueUsd: round2(h.marketValueUsd),
        householdPct: total ? round4((h.marketValueUsd / total) * 100) : 0,
        via: hit.via,
        matchedBy: hit.by,
      });
    }
  }
  return out.sort((a, b) => b.marketValueUsd - a.marketValueUsd);
}

function eventSeverity(s: string): SignalSeverity {
  switch (s) {
    case 'Severe':
      return 'SEVERE';
    case 'High':
      return 'HIGH';
    case 'Medium':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

function freshness(ageDays: number): number {
  if (ageDays <= 7) {
    return 100;
  }
  if (ageDays <= 30) {
    return 95;
  }
  if (ageDays <= 90) {
    return 85;
  }
  return Math.max(60, 85 - (ageDays - 90) / 10);
}

function affectedClasses(rules: MatchRule[], inputs: SignalInputs): string[] {
  const classes = new Set<string>();
  for (const inst of inputs.instruments.values()) {
    const names = [
      inputs.issuers.get(inst.instrumentId) ?? inst.instrumentName,
      inst.instrumentName,
    ];
    if (rules.some((r) => instrumentMatches(r, inst, names))) {
      classes.add(inst.assetClass);
    }
  }
  return [...classes].sort();
}

function whyItMatters(affected: AffectedHolding[], exposedPct: number, title: string): string {
  if (affected.length === 0) {
    return `No holdings in this household are reached by "${title}" through the mapped channels.`;
  }
  const top = affected
    .slice(0, 2)
    .map((a) => `${a.name} (${a.householdPct.toFixed(1)}%)`)
    .join(' and ');
  const via = affected.some((a) => a.via === 'lookthrough')
    ? ', part of it through structured notes'
    : '';
  return `${exposedPct.toFixed(1)}% of the household is exposed${via}, led by ${top}.`;
}

/** Build all signals visible at the clock date. Client detail is attached when a bundle is given. */
export function buildSignals(
  inputs: SignalInputs,
  clock: string,
  bundle: ClientBundle | null,
): Signal[] {
  const snapshot = snapshotForClock(clock);
  const rulesByEvent = new Map(inputs.rules.map((r) => [r.eventId, r]));
  const out: Signal[] = [];

  for (const ev of inputs.events) {
    if (ev.eventDate > clock) {
      continue;
    }
    const rule = rulesByEvent.get(ev.eventId);
    if (!rule) {
      continue;
    }
    const match = rule.match as MatchRule[];
    const shock = Shock.parse(rule.shock);
    const ageDays = daysBetween(ev.eventDate, clock);
    const channels = ev.primaryTransmission.split(',').map((c) => c.trim());
    const conf = {
      dataFreshness: freshness(ageDays),
      sourceReliability: 100,
      modelConfidence: 80,
      notes: [
        'Source reliability 100: the event is taken verbatim from the controlled event log.',
        'Model confidence 80: channel-to-holding mapping is a stated rule set, not a fitted model.',
      ],
    };
    const client = bundle ? clientView(bundle, inputs, match, snapshot, ev.description) : null;
    out.push({
      id: ev.eventId,
      kind: 'event',
      eventType: ev.eventType,
      date: ev.eventDate,
      ageDays,
      severity: eventSeverity(ev.severity),
      title: ev.description.length > 90 ? `${ev.description.slice(0, 87)}…` : ev.description,
      description: ev.description,
      region: ev.region,
      channels,
      source: {
        name: 'event_log.csv',
        reference: ev.eventId,
        detail: `${ev.eventType} · ${ev.region} · severity ${ev.severity}`,
      },
      affectedAssetClasses: affectedClasses(match, inputs),
      shock,
      confidence: {
        ...conf,
        overall: Math.round(
          0.35 * conf.dataFreshness + 0.4 * conf.sourceReliability + 0.25 * conf.modelConfidence,
        ),
      },
      client,
    });
  }

  out.push(...derivedSignals(inputs, clock, snapshot, bundle));
  return out.sort((a, b) =>
    a.date === b.date
      ? SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      : b.date.localeCompare(a.date),
  );
}

function clientView(
  bundle: ClientBundle,
  inputs: SignalInputs,
  match: MatchRule[],
  snapshot: SnapshotDate,
  title: string,
): NonNullable<Signal['client']> {
  const affected = affectedHoldings(bundle, inputs, match, snapshot);
  const exposedUsd = affected.reduce((s, a) => s + a.marketValueUsd, 0);
  const total = bundle.holdings
    .filter((h) => h.snapshotDate === snapshot)
    .reduce((s, h) => s + h.marketValueUsd, 0);
  const exposedPct = total ? (exposedUsd / total) * 100 : 0;
  return {
    exposedUsd: round2(exposedUsd),
    exposedPct: round4(exposedPct),
    affected,
    whyItMatters: whyItMatters(affected, exposedPct, title),
  };
}

/** Series moves between consecutive snapshots above threshold become derived signals. */
const SERIES_RULES: Record<
  string,
  { rules: MatchRule[]; shock: (move: number, from: number) => Partial<Shock>; unit: 'pct' | 'abs' }
> = {
  UST_10Y_PCT: {
    unit: 'abs',
    rules: [
      { subAssetClass: 'Government Bond' },
      { subAssetClass: 'Investment Grade Credit' },
      { subAssetClass: 'Inflation Linked' },
      { subAssetClass: 'Subordinated Perpetual' },
    ],
    shock: (m) => ({ rates_bps: { USD: Math.round(m * 100) } }),
  },
  BRENT_USD_BBL: {
    unit: 'pct',
    rules: [{ sector: 'Energy' }, { subAssetClass: 'Diversified Commodities' }],
    shock: (m) => ({ brent_pct: round2(m), sector_overlay_pct: { Energy: round2(m * 0.5) } }),
  },
  GOLD_USD_OZ: {
    unit: 'pct',
    rules: [{ sector: 'Gold' }],
    shock: (m) => ({ gold_pct: round2(m) }),
  },
  VIX: {
    unit: 'abs',
    rules: [{ assetClass: 'Equity' }, { assetClass: 'Structured Products' }],
    shock: (m) => ({ vix_points: round2(m) }),
  },
  SPX: {
    unit: 'pct',
    rules: [{ region: 'North America' }, { region: 'Global', assetClass: 'Equity' }],
    shock: (m) => ({ equity_pct: { north_america: round2(m), global: round2(m * 0.7) } }),
  },
  NASDAQ_COMP: {
    unit: 'pct',
    rules: [{ sector: 'Information Technology' }],
    shock: (m) => ({ sector_overlay_pct: { 'Information Technology': round2(m) } }),
  },
  HSI: {
    unit: 'pct',
    rules: [{ region: 'Hong Kong' }, { region: 'Greater China' }],
    shock: (m) => ({ equity_pct: { greater_china: round2(m) } }),
  },
  STI: {
    unit: 'pct',
    rules: [{ region: 'Singapore' }],
    shock: (m) => ({ equity_pct: { asia_ex_japan: round2(m) } }),
  },
  MSCI_ASIA_XJP: {
    unit: 'pct',
    rules: [{ region: 'Asia ex-Japan' }, { region: 'Southeast Asia' }, { region: 'Asia' }],
    shock: (m) => ({ equity_pct: { asia_ex_japan: round2(m) } }),
  },
  USDSGD: {
    unit: 'pct',
    rules: [{ currency: 'SGD' }],
    shock: (m) => ({ fx_pct_vs_usd: { SGD: round2(-m) } }),
  },
  EURUSD: {
    unit: 'pct',
    rules: [{ currency: 'EUR' }],
    shock: (m) => ({ fx_pct_vs_usd: { EUR: round2(m) } }),
  },
  USDJPY: {
    unit: 'pct',
    rules: [{ currency: 'JPY' }],
    shock: (m) => ({ fx_pct_vs_usd: { JPY: round2(-m) } }),
  },
  USDIDR: {
    unit: 'pct',
    rules: [{ currency: 'IDR' }],
    shock: (m) => ({ fx_pct_vs_usd: { IDR: round2(-m) } }),
  },
  USDTHB: {
    unit: 'pct',
    rules: [{ currency: 'THB' }],
    shock: (m) => ({ fx_pct_vs_usd: { THB: round2(-m) } }),
  },
  USDINR: {
    unit: 'pct',
    rules: [{ currency: 'INR' }],
    shock: (m) => ({ fx_pct_vs_usd: { INR: round2(-m) } }),
  },
  TTF_GAS_EUR_MWH: {
    unit: 'pct',
    rules: [{ sector: 'Energy' }],
    shock: (m) => ({ sector_overlay_pct: { Energy: round2(m * 0.2) } }),
  },
  US_CPI_YOY_PCT: {
    unit: 'abs',
    rules: [{ subAssetClass: 'Inflation Linked' }, { subAssetClass: 'Government Bond' }],
    shock: (m) => ({ rates_bps: { USD: Math.round(m * 40) } }),
  },
};

function derivedSignals(
  inputs: SignalInputs,
  clock: string,
  snapshot: SnapshotDate,
  bundle: ClientBundle | null,
): Signal[] {
  const thresholds = new Map(inputs.thresholds.map((t) => [t.seriesId, t.threshold]));
  const bySeries = new Map<string, MarketRecord[]>();
  for (const m of inputs.market) {
    const list = bySeries.get(m.seriesId) ?? [];
    list.push(m);
    bySeries.set(m.seriesId, list);
  }
  const out: Signal[] = [];
  for (const [seriesId, rows] of bySeries) {
    const spec = SERIES_RULES[seriesId];
    const threshold = thresholds.get(seriesId);
    if (!spec || threshold === undefined) {
      continue;
    }
    const sorted = [...rows].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev || !cur || cur.snapshotDate > clock) {
        continue;
      }
      const move =
        spec.unit === 'pct'
          ? ((cur.value - prev.value) / prev.value) * 100
          : cur.value - prev.value;
      if (Math.abs(move) < threshold) {
        continue;
      }
      const magnitude = Math.abs(move) / threshold;
      const severity: SignalSeverity =
        magnitude >= 3 ? 'HIGH' : magnitude >= 1.8 ? 'MEDIUM' : 'LOW';
      const ageDays = daysBetween(cur.snapshotDate, clock);
      const label =
        spec.unit === 'pct'
          ? `${move > 0 ? '+' : ''}${move.toFixed(1)}%`
          : `${move > 0 ? '+' : ''}${move.toFixed(2)} ${cur.unit}`;
      const description = `${cur.seriesName} moved from ${prev.value} to ${cur.value} (${label}) between ${prev.snapshotDate} and ${cur.snapshotDate}.`;
      const conf = {
        dataFreshness: freshness(ageDays),
        sourceReliability: 85,
        modelConfidence: 70,
      };
      const shock = Shock.parse(spec.shock(move, prev.value));
      out.push({
        id: `MK-${seriesId}-${cur.snapshotDate}`,
        kind: 'derived',
        eventType: 'Market move',
        date: cur.snapshotDate,
        ageDays,
        severity,
        title: `${cur.seriesName} ${label}`,
        description,
        region: cur.category,
        channels: [cur.category],
        source: {
          name: 'market_context.csv',
          reference: `${seriesId} @ ${cur.snapshotDate}`,
          detail: `${cur.category} · ${cur.unit} · derived from two snapshot points`,
        },
        affectedAssetClasses: affectedClasses(spec.rules, inputs),
        shock,
        confidence: {
          ...conf,
          overall: Math.round(
            0.35 * conf.dataFreshness + 0.4 * conf.sourceReliability + 0.25 * conf.modelConfidence,
          ),
          notes: [
            'Source reliability 85: inferred from two snapshot values, not an observed intraday print.',
            'Model confidence 70: the factor shock is the observed move; the holding mapping is by attribute.',
          ],
        },
        client: bundle ? clientView(bundle, inputs, spec.rules, snapshot, cur.seriesName) : null,
      });
    }
  }
  return out;
}
