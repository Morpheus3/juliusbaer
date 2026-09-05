import {
  AssetClassSchema,
  BASELINE_SNAPSHOT,
  CURRENT_SNAPSHOT,
  SNAPSHOT_DATES,
  type CashflowsResponse,
  type ChangeResponse,
  type ClientOverviewResponse,
  type ExposureResponse,
  type HoldingsResponse,
  type MandateStatusResponse,
  type SnapshotDate,
  type TransactionsResponse,
} from '@jb/contracts';
import { deriveAlerts } from '../domain/alerts.js';
import { changeAttribution } from '../domain/attribution.js';
import { cashflows } from '../domain/cashflows.js';
import { round2, round4 } from '../domain/dates.js';
import { exposure } from '../domain/exposure.js';
import { Fx } from '../domain/fx.js';
import { buildHoldingRows, holdingsAt, householdTotalUsd } from '../domain/holdingsView.js';
import { householdAllocation, mandateStatus } from '../domain/mandate.js';
import type {
  ClientBundle,
  ClientDetailRepository,
} from '../repositories/clientDetailRepository.js';
import { ClientNotFoundError } from './vectorService.js';

const CURRENT = CURRENT_SNAPSHOT;
const BASELINE = BASELINE_SNAPSHOT;
const SNAPSHOT_LABEL: Record<SnapshotDate, string> = {
  '2025-12-31': 'Year-end 2025',
  '2026-02-27': 'Pre-conflict',
  '2026-03-31': 'Post-Hormuz',
  '2026-06-30': 'Half-year',
  '2026-08-26': 'Today',
};
const INCOME = new Set(['Dividend', 'Coupon', 'Interest', 'Distribution']);

export class ClientDetailService {
  constructor(
    private readonly repo: ClientDetailRepository,
    private readonly today: string,
  ) {}

  private async bundle(clientId: string): Promise<ClientBundle> {
    const b = await this.repo.bundle(clientId);
    if (!b) {
      throw new ClientNotFoundError(clientId);
    }
    return b;
  }

  async overview(clientId: string): Promise<ClientOverviewResponse> {
    const b = await this.bundle(clientId);
    const now = holdingsAt(b, CURRENT);
    const aum = householdTotalUsd(now);
    const aumBase = householdTotalUsd(holdingsAt(b, BASELINE));
    const cash = now
      .filter((h) => h.assetClass === 'Cash and Equivalents')
      .reduce((s, h) => s + h.marketValueUsd, 0);
    const pnlRows = now.filter((h) => h.unrealisedPnlBase !== null);
    const fx = new Fx(b.fx);
    const unrealised =
      pnlRows.length === now.length
        ? pnlRows.reduce(
            (s, h) => s + fx.toUsd(h.unrealisedPnlBase ?? 0, h.portfolioCcy, CURRENT),
            0,
          )
        : null;
    const income = b.transactions
      .filter((t) => INCOME.has(t.transactionType))
      .reduce((s, t) => s + fx.toUsd(t.amount, t.currency, CURRENT), 0);
    const monthsElapsed = Math.max(
      (Date.parse(`${this.today}T00:00:00Z`) - Date.parse('2026-01-01T00:00:00Z')) /
        (30.4375 * 86_400_000),
      1,
    );

    const mandate = mandateStatus(b, CURRENT);
    const exp = exposure(b, CURRENT);
    const cf = cashflows(b, this.today);
    const alerts = deriveAlerts(b, mandate, exp, cf, this.today);
    const lastNote = b.notes.at(-1);

    const series = (portfolioId?: string): ClientOverviewResponse['aumSeries'] =>
      SNAPSHOT_DATES.map((d) => ({
        snapshotDate: d,
        label: SNAPSHOT_LABEL[d],
        valueUsd: round2(
          b.holdings
            .filter(
              (h) =>
                h.snapshotDate === d &&
                (portfolioId === undefined || h.portfolioId === portfolioId),
            )
            .reduce((s, h) => s + h.marketValueUsd, 0),
        ),
      }));

    return {
      asOf: this.today,
      client: {
        clientId: b.client.clientId,
        name: b.client.clientName,
        wealthBand: b.client.wealthBand,
        bookingCentre: b.client.bookingCentre,
        baseCurrency: b.client.baseCurrency,
        riskProfile: b.client.riskProfile,
        riskToleranceScore: b.client.riskToleranceScore,
        lifeStage: b.client.lifeStage,
        kycReviewDue: b.client.kycReviewDue,
        lastContactDate: lastNote?.noteDate ?? null,
        lastContactChannel: lastNote?.channel ?? null,
        reportingLanguage: b.client.reportingLanguage,
      },
      kpis: {
        aumUsd: round2(aum),
        aumBaselineUsd: round2(aumBase),
        ytdChangePct: aumBase ? round2((aum / aumBase - 1) * 100) : 0,
        cashUsd: round2(cash),
        cashPct: aum ? round4((cash / aum) * 100) : 0,
        unrealisedPnlUsd: unrealised === null ? null : round2(unrealised),
        incomeYieldPct: aum ? round2(((income * 12) / monthsElapsed / aum) * 100) : 0,
        portfolioCount: b.portfolios.length,
        managedCount: b.portfolios.filter((p) => p.serviceModel !== 'Custody').length,
      },
      alerts,
      allocation: householdAllocation(b, CURRENT),
      topHoldings: buildHoldingRows(b, CURRENT).slice(0, 8),
      aumSeries: series(),
      portfolios: b.portfolios.map((p) => ({
        portfolioId: p.portfolioId,
        name: p.portfolioName,
        mandateCode: p.mandateCode,
        mandateName: p.mandateName,
        serviceModel: p.serviceModel,
        baseCurrency: p.baseCurrency,
        aumUsd: round2(p.aumUsdCurrent),
        series: series(p.portfolioId),
      })),
    };
  }

