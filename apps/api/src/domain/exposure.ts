import type { ExposureBucket, ExposureName, ExposureResponse, SnapshotDate } from '@jb/contracts';
import type { ClientBundle, HoldingRecord } from '../repositories/clientDetailRepository.js';
import { round2, round4 } from './dates.js';
import { holdingsAt, householdTotalUsd, singlePositionLimit } from './holdingsView.js';

const ASSUMPTIONS = [
  'Structured products are decomposed into their reference underlyings using the look-through table; worst-of baskets are split equally across legs because the worst performer cannot be known in advance.',
  'Capital-protected notes count at their participation rate; the remainder is issuer credit and is left in the Structured Products bucket.',
  'Direct holdings that share an issuer (for example Golden Harbour shares and Golden Harbour perpetuals) are grouped under one exposure name.',
  'Exposure is aggregated across every portfolio the client holds, including custody accounts, because a limit that holds per portfolio can still fail for the household.',
  'The limit applied to a name is the single-position limit of the largest managed portfolio holding it; custody-only names have no limit.',
];

interface Contribution {
  key: string;
  usd: number;
  direct: boolean;
}

function bucket(contribs: Contribution[], total: number): ExposureBucket[] {
  const map = new Map<string, { d: number; l: number }>();
  for (const c of contribs) {
    const cur = map.get(c.key) ?? { d: 0, l: 0 };
    if (c.direct) {
      cur.d += c.usd;
    }
    cur.l += c.usd;
    map.set(c.key, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      directUsd: round2(v.d),
      lookthroughUsd: round2(v.l),
      directPct: total ? round4((v.d / total) * 100) : 0,
      lookthroughPct: total ? round4((v.l / total) * 100) : 0,
    }))
    .sort((a, b) => b.lookthroughUsd - a.lookthroughUsd);
}

/** Look-through exposure across the household. Direct rows keep their own classification; notes are split into legs. */
export function exposure(bundle: ClientBundle, snapshotDate: SnapshotDate): ExposureResponse {
  const rows = holdingsAt(bundle, snapshotDate);
  const total = householdTotalUsd(rows);
  const legsByInstrument = new Map<string, typeof bundle.lookthrough>();
  for (const leg of bundle.lookthrough) {
    const list = legsByInstrument.get(leg.instrumentId) ?? [];
    list.push(leg);
    legsByInstrument.set(leg.instrumentId, list);
  }

  const byAsset: Contribution[] = [];
  const bySector: Contribution[] = [];
  const byRegion: Contribution[] = [];
  const byCcy: Contribution[] = [];
  const names = new Map<string, ExposureName>();
  const legsOut: ExposureResponse['legs'] = [];

  const addName = (
    name: string,
    usd: number,
    via: 'direct' | 'note',
    h: HoldingRecord,
    limitPct: number | null,
  ): void => {
    const cur = names.get(name) ?? {
      exposureName: name,
      directUsd: 0,
      viaNotesUsd: 0,
      totalUsd: 0,
      totalPct: 0,
      limitPct: null,
      breached: false,
      sources: [],
    };
    if (via === 'direct') {
      cur.directUsd += usd;
    } else {
      cur.viaNotesUsd += usd;
    }
    cur.totalUsd += usd;
    if (limitPct !== null && (cur.limitPct === null || limitPct < cur.limitPct)) {
      cur.limitPct = limitPct;
    }
    cur.sources.push({
      portfolioId: h.portfolioId,
      instrumentId: h.instrumentId,
      name: h.instrumentName,
      usd: round2(usd),
      via,
    });
    names.set(name, cur);
  };

  const managedLimit = (portfolioId: string): number | null => {
    const p = bundle.portfolios.find((x) => x.portfolioId === portfolioId);
    return p && p.serviceModel !== 'Custody'
      ? singlePositionLimit(bundle.mandates, p.mandateCode)
      : null;
  };

  for (const h of rows) {
    const usd = h.marketValueUsd;
    byAsset.push({ key: h.assetClass, usd, direct: true });
    byCcy.push({ key: h.instrumentCcy, usd, direct: true });
    const legs = legsByInstrument.get(h.instrumentId);
    if (legs && legs.length > 0) {
      let allocated = 0;
      for (const leg of legs) {
        const legUsd = usd * leg.weight;
        allocated += legUsd;
        bySector.push({ key: leg.sector, usd: legUsd, direct: false });
        byRegion.push({ key: leg.region, usd: legUsd, direct: false });
        addName(leg.exposureName, legUsd, 'note', h, managedLimit(h.portfolioId));
        legsOut.push({
          instrumentId: h.instrumentId,
          instrumentName: h.instrumentName,
          noteUsd: round2(usd),
          leg: leg.leg,
          weight: leg.weight,
          exposureName: leg.exposureName,
          sector: leg.sector,
          region: leg.region,
          exposureUsd: round2(legUsd),
          note: leg.note,
        });
      }
      const residual = usd - allocated;
      if (residual > 0.5) {
        bySector.push({ key: 'Issuer credit (structured)', usd: residual, direct: false });
        byRegion.push({ key: h.region, usd: residual, direct: false });
      }
    } else {
      bySector.push({ key: h.sector ?? 'Unclassified', usd, direct: true });
      byRegion.push({ key: h.region, usd, direct: true });
      const inst = bundle.instruments.get(h.instrumentId);
      const issuer = bundle.issuers.get(h.instrumentId);
      if (issuer !== undefined || (inst?.concentrationLimitApplies ?? false)) {
        addName(issuer ?? h.instrumentName, usd, 'direct', h, managedLimit(h.portfolioId));
      }
    }
  }

  const nameList = [...names.values()]
    .map((n) => {
      const pct = total ? (n.totalUsd / total) * 100 : 0;
      return {
        ...n,
        directUsd: round2(n.directUsd),
        viaNotesUsd: round2(n.viaNotesUsd),
        totalUsd: round2(n.totalUsd),
        totalPct: round4(pct),
        breached: n.limitPct !== null && pct > n.limitPct,
      };
    })
    .sort((a, b) => b.totalUsd - a.totalUsd);

  return {
    snapshotDate,
    totalUsd: round2(total),
    byAssetClass: bucket(byAsset, total),
    bySector: bucket(bySector, total),
    byRegion: bucket(byRegion, total),
    byCurrency: bucket(byCcy, total),
    names: nameList,
    legs: legsOut,
    assumptions: ASSUMPTIONS,
  };
}
