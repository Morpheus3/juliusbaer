import { AssetClassSchema, type ChangeResponse, type SnapshotDate } from '@jb/contracts';
import type { ClientBundle, HoldingRecord } from '../repositories/clientDetailRepository.js';
import { round2 } from './dates.js';
import { Fx } from './fx.js';

const METHOD = [
  'Positions are matched by portfolio and instrument between the two snapshots.',
  'Flow effect = (quantity_to − quantity_from) × price_to × FX_to: what buying or selling contributed, valued at the end.',
  'Price effect = quantity_from × (price_to − price_from) × FX_from: what the market did to the position held at the start, in start-date FX.',
  'FX effect = quantity_from × price_to × (FX_to − FX_from): the change in USD value from currency moves alone.',
  'The three effects sum exactly to the change in USD market value. New positions are pure flow; closed positions are negative flow at the end price.',
  'Bond quantities follow the dataset convention (units of 100 nominal), so quantity × price is market value for every asset class.',
];

interface Decomp {
  startUsd: number;
  endUsd: number;
  price: number;
  fx: number;
  flow: number;
}

function decompose(
  from: HoldingRecord | undefined,
  to: HoldingRecord | undefined,
  fx: Fx,
  fromDate: string,
  toDate: string,
): Decomp {
  const q0 = from?.quantity ?? 0;
  const q1 = to?.quantity ?? 0;
  const ccy = (to ?? from)?.instrumentCcy ?? 'USD';
  const p0 = from?.priceLocal ?? to?.priceLocal ?? 0;
  const p1 = to?.priceLocal ?? from?.priceLocal ?? 0;
  const f0 = fx.usdPerUnit(ccy, fromDate);
  const f1 = fx.usdPerUnit(ccy, toDate);
  const startUsd = from?.marketValueUsd ?? 0;
  const endUsd = to?.marketValueUsd ?? 0;
  const flow = (q1 - q0) * p1 * f1;
  const price = q0 * (p1 - p0) * f0;
  const fxEffect = q0 * p1 * (f1 - f0);
  // Residual from rounding in the source market values is folded into price so the identity holds.
  const residual = endUsd - startUsd - (flow + price + fxEffect);
  return { startUsd, endUsd, price: price + residual, fx: fxEffect, flow };
}

export function changeAttribution(
  bundle: ClientBundle,
  from: SnapshotDate,
  to: SnapshotDate,
): ChangeResponse {
  const fx = new Fx(bundle.fx);
  const key = (h: HoldingRecord): string => `${h.portfolioId}|${h.instrumentId}`;
  const a = new Map(bundle.holdings.filter((h) => h.snapshotDate === from).map((h) => [key(h), h]));
  const b = new Map(bundle.holdings.filter((h) => h.snapshotDate === to).map((h) => [key(h), h]));
  const keys = new Set([...a.keys(), ...b.keys()]);

  const byClass = new Map<string, Decomp>();
  const byInstrument = new Map<
    string,
    Decomp & { name: string; assetClass: string; p0: number; p1: number }
  >();
  let total: Decomp = { startUsd: 0, endUsd: 0, price: 0, fx: 0, flow: 0 };

  const add = (acc: Decomp, d: Decomp): Decomp => ({
    startUsd: acc.startUsd + d.startUsd,
    endUsd: acc.endUsd + d.endUsd,
    price: acc.price + d.price,
    fx: acc.fx + d.fx,
    flow: acc.flow + d.flow,
  });

  for (const k of keys) {
    const h0 = a.get(k);
    const h1 = b.get(k);
    const any = h1 ?? h0;
    if (!any) {
      continue;
    }
    const d = decompose(h0, h1, fx, from, to);
    total = add(total, d);
    byClass.set(
      any.assetClass,
      add(byClass.get(any.assetClass) ?? { startUsd: 0, endUsd: 0, price: 0, fx: 0, flow: 0 }, d),
    );
    const cur = byInstrument.get(any.instrumentId) ?? {
      startUsd: 0,
      endUsd: 0,
      price: 0,
      fx: 0,
      flow: 0,
      name: any.instrumentName,
      assetClass: any.assetClass,
      p0: h0?.priceLocal ?? any.priceLocal,
      p1: h1?.priceLocal ?? any.priceLocal,
    };
    byInstrument.set(any.instrumentId, { ...cur, ...add(cur, d) });
  }

  const movers = [...byInstrument.entries()]
    .map(([instrumentId, d]) => ({
      instrumentId,
      name: d.name,
      assetClass: AssetClassSchema.parse(d.assetClass),
      startUsd: round2(d.startUsd),
      endUsd: round2(d.endUsd),
      priceEffectUsd: round2(d.price),
      fxEffectUsd: round2(d.fx),
      flowEffectUsd: round2(d.flow),
      pricePct: d.p0 ? round2(((d.p1 - d.p0) / d.p0) * 100) : null,
    }))
    .sort((x, y) => Math.abs(y.endUsd - y.startUsd) - Math.abs(x.endUsd - x.startUsd));

  return {
    from,
    to,
    startUsd: round2(total.startUsd),
    endUsd: round2(total.endUsd),
    priceEffectUsd: round2(total.price),
    fxEffectUsd: round2(total.fx),
    flowEffectUsd: round2(total.flow),
    byAssetClass: AssetClassSchema.options.flatMap((ac) => {
      const d = byClass.get(ac);
      if (!d) {
        return [];
      }
      return {
        assetClass: ac,
        startUsd: round2(d.startUsd),
        endUsd: round2(d.endUsd),
        priceEffectUsd: round2(d.price),
        fxEffectUsd: round2(d.fx),
        flowEffectUsd: round2(d.flow),
      };
    }),
    movers,
    method: METHOD,
  };
}
