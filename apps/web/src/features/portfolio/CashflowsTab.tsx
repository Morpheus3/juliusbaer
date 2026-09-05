import { useQuery } from '@tanstack/react-query';
import { CashflowsResponse } from '@jb/contracts';
import type { JSX } from 'react';
import { useParams } from 'react-router-dom';
import { CHART, EChart, usdCompact } from '@/components/EChart';
import { Kpi } from '@/components/Kpi';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';

export function CashflowsTab(): JSX.Element {
  const { clientId = 'CL-0002' } = useParams();
  const q = useQuery({
    queryKey: ['cashflows', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/cashflows`, CashflowsResponse),
  });
  if (q.isPending) {
    return <p className="text-muted">Loading…</p>;
  }
  if (q.isError) {
    return <div className="text-crit">{q.error.message}</div>;
  }
  const d = q.data;
  const axis = {
    axisLine: { lineStyle: { color: CHART.line } },
    axisLabel: { color: CHART.muted, fontFamily: CHART.font, fontSize: 11 },
  };
  const bars = {
    grid: { left: 60, right: 12, top: 28, bottom: 28 },
    legend: { top: 0, textStyle: { color: CHART.muted, fontFamily: CHART.font, fontSize: 11 } },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => usdCompact(v),
      textStyle: { fontFamily: CHART.font },
    },
    xAxis: { type: 'category', data: d.monthly.map((m) => m.month), ...axis },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: CHART.line } },
      axisLabel: {
        color: CHART.muted,
        fontFamily: CHART.mono,
        fontSize: 10,
        formatter: (v: number) => usdCompact(v),
      },
    },
    series: [
      {
        name: 'Income',
        type: 'bar',
        stack: 'a',
        data: d.monthly.map((m) => m.incomeUsd),
        itemStyle: { color: CHART.ok },
      },
      {
        name: 'Fees and charges',
        type: 'bar',
        stack: 'a',
        data: d.monthly.map((m) => m.feesUsd),
        itemStyle: { color: CHART.muted },
      },
      {
        name: 'Withdrawals',
        type: 'bar',
        stack: 'a',
        data: d.monthly.map((m) => m.withdrawalsUsd),
        itemStyle: { color: CHART.warn },
      },
      {
        name: 'Other flows',
        type: 'bar',
        stack: 'a',
        data: d.monthly.map((m) => m.otherUsd),
        itemStyle: { color: CHART.brass },
      },
    ],
  };
  const liq = d.liquidity;
  const liqTotal = liq.dailyUsd + liq.weeklyMonthlyUsd + liq.gatedUsd + liq.illiquidUsd;
  const ltv = d.facilities[0];
  const ltvOpt = ltv
    ? {
        grid: { left: 40, right: 12, top: 12, bottom: 28 },
        tooltip: { trigger: 'axis', textStyle: { fontFamily: CHART.font } },
        xAxis: { type: 'category', data: ltv.ltvSeries.map((s) => s.snapshotDate), ...axis },
        yAxis: {
          type: 'value',
          min: (v: { min: number }) => Math.floor(v.min - 5),
          max: Math.max(ltv.marginCallLtvPct + 5, ...ltv.ltvSeries.map((s) => s.ltvPct)),
          splitLine: { lineStyle: { color: CHART.line } },
          axisLabel: {
            color: CHART.muted,
            fontFamily: CHART.mono,
            fontSize: 10,
            formatter: '{value}%',
          },
        },
        series: [
          {
            type: 'line',
            data: ltv.ltvSeries.map((s) => s.ltvPct),
            lineStyle: { color: CHART.accent, width: 2 },
            itemStyle: { color: CHART.accent },
            symbolSize: 7,
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: CHART.crit, type: 'dashed' },
              label: {
                formatter: `trigger ${ltv.marginCallLtvPct}%`,
                color: CHART.crit,
                fontFamily: CHART.font,
                fontSize: 10,
              },
              data: [{ yAxis: ltv.marginCallLtvPct }],
            },
          },
        ],
      }
    : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Kpi
          label="Sellable daily"
          value={fmtUsdCompact(liq.dailyUsd)}
          sub={`${liqTotal ? ((liq.dailyUsd / liqTotal) * 100).toFixed(0) : 0}% of household`}
        />
        <Kpi
          label="Needs next 12m"
          value={fmtUsdCompact(d.coverage12m.needsUsd)}
          sub="confirmed and likely"
        />
        <Kpi
          label="Coverage"
          value={d.coverage12m.ratio === null ? 'n/a' : `${d.coverage12m.ratio.toFixed(1)}x`}
          tone={d.coverage12m.ratio !== null && d.coverage12m.ratio < 1.5 ? 'crit' : 'ok'}
          sub="daily-liquid ÷ 12-month needs"
        />
        <Kpi
          label="Gated or illiquid"
          value={fmtUsdCompact(liq.gatedUsd + liq.illiquidUsd)}
          sub={`${liqTotal ? (((liq.gatedUsd + liq.illiquidUsd) / liqTotal) * 100).toFixed(0) : 0}% of household`}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        <Panel title="Monthly cash flows" right="2026 · USD at today's rates">
          <EChart option={bars} height={230} />
        </Panel>
        <Panel title="Liquidity ladder" right="what is actually sellable">
          <div className="space-y-2 text-[12.5px]">
            {[
              ['Daily', liq.dailyUsd, CHART.ok],
              ['Weekly / monthly', liq.weeklyMonthlyUsd, CHART.accent],
              ['Quarterly gate', liq.gatedUsd, CHART.warn],
              ['Illiquid', liq.illiquidUsd, CHART.crit],
            ].map(([label, v, color]) => (
              <div
                key={String(label)}
                className="grid grid-cols-[120px_1fr_90px] items-center gap-3"
              >
                <span className="text-ink-2">{label}</span>
                <div className="h-2.5 rounded-sm bg-surface-2">
                  <div
                    className="h-2.5 rounded-sm"
                    style={{
                      width: `${liqTotal ? (Number(v) / liqTotal) * 100 : 0}%`,
                      background: String(color),
                    }}
                  />
                </div>
                <span className="tnum text-right font-mono">{fmtUsdCompact(Number(v))}</span>
              </div>
            ))}
          </div>
          {ltvOpt && ltv && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
                Loan-to-value · {ltv.type} {ltv.facilityId}
              </div>
              <EChart option={ltvOpt} height={140} />
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Planned cash needs and commitments"
        right="planned_cash_needs.csv · commitments.csv"
      >
        <table className="w-full text-[12.5px]">
          <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
            <tr>
              <th className="py-1 text-left font-semibold">Need</th>
              <th className="py-1 text-right font-semibold">Amount</th>
              <th className="py-1 text-right font-semibold">USD</th>
              <th className="py-1 text-left font-semibold">Window</th>
              <th className="py-1 text-left font-semibold">Recurrence</th>
              <th className="py-1 text-left font-semibold">Certainty</th>
              <th className="py-1 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {d.needs.map((n) => (
              <tr key={n.needId} className="border-t border-line">
                <td className="py-1.5 pr-2 text-ink">{n.description}</td>
                <td className="tnum py-1.5 text-right font-mono text-ink-2">
                  {n.currency} {n.amount.toLocaleString('en-US')}
                </td>
                <td className="tnum py-1.5 text-right font-mono">{fmtUsdCompact(n.amountUsd)}</td>
                <td className="py-1.5 pl-3 text-ink-2">
                  {fmtDate(n.dueFrom)} → {fmtDate(n.dueTo)}
                </td>
                <td className="py-1.5 text-ink-2">{n.recurrence}</td>
                <td className="py-1.5 text-ink-2">{n.certainty}</td>
                <td className="py-1.5">
                  <Pill
                    tone={
                      n.status === 'running' ? 'info' : n.status === 'upcoming' ? 'warn' : 'neutral'
                    }
                  >
                    {n.status === 'running'
                      ? 'Ongoing'
                      : n.status === 'upcoming'
                        ? `Upcoming · ${n.daysUntil}d`
                        : 'Planned'}
                  </Pill>
                </td>
              </tr>
            ))}
            {d.commitments.map((c) => (
              <tr key={c.commitmentId} className="border-t border-line">
                <td className="py-1.5 pr-2 text-ink">{c.fundName} · uncalled commitment</td>
                <td className="tnum py-1.5 text-right font-mono text-ink-2">
                  USD {c.uncalledUsd.toLocaleString('en-US')}
                </td>
                <td className="tnum py-1.5 text-right font-mono">{fmtUsdCompact(c.uncalledUsd)}</td>
                <td className="py-1.5 pl-3 text-ink-2">{c.window}</td>
                <td className="py-1.5 text-ink-2">Irregular</td>
                <td className="py-1.5 text-ink-2">Contractual</td>
                <td className="py-1.5">
                  <Pill tone="warn">Callable</Pill>
                </td>
              </tr>
            ))}
            {d.needs.length + d.commitments.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-muted">
                  No planned cash needs or commitments recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
