import { SnapshotDateSchema, type CashflowsResponse } from '@jb/contracts';
import type { ClientBundle } from '../repositories/clientDetailRepository.js';
import { addMonths, daysBetween, monthKey, round2 } from './dates.js';
import { Fx } from './fx.js';
import { holdingsAt } from './holdingsView.js';

const INCOME = new Set(['Dividend', 'Coupon', 'Interest', 'Distribution']);
const FEES = new Set(['Management Fee', 'Interest Charge']);
const FIRM = new Set(['Confirmed', 'Likely']);

/** USD amount of a cash need falling inside the next 12 months. */
export function needWithin12m(
  need: { amount: number; recurrence: string; dueFrom: string; dueTo: string; certainty: string },
  amountUsd: number,
  today: string,
): number {
  if (!FIRM.has(need.certainty)) {
    return 0;
  }
  const horizonEnd = addMonths(today, 12);
  if (need.dueFrom > horizonEnd || need.dueTo < today) {
    return 0;
  }
  const rec = need.recurrence.toLowerCase();
  if (rec.includes('annual') || rec === 'one-off') {
    return amountUsd;
  }
  const windowDays = Math.max(daysBetween(need.dueFrom, need.dueTo), 1);
  const overlap = Math.max(0, Math.min(daysBetween(need.dueFrom, horizonEnd), windowDays));
  return (amountUsd * overlap) / windowDays;
}

export function cashflows(bundle: ClientBundle, today: string, CURRENT: string): CashflowsResponse {
  const fx = new Fx(bundle.fx);
  const monthly = new Map<
    string,
    { incomeUsd: number; feesUsd: number; withdrawalsUsd: number; otherUsd: number }
  >();
  for (const t of bundle.transactions) {
    const m = monthKey(t.tradeDate);
    const cur = monthly.get(m) ?? { incomeUsd: 0, feesUsd: 0, withdrawalsUsd: 0, otherUsd: 0 };
    const usd = fx.toUsd(t.amount, t.currency, CURRENT);
    if (INCOME.has(t.transactionType)) {
      cur.incomeUsd += usd;
    } else if (FEES.has(t.transactionType)) {
      cur.feesUsd += usd;
    } else if (t.transactionType === 'Withdrawal') {
      cur.withdrawalsUsd += usd;
    } else {
      cur.otherUsd += usd;
    }
    monthly.set(m, cur);
  }

  const rows = holdingsAt(bundle, CURRENT);
  const tier = (tiers: string[]): number =>
    rows.filter((h) => tiers.includes(h.liquidityTier)).reduce((s, h) => s + h.marketValueUsd, 0);
  const dailyUsd = tier(['Daily']);

  let needs12m = 0;
  const needs = [...bundle.cashNeeds]
    .sort((a, b) => a.dueFrom.localeCompare(b.dueFrom))
    .map((n) => {
      const amountUsd = fx.toUsd(n.amount, n.currency, CURRENT);
      needs12m += needWithin12m(n, amountUsd, today);
      const status =
        n.dueFrom <= today && today <= n.dueTo
          ? 'running'
          : n.dueFrom <= addMonths(today, 6)
            ? 'upcoming'
            : 'planned';
      return {
        needId: n.needId,
        description: n.description,
        currency: n.currency,
        amount: n.amount,
        amountUsd: round2(amountUsd),
        dueFrom: n.dueFrom,
        dueTo: n.dueTo,
        recurrence: n.recurrence,
        certainty: n.certainty,
        status,
        daysUntil: Math.max(0, daysBetween(today, n.dueFrom)),
      } as const;
    });

  return {
    asOf: today,
    monthly: [...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        incomeUsd: round2(v.incomeUsd),
        feesUsd: round2(v.feesUsd),
        withdrawalsUsd: round2(v.withdrawalsUsd),
        otherUsd: round2(v.otherUsd),
      })),
    liquidity: {
      dailyUsd: round2(dailyUsd),
      weeklyMonthlyUsd: round2(tier(['Weekly', 'Monthly'])),
      gatedUsd: round2(tier(['Quarterly Gate'])),
      illiquidUsd: round2(tier(['Illiquid'])),
    },
    needs,
    commitments: bundle.commitments.map((c) => ({
      commitmentId: c.commitmentId,
      fundName: c.fundName,
      uncalledUsd: round2(fx.toUsd(c.uncalled, c.currency, CURRENT)),
      window: c.expectedCallWindow,
    })),
    facilities: bundle.facilities.map((f) => ({
      facilityId: f.facilityId,
      type: f.facilityType,
      currency: f.facilityCcy,
      drawn:
        bundle.facilitySnapshots.find(
          (s) => s.facilityId === f.facilityId && s.snapshotDate === CURRENT,
        )?.drawn ?? 0,
      limit: f.creditLimit,
      ltvPct:
        bundle.facilitySnapshots.find(
          (s) => s.facilityId === f.facilityId && s.snapshotDate === CURRENT,
        )?.ltvPct ?? 0,
      marginCallLtvPct: f.marginCallLtvPct,
      ltvSeries: bundle.facilitySnapshots
        .filter((s) => s.facilityId === f.facilityId)
        .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
        .map((s) => ({
          snapshotDate: SnapshotDateSchema.parse(s.snapshotDate),
          ltvPct: s.ltvPct,
          headroom: s.headroom,
        })),
    })),
    coverage12m: {
      needsUsd: round2(needs12m),
      dailyLiquidUsd: round2(dailyUsd),
      ratio: needs12m > 0 ? round2(dailyUsd / needs12m) : null,
    },
  };
}
