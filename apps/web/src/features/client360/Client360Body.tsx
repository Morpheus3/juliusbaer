import { useQuery } from '@tanstack/react-query';
import {
  RubricAssessmentResponse,
  SignalsResponse,
  type ClientAlert,
  type ClientOverviewResponse,
} from '@jb/contracts';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { CHART, EChart, usdCompact } from '@/components/EChart';
import { Kpi } from '@/components/Kpi';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { ApiError, getJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';
import { useMeta } from '@/lib/meta';
import { useClockDate } from '@/state/clock';
import { useCombinedRisk } from '../risk/riskApi';
import { SEVERITY_SHORT, SEVERITY_TONE, ageLabel } from '../signals/signalFormat';

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

/**
 * Client 360 body: the thirty-second scan (KPIs, alerts, snapshot, performance, signals, queue,
 * rubric). Chapter 1 of the client journey. Wireframe slide 02.
 */
export function Client360Body({ d }: { d: ClientOverviewResponse }): JSX.Element {
  const meta = useMeta();
  const baseline = meta.data?.baseline;
  const snapshotCount = meta.data?.snapshots.length ?? d.aumSeries.length;

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
          label={baseline ? `Since ${fmtDate(baseline)}` : 'Since baseline'}
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
          sub="annualised from receipts"
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

        <Panel title="Performance and cash flow" right={`USD · ${snapshotCount} snapshots`}>
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
          <SignalsPanel clientId={d.client.clientId} />
          <ActionQueuePanel clientId={d.client.clientId} />
          <RubricPanel clientId={d.client.clientId} />
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

function SignalsPanel({ clientId }: { clientId: string }): JSX.Element {
  const clock = useClockDate();
  const q = useQuery({
    queryKey: ['signals', clock, clientId],
    queryFn: () => getJson(`/api/v1/signals?clock=${clock}&clientId=${clientId}`, SignalsResponse),
    enabled: clock !== '',
  });
  const relevant = (q.data?.signals ?? [])
    .filter((s) => (s.client?.exposedPct ?? 0) > 0)
    .slice(0, 4);
  return (
    <Panel
      title="Live market signals"
      right={<Link to={`/signals?client=${clientId}`}>All signals →</Link>}
    >
      {q.isPending && <p className="m-0 text-[12.5px] text-muted">Loading…</p>}
      {q.data && relevant.length === 0 && (
        <p className="m-0 text-[12.5px] text-muted">
          No signal before {fmtDate(clock)} reaches this client's holdings.
        </p>
      )}
      <ul className="m-0 list-none space-y-2 p-0">
        {relevant.map((s) => (
          <li key={s.id} className="text-[12.5px]">
            <div className="flex items-start gap-2">
              <Pill tone={SEVERITY_TONE[s.severity]}>{SEVERITY_SHORT[s.severity]}</Pill>
              <div>
                <Link
                  to={`/clients/${clientId}/impact?signals=${s.id}`}
                  className="font-medium text-ink no-underline hover:text-accent"
                >
                  {s.title}
                </Link>
                <div className="text-[11px] text-muted">
                  {ageLabel(s.ageDays)} · conf {s.confidence.overall}% ·{' '}
                  {s.client?.exposedPct.toFixed(1)}% of household exposed
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function RubricPanel({ clientId }: { clientId: string }): JSX.Element {
  const q = useQuery({
    queryKey: ['rubric', clientId],
    queryFn: async () => {
      try {
        return await getJson(`/api/v1/clients/${clientId}/rubric`, RubricAssessmentResponse);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return null;
        }
        throw e;
      }
    },
  });
  const r = q.data;
  return (
    <Panel
      title="Risk rubric"
      right={<Link to={`/clients/${clientId}/rubric`}>{r ? 'Open rubric →' : 'Assess →'}</Link>}
    >
      {q.isPending && <p className="m-0 text-[12.5px] text-muted">Loading…</p>}
      {r === null && (
        <p className="m-0 text-[12.5px] text-muted">
          Not yet scored. Capacity, Appetite and Horizon are computed from the customer vector by
          three assessors.
        </p>
      )}
      {r && (
        <div className="space-y-2 text-[12.5px]">
          <div className="grid grid-cols-3 gap-2">
            {r.dimensions.map((dim) => (
              <div
                key={dim.dimension}
                className="rounded border border-line px-2 py-1.5 text-center"
              >
                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                  {dim.dimension}
                </div>
                <div className="tnum font-serif text-[22px] font-semibold text-ink">
                  {dim.effectiveScore}
                  <span className="text-[12px] text-muted">/3</span>
                </div>
                <div className="text-[10.5px] text-muted">
                  {Math.round(dim.confidence.overall * 100)}% conf
                </div>
              </div>
            ))}
          </div>
          {r.mismatches.map((m) => (
            <div key={m.kind} className="flex items-start gap-2">
              <Pill tone={m.severity === 'critical' ? 'crit' : 'warn'}>Mismatch</Pill>
              <span className="text-ink-2">{m.message}</span>
            </div>
          ))}
          <div className="text-[11px] text-muted">
            {r.status === 'locked' ? 'Locked' : 'Draft'} · LLM assessor {r.llmMode} · scored{' '}
            {new Date(r.createdAt).toLocaleDateString('en-GB')}
          </div>
        </div>
      )}
    </Panel>
  );
}

function ActionQueuePanel({ clientId }: { clientId: string }): JSX.Element {
  const q = useCombinedRisk(clientId);
  const top = (q.data?.actions ?? []).filter((a) => !a.decision).slice(0, 3);
  return (
    <Panel
      title="RM action queue"
      right={<Link to={`/clients/${clientId}/actions`}>All actions →</Link>}
    >
      {q.isPending && <p className="m-0 text-[12.5px] text-muted">Ranking…</p>}
      {q.data && top.length === 0 && (
        <p className="m-0 text-[12.5px] text-muted">Nothing outstanding.</p>
      )}
      <ol className="m-0 list-none space-y-2 p-0">
        {top.map((a) => (
          <li key={a.id} className="text-[12.5px]">
            <div className="flex items-start gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink font-mono text-[10.5px] text-white">
                {a.rank}
              </span>
              <div>
                <Link
                  to={`/clients/${clientId}/actions`}
                  className="font-medium text-ink no-underline hover:text-accent"
                >
                  {a.title}
                </Link>
                <div className="text-[11px] text-muted">
                  <Pill
                    tone={a.urgency === 'now' ? 'crit' : a.urgency === 'week' ? 'warn' : 'neutral'}
                  >
                    {a.urgency === 'now' ? 'Now' : a.urgency === 'week' ? '7 days' : '30 days'}
                  </Pill>{' '}
                  {a.evidence.slice(0, 110)}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {q.data && (
        <div className="mt-2 text-[11px] text-muted">
          Matrix: {q.data.matrix.cell} · composite {q.data.gauge.composite}/10
        </div>
      )}
    </Panel>
  );
}
