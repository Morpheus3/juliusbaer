/**
 * Data-quality checks. Each is a pure function over the validated dataset. The README
 * says the data carries "a small number of real-world imperfections" on purpose; the
 * goal is to name them, attach them to the client they affect, and let the UI show
 * them next to any figure they touch.
 */
import type { Check, Finding } from './types.js';

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const near = (a: number, b: number, tolAbs: number, tolRel = 0): boolean =>
  Math.abs(a - b) <= Math.max(tolAbs, Math.abs(b) * tolRel);

export const staleValuation: Check = ({ data }) =>
  data.holdings
    .filter((h) => h.valuation_date !== h.snapshot_date)
    .map((h) => ({
      code: 'STALE_VALUATION',
      severity: 'warning',
      entityType: 'holding',
      entityId: `${h.portfolio_id}/${h.snapshot_date}/${h.instrument_id}`,
      clientId: h.client_id,
      message: `${h.instrument_name} is valued as of ${h.valuation_date}, ${daysBetween(h.valuation_date, h.snapshot_date)} days before the ${h.snapshot_date} snapshot.`,
      detail: {
        portfolioId: h.portfolio_id,
        instrumentId: h.instrument_id,
        valuationDate: h.valuation_date,
        snapshotDate: h.snapshot_date,
        marketValueBase: h.market_value_base,
        liquidityTier: h.liquidity_tier,
      },
    }));

export const missingCostBasis: Check = ({ data }) =>
  data.holdings
    .filter((h) => h.cost_basis_base === null || h.avg_cost_local === null)
    .map((h) => ({
      code: 'MISSING_COST_BASIS',
      severity: 'warning',
      entityType: 'holding',
      entityId: `${h.portfolio_id}/${h.snapshot_date}/${h.instrument_id}`,
      clientId: h.client_id,
      message: `${h.instrument_name} has no cost basis at ${h.snapshot_date}; unrealised P&L and tax-aware analysis are unavailable for this position.`,
      detail: {
        portfolioId: h.portfolio_id,
        instrumentId: h.instrument_id,
        snapshotDate: h.snapshot_date,
      },
    }));

export const entityWithoutAge: Check = ({ data }) =>
  data.clients
    .filter((c) => c.age === null || c.gender === 'Entity')
    .map((c) => ({
      code: 'ENTITY_WITHOUT_AGE',
      severity: 'info',
      entityType: 'client',
      entityId: c.client_id,
      clientId: c.client_id,
      message: `${c.client_name} is an entity; age-based rules (retirement, horizon by age) do not apply.`,
      detail: { gender: c.gender, lifeStage: c.life_stage },
    }));

export const custodyOutsideMandate: Check = ({ data }) =>
  data.portfolios
    .filter((p) => p.service_model === 'Custody')
    .map((p) => ({
      code: 'CUSTODY_OUTSIDE_MANDATE',
      severity: 'info',
      entityType: 'portfolio',
      entityId: p.portfolio_id,
      clientId: p.client_id,
      message: `${p.portfolio_name} is a custody account: not measured against the ${p.mandate_name} mandate, but it counts towards the client's total exposure.`,
      detail: { mandateCode: p.mandate_code, aumUsdCurrent: p.aum_usd_current },
    }));

export const kycDue: Check = ({ data, today }) =>
  data.clients.flatMap((c): Finding[] => {
    const days = daysBetween(today, c.kyc_review_due);
    if (days < 0) {
      return [
        {
          code: 'KYC_OVERDUE',
          severity: 'error',
          entityType: 'client',
          entityId: c.client_id,
          clientId: c.client_id,
          message: `KYC review for ${c.client_name} was due ${c.kyc_review_due}, ${-days} days ago.`,
          detail: { kycReviewDue: c.kyc_review_due, daysOverdue: -days },
        },
      ];
    }
    if (days <= 45) {
      return [
        {
          code: 'KYC_DUE_SOON',
          severity: 'warning',
          entityType: 'client',
          entityId: c.client_id,
          clientId: c.client_id,
          message: `KYC review for ${c.client_name} is due ${c.kyc_review_due}, in ${days} days.`,
          detail: { kycReviewDue: c.kyc_review_due, daysUntilDue: days },
        },
      ];
    }
    return [];
  });

export const missingSector: Check = ({ data }) =>
  data.instruments
    .filter((i) => i.sector === null)
    .map((i) => ({
      code: 'MISSING_SECTOR',
      severity: 'info',
      entityType: 'instrument',
      entityId: i.instrument_id,
      clientId: null,
      message: `${i.instrument_name} has no sector; sector exposure aggregates will show it as unclassified.`,
      detail: { assetClass: i.asset_class, subAssetClass: i.sub_asset_class },
    }));