  async holdings(
    clientId: string,
    snapshotDate: SnapshotDate,
    portfolioId?: string,
  ): Promise<HoldingsResponse> {
    const b = await this.bundle(clientId);
    const rows = buildHoldingRows(b, snapshotDate).filter(
      (r) => portfolioId === undefined || r.portfolioId === portfolioId,
    );
    return {
      snapshotDate,
      snapshots: [...SNAPSHOT_DATES],
      totalUsd: round2(rows.reduce((s, r) => s + r.marketValueUsd, 0)),
      rows,
    };
  }

  async exposure(clientId: string, snapshotDate: SnapshotDate): Promise<ExposureResponse> {
    return exposure(await this.bundle(clientId), snapshotDate);
  }

  async mandate(clientId: string, snapshotDate: SnapshotDate): Promise<MandateStatusResponse> {
    return mandateStatus(await this.bundle(clientId), snapshotDate);
  }

  async change(clientId: string, from: SnapshotDate, to: SnapshotDate): Promise<ChangeResponse> {
    return changeAttribution(await this.bundle(clientId), from, to);
  }

  async cashflows(clientId: string): Promise<CashflowsResponse> {
    return cashflows(await this.bundle(clientId), this.today);
  }

  async transactions(
    clientId: string,
    portfolioId?: string,
    type?: string,
  ): Promise<TransactionsResponse> {
    const b = await this.bundle(clientId);
    const fx = new Fx(b.fx);
    const all = b.transactions.map((t) => ({
      transactionId: t.transactionId,
      tradeDate: t.tradeDate,
      portfolioId: t.portfolioId,
      type: t.transactionType,
      instrumentId: t.instrumentId,
      instrumentName: t.instrumentName,
      quantity: t.quantity,
      priceLocal: t.priceLocal,
      currency: t.currency,
      amount: t.amount,
      amountUsd: round2(fx.toUsd(t.amount, t.currency, CURRENT)),
      narrative: t.narrative,
    }));
    const rows = all
      .filter(
        (t) =>
          (portfolioId === undefined || t.portfolioId === portfolioId) &&
          (type === undefined || t.type === type),
      )
      .sort((a, c) => c.tradeDate.localeCompare(a.tradeDate));
    const totals: Record<string, number> = {};
    for (const t of rows) {
      totals[t.type] = round2((totals[t.type] ?? 0) + t.amountUsd);
    }
    return { rows, types: [...new Set(all.map((t) => t.type))].sort(), totalsUsdByType: totals };
  }
}

export { AssetClassSchema };
