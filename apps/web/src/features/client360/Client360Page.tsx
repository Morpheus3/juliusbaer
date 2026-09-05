import { useQuery } from '@tanstack/react-query';
import { ClientOverviewResponse, type ClientAlert } from '@jb/contracts';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClientPicker } from '@/components/ClientPicker';
import { CHART, EChart, usdCompact } from '@/components/EChart';
import { Kpi } from '@/components/Kpi';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';

const ALERT_KIND_LABEL: Record<ClientAlert['kind'], string> = {
  MARGIN_CALL_PROXIMITY: 'Collateral',
  MANDATE_BREACH: 'Mandate',
  CONCENTRATION: 'Concentration',
  LOOKTHROUGH_CONCENTRATION: 'Look-through',
  SUSTAINABILITY_EXCLUSION: 'Exclusion',
  KYC_DUE: 'KYC',
  CASH_NEED_APPROACHING: 'Cash need',
  LIQUIDITY_SHORTFALL: 'Liquidity',
  STALE_VALUATION: 'Valuation',
  UNANSWERED_CONTACT: 'Contact',
};

/** Client 360 (L1): scan the client in thirty seconds. Wireframe slide 02. */
export function Client360Page(): JSX.Element {
  const { clientId = 'CL-0002' } = useParams();
  const q = useQuery({
    queryKey: ['overview', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/overview`, ClientOverviewResponse),
  });

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        eyebrow="Customer view · L1"
        title={q.data ? q.data.client.name : 'Client 360'}
        right={<ClientPicker value={clientId} to={(id) => `/clients/${id}`} />}
      >
        {q.data && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <span className="font-mono">{q.data.client.clientId}</span>
            <Pill tone="brass">{q.data.client.wealthBand}</Pill>
            <Pill tone="info">
              {q.data.client.riskProfile} · {q.data.client.riskToleranceScore}/10
            </Pill>
            <span>{q.data.client.lifeStage}</span>
            <span>· {q.data.client.bookingCentre}</span>
            <span>· reports in {q.data.client.baseCurrency}</span>
          </div>
        )}
      </PageHeader>

      {q.isPending && <p className="text-muted">Loading…</p>}
      {q.isError && (
        <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {q.error.message}
        </div>
      )}
      {q.data && <Body d={q.data} />}
    </div>
  );
}

function Body({ d }: { d: ClientOverviewResponse }): JSX.Element {
  const high = d.alerts.filter((a) => a.severity === 'high');
  const donut = {
    tooltip: {
      trigger: 'item',
      valueFormatter: (v: number) => usdCompact(v),
      textStyle: { fontFamily: CHART.font },
    },
    series: [
      {
        type: 'pie',
        radius: ['58%', '84%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: d.allocation
          .filter((a) => a.valueUsd > 0)
          .map((a) => ({
            name: a.assetClass,
            value: a.valueUsd,
            itemStyle: { color: CHART.assetClass[a.assetClass] },
          })),
      },
    ],
  };
  const line = {
    grid: { left: 56, right: 12, top: 16, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => usdCompact(v),
      textStyle: { fontFamily: CHART.font },
    },
    xAxis: {
      type: 'category',
      data: d.aumSeries.map((p) => p.label),
      axisLine: { lineStyle: { color: CHART.line } },
      axisLabel: { color: CHART.muted, fontFamily: CHART.font, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      scale: true,
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
        type: 'line',
        data: d.aumSeries.map((p) => p.valueUsd),
        smooth: false,
        symbolSize: 7,
        lineStyle: { color: CHART.accent, width: 2 },
        itemStyle: { color: CHART.accent },
        areaStyle: { color: 'rgba(31,78,121,0.08)' },
      },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        <Kpi
          label="AUM"
          value={fmtUsdCompact(d.kpis.aumUsd)}
          sub={`${d.kpis.portfolioCount} portfolios · ${d.kpis.managedCount} managed`}
        />
        <Kpi
          label="Since 31 Dec 2025"
          value={`${d.kpis.ytdChangePct > 0 ? '+' : ''}${d.kpis.ytdChangePct.toFixed(1)}%`}
          tone={d.kpis.ytdChangePct < 0 ? 'crit' : 'ok'}
          sub="incl. flows · USD"
        />
        <Kpi
          label="Cash"
          value={`${d.kpis.cashPct.toFixed(1)}%`}
          sub={fmtUsdCompact(d.kpis.cashUsd)}
        />
        <Kpi
          label="Income yield"
          value={`${d.kpis.incomeYieldPct.toFixed(1)}%`}
          sub="annualised, 2026 receipts"
        />
        <Kpi
          label="Last contact"
          value={d.client.lastContactDate ? fmtDate(d.client.lastContactDate) : '—'}
          sub={`${d.client.lastContactChannel ?? ''} · KYC due ${fmtDate(d.client.kycReviewDue)}`}
        />
      </div>

      <AlertsBanner alerts={d.alerts} highCount={high.length} />

      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <Panel
          title="Portfolio snapshot"
          right={<Link to={`/clients/${d.client.clientId}/portfolio`}>Deep dive →</Link>}
        >
          <div className="grid grid-cols-[150px_1fr] items-center gap-3">
            <EChart option={donut} height={150} />
            <ul className="m-0 list-none space-y-1 p-0 text-[12.5px]">
              {d.allocation
                .filter((a) => a.valueUsd > 0)
                .map((a) => {
                  const out =
                    a.band && (a.weightPct < a.band.minPct || a.weightPct > a.band.maxPct);
                  return (
                    <li key={a.assetClass} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-ink-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={{ background: CHART.assetClass[a.assetClass] }}
                        />
                        {a.assetClass}
                      </span>
                      <span className="tnum font-mono text-[12px]">
                        <span className={out ? 'font-semibold text-crit' : ''}>
                          {a.weightPct.toFixed(1)}%
                        </span>
                        {a.band && (
                          <span className="ml-1 text-[10.5px] text-muted">
                            {a.band.minPct}–{a.band.maxPct}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
          <table className="mt-3 w-full text-[12px]">
            <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="py-1 text-left font-semibold">Holding</th>
                <th className="py-1 text-right font-semibold">Mkt val</th>
                <th className="py-1 text-right font-semibold">Wt%</th>
                <th className="py-1 text-right font-semibold">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {d.topHoldings.slice(0, 6).map((h) => (
                <tr key={`${h.portfolioId}-${h.instrumentId}`} className="border-t border-line">
                  <td className="py-1 pr-2 text-ink-2">
                    {h.name}
                    {h.concentration.breached && <Pill tone="crit">FLAG</Pill>}
                  </td>
                  <td className="tnum py-1 text-right font-mono">
                    {fmtUsdCompact(h.marketValueUsd)}
                  </td>
                  <td className="tnum py-1 text-right font-mono">
                    {h.householdWeightPct.toFixed(1)}
                  </td>
                  <td
                    className={`tnum py-1 text-right font-mono ${(h.unrealisedPnlPct ?? 0) < 0 ? 'text-crit' : 'text-ok'}`}
                  >
                    {h.unrealisedPnlPct === null
                      ? '—'
                      : `${h.unrealisedPnlPct > 0 ? '+' : ''}${h.unrealisedPnlPct.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Performance and cash flow" right="USD · five snapshots">
          <EChart option={line} height={170} />
          <ul className="m-0 mt-2 list-none space-y-1 p-0 text-[12px]">
            {d.portfolios.map((p) => {
              const first = p.series[0]?.valueUsd ?? 0;
              const last = p.series.at(-1)?.valueUsd ?? 0;
              const chg = first ? (last / first - 1) * 100 : 0;
              return (
                <li key={p.portfolioId} className="flex items-center justify-between gap-2">
                  <span className="text-ink-2">
                    {p.name}{' '}
                    <span className="font-mono text-[10.5px] text-muted">
                      {p.mandateCode}
                      {p.serviceModel === 'Custody' ? ' · custody' : ''}
                    </span>
                  </span>
                  <span className="tnum font-mono">
                    {fmtUsdCompact(last)}{' '}
                    <span className={chg < 0 ? 'text-crit' : 'text-ok'}>
                      {chg > 0 ? '+' : ''}
                      {chg.toFixed(1)}%
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-4">
          <Panel title="Live market signals" right="iteration 3">
            <p className="m-0 text-[12.5px] text-muted">
              Signals from the event log will appear here filtered to this client's exposures, each
              with source, confidence and affected holdings.
            </p>
          </Panel>
          <Panel title="RM action queue" right="iteration 5">
            <p className="m-0 text-[12.5px] text-muted">
              Ranked actions with suitability checks and approve-and-log arrive with the combined
              risk engine. Until then the alerts above are the queue.
            </p>
          </Panel>
          <Panel title="Risk rubric" right="iteration 4">
            <p className="m-0 text-[12.5px] text-muted">
              Capacity, Appetite and Horizon scores are computed from the{' '}
              <Link to={`/clients/${d.client.clientId}/vector`}>customer vector</Link>.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function AlertsBanner({
  alerts,
  highCount,
}: {
  alerts: ClientAlert[];
  highCount: number;
}): JSX.Element {
  if (alerts.length === 0) {
    return (
      <div className="rounded-md border border-ok/30 bg-ok-soft px-4 py-2 text-[13px] text-ok">
        No active alerts from the data.
      </div>
    );
  }
  const tone = highCount > 0 ? 'border-crit/30 bg-crit-soft' : 'border-warn/30 bg-warn-soft';
  return (
    <div className={`rounded-md border ${tone} px-4 py-3`}>
      <div className="mb-2 text-[13px] font-semibold text-ink">
        {alerts.length} active alert{alerts.length > 1 ? 's' : ''}
        {highCount > 0 && <span className="text-crit"> · {highCount} high</span>}
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1.5 p-0">
        {alerts.map((a) => (
          <li key={a.id} className="flex items-start gap-2 text-[12.5px]">
            <Pill
              tone={a.severity === 'high' ? 'crit' : a.severity === 'medium' ? 'warn' : 'neutral'}
            >
              {ALERT_KIND_LABEL[a.kind]}
            </Pill>
            <span>
              <span className="font-medium text-ink">{a.title}</span>
              <span className="text-ink-2"> — {a.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