/** Private markets marks are reported quarterly and lag by design. Flag them so the UI can caveat. */
export const privateMarketMarkLag: Check = ({ data }) => {
  const current = data.snapshots[data.snapshots.length - 1]?.date;
  return data.holdings
    .filter(
      (h) =>
        h.snapshot_date === current &&
        h.asset_class === 'Alternatives' &&
        (h.liquidity_tier === 'Illiquid' || h.liquidity_tier === 'Quarterly Gate'),
    )
    .map((h) => ({
      code: 'PRIVATE_MARKET_MARK_LAG',
      severity: 'info',
      entityType: 'holding',
      entityId: `${h.portfolio_id}/${h.snapshot_date}/${h.instrument_id}`,
      clientId: h.client_id,
      message: `${h.instrument_name} is a ${h.liquidity_tier.toLowerCase()} private-markets position; its mark is typically one quarter behind.`,
      detail: {
        portfolioId: h.portfolio_id,
        instrumentId: h.instrument_id,
        marketValueBase: h.market_value_base,
      },
    }));
};

export const aumReconciliation: Check = ({ data }) => {
  const findings: Finding[] = [];
  const byClient = new Map<string, number>();
  for (const p of data.portfolios) {
    byClient.set(p.client_id, (byClient.get(p.client_id) ?? 0) + p.aum_usd_current);
  }
  for (const c of data.clients) {
    const sum = byClient.get(c.client_id) ?? 0;
    if (!near(sum, c.total_aum_usd, 1, 0.0005)) {
      findings.push({
        code: 'AUM_RECONCILIATION',
        severity: 'warning',
        entityType: 'client',
        entityId: c.client_id,
        clientId: c.client_id,
        message: `Client total AUM ${c.total_aum_usd.toFixed(2)} does not equal the sum of portfolios ${sum.toFixed(2)}.`,
        detail: { clientTotal: c.total_aum_usd, portfolioSum: sum },
      });
    }
  }
  const holdingsSum = new Map<string, number>();
  for (const h of data.holdings) {
    const k = `${h.portfolio_id}|${h.snapshot_date}`;
    holdingsSum.set(k, (holdingsSum.get(k) ?? 0) + h.market_value_base);
  }
  for (const p of data.portfolios) {
    for (const d of data.snapshots.map((x) => x.date)) {
      const sum = holdingsSum.get(`${p.portfolio_id}|${d}`) ?? 0;
      const aum = Number(p[`aum_${d}`]);
      if (!near(sum, aum, 1, 0.001)) {
        findings.push({
          code: 'AUM_RECONCILIATION',
          severity: 'warning',
          entityType: 'portfolio',
          entityId: p.portfolio_id,
          clientId: p.client_id,
          message: `Portfolio AUM at ${d} (${aum.toFixed(2)}) does not equal the sum of holdings (${sum.toFixed(2)}).`,
          detail: { snapshotDate: d, portfolioAum: aum, holdingsSum: sum },
        });
      }
    }
  }
  return findings;
};

export const weightSum: Check = ({ data }) => {
  const sums = new Map<string, { w: number; clientId: string }>();
  for (const h of data.holdings) {
    const k = `${h.portfolio_id}|${h.snapshot_date}`;
    const cur = sums.get(k) ?? { w: 0, clientId: h.client_id };
    cur.w += h.weight_pct;
    sums.set(k, cur);
  }
  return [...sums.entries()]
    .filter(([, v]) => !near(v.w, 100, 0.5))
    .map(([k, v]) => {
      const [portfolioId = '', snapshotDate = ''] = k.split('|');
      return {
        code: 'WEIGHT_SUM' as const,
        severity: 'warning' as const,
        entityType: 'portfolio' as const,
        entityId: portfolioId,
        clientId: v.clientId,
        message: `Holding weights at ${snapshotDate} sum to ${v.w.toFixed(2)}% rather than 100%.`,
        detail: { snapshotDate, weightSum: v.w },
      };
    });
};

export const ltvRecompute: Check = ({ data }) =>
  data.creditFacilities.flatMap((f) =>
    data.snapshots.flatMap(({ date: d }): Finding[] => {
      const lending = Number(f[`lending_value_${d}`]);
      const drawn = Number(f[`drawn_${d}`]);
      const stated = Number(f[`ltv_pct_${d}`]);
      const computed = lending === 0 ? 0 : (drawn / lending) * 100;
      if (near(computed, stated, 0.05)) {
        return [];
      }
      return [
        {
          code: 'LTV_RECOMPUTE',
          severity: 'warning',
          entityType: 'facility',
          entityId: f.facility_id,
          clientId: f.client_id,
          message: `Stated LTV ${stated}% at ${d} differs from drawn ÷ lending value (${computed.toFixed(2)}%).`,
          detail: { snapshotDate: d, stated, computed, drawn, lendingValue: lending },
        },
      ];
    }),
  );

export const commitmentArithmetic: Check = ({ data }) =>
  data.commitments
    .filter((c) => !near(c.committed - c.called_to_date, c.uncalled, 1))
    .map((c) => ({
      code: 'COMMITMENT_ARITHMETIC',
      severity: 'warning',
      entityType: 'commitment',
      entityId: c.commitment_id,
      clientId: c.client_id,
      message: `${c.fund_name}: committed minus called (${c.committed - c.called_to_date}) does not equal uncalled (${c.uncalled}).`,
      detail: { committed: c.committed, calledToDate: c.called_to_date, uncalled: c.uncalled },
    }));

export const orphanReferences: Check = ({ data }) => {
  const clients = new Set(data.clients.map((c) => c.client_id));
  const portfolios = new Set(data.portfolios.map((p) => p.portfolio_id));
  const instruments = new Set(data.instruments.map((i) => i.instrument_id));
  const findings: Finding[] = [];
  const orphan = (
    entityType: Finding['entityType'],
    entityId: string,
    clientId: string | null,
    what: string,
  ) =>
    findings.push({
      code: 'ORPHAN_REFERENCE',
      severity: 'error',
      entityType,
      entityId,
      clientId,
      message: `${what} refers to an identifier that does not exist in the dataset.`,
      detail: {},
    });
  for (const p of data.portfolios) {
    if (!clients.has(p.client_id)) {
      orphan(
        'portfolio',
        p.portfolio_id,
        p.client_id,
        `Portfolio ${p.portfolio_id} (client ${p.client_id})`,
      );
    }
  }
  for (const h of data.holdings) {
    if (!portfolios.has(h.portfolio_id) || !instruments.has(h.instrument_id)) {
      orphan(
        'holding',
        `${h.portfolio_id}/${h.snapshot_date}/${h.instrument_id}`,
        h.client_id,
        'Holding',
      );
    }
  }
  for (const t of data.transactions) {
    if (
      !portfolios.has(t.portfolio_id) ||
      (t.instrument_id !== null && !instruments.has(t.instrument_id))
    ) {
      orphan('transaction', t.transaction_id, t.client_id, `Transaction ${t.transaction_id}`);
    }
  }
  return findings;
};

/** Sustainable mandates hold instruments the mandate excludes. Not a data error, but a governance fact worth registering at load. */
export const sustainabilityExclusionHeld: Check = ({ data }) => {
  const current = data.snapshots[data.snapshots.length - 1]?.date;
  const excluded = new Set(
    data.instruments.filter((i) => i.sustainability_excluded).map((i) => i.instrument_id),
  );
  const exclusionMandates = new Set(exclusionBoundMandates(data.mandates));
  const sustainable = new Set(
    data.portfolios.filter((p) => exclusionMandates.has(p.mandate_code)).map((p) => p.portfolio_id),
  );
  return data.holdings
    .filter(
      (h) =>
        h.snapshot_date === current &&
        sustainable.has(h.portfolio_id) &&
        excluded.has(h.instrument_id),
    )
    .map((h) => ({
      code: 'SUSTAINABILITY_EXCLUSION_HELD',
      severity: 'error',
      entityType: 'holding',
      entityId: `${h.portfolio_id}/${h.snapshot_date}/${h.instrument_id}`,
      clientId: h.client_id,
      message: `${h.instrument_name} (${h.weight_pct.toFixed(1)}% of ${h.portfolio_id}) falls within the mandate's binding exclusions.`,
      detail: {
        portfolioId: h.portfolio_id,
        instrumentId: h.instrument_id,
        weightPct: h.weight_pct,
      },
    }));
};

export const ALL_CHECKS: readonly Check[] = [
  staleValuation,
  missingCostBasis,
  entityWithoutAge,
  custodyOutsideMandate,
  kycDue,
  missingSector,
  privateMarketMarkLag,
  aumReconciliation,
  weightSum,
  ltvRecompute,
  commitmentArithmetic,
  orphanReferences,
  sustainabilityExclusionHeld,
];

/** Mandates whose notes declare binding exclusions. Detected from text so no mandate code is assumed. */
export function exclusionBoundMandates(
  mandates: readonly { mandate_code: string; mandate_notes: string }[],
): string[] {
  return [
    ...new Set(
      mandates.filter((m) => /exclusion/i.test(m.mandate_notes)).map((m) => m.mandate_code),
    ),
  ];
}
