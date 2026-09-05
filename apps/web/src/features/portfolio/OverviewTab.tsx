import { useQuery } from '@tanstack/react-query';
import {
  ChangeResponse,
  ClientOverviewResponse,
  MandateStatusResponse,
  type SnapshotDate,
} from '@jb/contracts';
import type { JSX } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CHART, EChart, usdCompact } from '@/components/EChart';
import { Kpi } from '@/components/Kpi';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { useMeta } from '@/lib/meta';
import { fmtUsdCompact } from '@/lib/format';

export function OverviewTab(): JSX.Element {
  const { clientId = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const meta = useMeta();
  const dates = meta.data?.snapshots.map((x) => x.date) ?? [];
  const current = meta.data?.current ?? '';
  const rawFrom = sp.get('from');
  const from: SnapshotDate =
    rawFrom && dates.includes(rawFrom) ? rawFrom : (meta.data?.baseline ?? '');
  const overview = useQuery({
    queryKey: ['overview', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/overview`, ClientOverviewResponse),
  });
  const mandate = useQuery({
    queryKey: ['mandate', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/mandate`, MandateStatusResponse),
  });
  const change = useQuery({
    queryKey: ['change', clientId, from, current],
    enabled: from !== '' && current !== '',
    queryFn: () =>
      getJson(`/api/v1/clients/${clientId}/change?from=${from}&to=${current}`, ChangeResponse),
  });

  if (overview.isPending || mandate.isPending || change.isPending) {
    return <p className="text-muted">Loading…</p>;
  }
  if (overview.isError || mandate.isError || change.isError) {
    return (
      <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
        Could not load the portfolio overview.
      </div>
    );
  }
  const d = overview.data;
  const c = change.data;

  const waterfall = buildWaterfall(c);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        <Kpi label="AUM" value={fmtUsdCompact(d.kpis.aumUsd)} sub="household, USD" />
        <Kpi
          label="Since 31 Dec"
          value={`${d.kpis.ytdChangePct > 0 ? '+' : ''}${d.kpis.ytdChangePct.toFixed(1)}%`}
          tone={d.kpis.ytdChangePct < 0 ? 'crit' : 'ok'}
          sub={fmtUsdCompact(d.kpis.aumUsd - d.kpis.aumBaselineUsd)}
        />
        <Kpi
          label="Unrealised P&L"
          value={d.kpis.unrealisedPnlUsd === null ? 'n/a' : fmtUsdCompact(d.kpis.unrealisedPnlUsd)}
          tone={
            d.kpis.unrealisedPnlUsd !== null && d.kpis.unrealisedPnlUsd < 0 ? 'crit' : undefined
          }
          sub={
            d.kpis.unrealisedPnlUsd === null ? 'cost basis missing on some lots' : 'vs cost basis'
          }
        />
        <Kpi
          label="Cash"
          value={fmtUsdCompact(d.kpis.cashUsd)}
          sub={`${d.kpis.cashPct.toFixed(1)}% of AUM`}
        />
        <Kpi
          label="Income yield"
          value={`${d.kpis.incomeYieldPct.toFixed(1)}% p.a.`}
          sub="annualised 2026 receipts"
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        <Panel
          title="What happened"
          right={
            <label className="flex items-center gap-2">
              from
              <select
                className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-[12px] text-ink"
                value={from}
                onChange={(e) => {
                  const next = new URLSearchParams(sp);
                  next.set('from', e.target.value);
                  setSp(next, { replace: true });
                }}
              >
                {dates.slice(0, -1).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              to {current}
            </label>
          }
        >
          <EChart option={waterfall} height={220} />
          <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
            <Effect label="Market (price)" v={c.priceEffectUsd} />
            <Effect label="Currency (FX)" v={c.fxEffectUsd} />
            <Effect label="Flows (buys, sells, calls)" v={c.flowEffectUsd} />
          </div>
          <details className="mt-2 text-[12px] text-muted">
            <summary className="cursor-pointer">Method</summary>
            <ul className="m-0 mt-1 list-disc pl-5">
              {c.method.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </details>
        </Panel>

        <Panel title="Top movers" right={`${c.from} → ${c.to}`}>
          <table className="w-full text-[12px]">
            <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="py-1 text-left font-semibold">Instrument</th>
                <th className="py-1 text-right font-semibold">Change</th>
                <th className="py-1 text-right font-semibold">Price</th>
                <th className="py-1 text-right font-semibold">FX</th>
                <th className="py-1 text-right font-semibold">Flow</th>
              </tr>
            </thead>
            <tbody>
              {c.movers.slice(0, 8).map((m) => (
                <tr key={m.instrumentId} className="border-t border-line">
                  <td className="py-1 pr-2 text-ink-2">
                    {m.name}
                    {m.pricePct !== null && (
                      <span className="ml-1 font-mono text-[10.5px] text-muted">
                        {m.pricePct > 0 ? '+' : ''}
                        {m.pricePct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <Num v={m.endUsd - m.startUsd} strong />
                  <Num v={m.priceEffectUsd} />
                  <Num v={m.fxEffectUsd} />
                  <Num v={m.flowEffectUsd} />
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        <Panel title="Allocation against mandate bands" right="managed portfolios only">
          <div className="space-y-4">
            {mandate.data.portfolios
              .filter((p) => p.managed)
              .map((p) => (
                <div key={p.portfolioId}>
                  <div className="mb-1 flex items-center justify-between text-[12.5px]">
                    <span className="font-medium text-ink">
                      {p.name}{' '}
                      <span className="font-mono text-[11px] text-muted">{p.mandateCode}</span>
                    </span>
                    <span className="text-muted">
                      max single position {p.maxSinglePositionPct}%
                      {p.singleLineBreaches.length > 0 && (
                        <Pill tone="crit">{p.singleLineBreaches.length} breach</Pill>
                      )}
                      {p.exclusionBreaches.length > 0 && (
                        <Pill tone="crit">{p.exclusionBreaches.length} excluded</Pill>
                      )}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {p.rows.map((r) => (
                      <BandRow key={r.assetClass} r={r} />
                    ))}
                  </div>
                </div>
              ))}
            {mandate.data.portfolios.some((p) => !p.managed) && (
              <p className="m-0 text-[11.5px] text-muted">
                Custody accounts (
                {mandate.data.portfolios
                  .filter((p) => !p.managed)
                  .map((p) => p.name)
                  .join(', ')}
                ) are not measured against a mandate but count in household exposure.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Liabilities and cash needs" right={<Link to="cashflows">Cash flows →</Link>}>
          <LiabilitiesSummary clientId={clientId} />
        </Panel>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled
          title="Iteration 3"
          className="rounded border border-line bg-surface px-3 py-1.5 text-[12.5px] text-muted"
        >
          Run stress test
        </button>
        <button
          type="button"
          disabled
          title="Iteration 3"
          className="rounded border border-line bg-surface px-3 py-1.5 text-[12.5px] text-muted"
        >
          Compare scenarios
        </button>
        <button
          type="button"
          disabled
          title="Iteration 7"
          className="rounded border border-line bg-surface px-3 py-1.5 text-[12.5px] text-muted"
        >
          Export report
        </button>
      </div>
    </div>
  );
}

function buildWaterfall(c: ChangeResponse) {
  const steps = [
    { name: 'Start', v: c.startUsd },
    { name: 'Price', v: c.priceEffectUsd },
    { name: 'FX', v: c.fxEffectUsd },
    { name: 'Flows', v: c.flowEffectUsd },
    { name: 'End', v: c.endUsd },
  ];
  let running = 0;
  const base: number[] = [];
  const pos: number[] = [];
  const neg: number[] = [];
  steps.forEach((s, i) => {
    if (i === 0 || i === steps.length - 1) {
      base.push(0);
      pos.push(s.v);
      neg.push(0);
      running = s.v;
    } else {
      if (s.v >= 0) {
        base.push(running);
        pos.push(s.v);
        neg.push(0);
      } else {
        base.push(running + s.v);
        pos.push(0);
        neg.push(-s.v);
      }
      running += s.v;
    }
  });
  const min = Math.min(c.startUsd, c.endUsd) * 0.9;
  return {
    grid: { left: 64, right: 12, top: 12, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      textStyle: { fontFamily: CHART.font },
      formatter: (params: { dataIndex: number }[]) => {
        const i = params[0]?.dataIndex ?? 0;
        const s = steps[i];
        return s ? `${s.name}: ${usdCompact(s.v)}` : '';
      },
    },
    xAxis: {
      type: 'category',
      data: steps.map((s) => s.name),
      axisLine: { lineStyle: { color: CHART.line } },
      axisLabel: { color: CHART.muted, fontFamily: CHART.font, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      min,
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
        type: 'bar',
        stack: 'w',
        data: base,
        itemStyle: { color: 'transparent' },
        emphasis: { itemStyle: { color: 'transparent' } },
        tooltip: { show: false },
      },
      {
        type: 'bar',
        stack: 'w',
        data: pos.map((v, i) => ({
          value: v,
          itemStyle: { color: i === 0 || i === steps.length - 1 ? CHART.accent : CHART.ok },
        })),
        barWidth: 38,
      },
      { type: 'bar', stack: 'w', data: neg, itemStyle: { color: CHART.crit }, barWidth: 38 },
    ],
  };
}

function Effect({ label, v }: { label: string; v: number }): JSX.Element {
  return (
    <div className="rounded bg-surface-2 px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={`tnum font-mono text-[13px] ${v < 0 ? 'text-crit' : 'text-ok'}`}>
        {v > 0 ? '+' : ''}
        {fmtUsdCompact(v)}
      </div>
    </div>
  );
}

function Num({ v, strong = false }: { v: number; strong?: boolean }): JSX.Element {
  return (
    <td
      className={`tnum py-1 text-right font-mono ${strong ? 'font-medium' : ''} ${v < 0 ? 'text-crit' : v > 0 ? 'text-ok' : 'text-muted'}`}
    >
      {v === 0 ? '—' : `${v > 0 ? '+' : ''}${fmtUsdCompact(v)}`}
    </td>
  );
}

function BandRow({
  r,
}: {
  r: MandateStatusResponse['portfolios'][number]['rows'][number];
}): JSX.Element {
  const scale = 100;
  const color = r.status === 'within' ? CHART.ok : CHART.crit;
  return (
    <div className="grid grid-cols-[150px_1fr_110px] items-center gap-3 text-[12px]">
      <span className="text-ink-2">{r.assetClass}</span>
      <div
        className="relative h-3 rounded-sm bg-surface-2"
        title={`band ${r.minPct}–${r.maxPct}%, target ${r.targetPct}%`}
      >
        <div
          className="absolute inset-y-0 rounded-sm bg-accent/15"
          style={{
            left: `${(r.minPct / scale) * 100}%`,
            width: `${((r.maxPct - r.minPct) / scale) * 100}%`,
          }}
        />
        <div
          className="absolute inset-y-0 w-px bg-accent/60"
          style={{ left: `${(r.targetPct / scale) * 100}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-sm"
          style={{
            left: `calc(${(Math.min(r.weightPct, 100) / scale) * 100}% - 2px)`,
            background: color,
          }}
        />
      </div>
      <span className="tnum text-right font-mono">
        <span className={r.status !== 'within' ? 'font-semibold text-crit' : 'text-ink'}>
          {r.weightPct.toFixed(1)}%
        </span>
        <span className="ml-1 text-[10.5px] text-muted">
          {r.minPct}–{r.maxPct}
        </span>
      </span>
    </div>
  );
}

function LiabilitiesSummary({ clientId }: { clientId: string }): JSX.Element {
  const q = useQuery({
    queryKey: ['cashflows', clientId],
    queryFn: () =>
      import('@jb/contracts').then((m) =>
        getJson(`/api/v1/clients/${clientId}/cashflows`, m.CashflowsResponse),
      ),
  });
  if (!q.data) {
    return <p className="m-0 text-[12px] text-muted">Loading…</p>;
  }
  const cf = q.data;
  return (
    <div className="space-y-2 text-[12.5px]">
      {cf.facilities.map((f) => (
        <div key={f.facilityId} className="flex items-center justify-between gap-2">
          <span className="text-ink-2">
            {f.type} · {f.currency} {f.drawn.toLocaleString('en-US', { maximumFractionDigits: 0 })}{' '}
            drawn
          </span>
          <Pill
            tone={
              f.marginCallLtvPct - f.ltvPct < 2
                ? 'crit'
                : f.marginCallLtvPct - f.ltvPct < 5
                  ? 'warn'
                  : 'ok'
            }
          >
            LTV {f.ltvPct.toFixed(1)}% / {f.marginCallLtvPct}%
          </Pill>
        </div>
      ))}
      {cf.needs.map((n) => (
        <div key={n.needId} className="flex items-center justify-between gap-2">
          <span className="text-ink-2">
            {n.description}{' '}
            <span className="font-mono text-[10.5px] text-muted">
              {n.currency} {n.amount.toLocaleString('en-US')}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="tnum font-mono text-[12px]">{fmtUsdCompact(n.amountUsd)}</span>
            <Pill
              tone={n.status === 'running' ? 'info' : n.status === 'upcoming' ? 'warn' : 'neutral'}
            >
              {n.status === 'running'
                ? 'Ongoing'
                : n.status === 'upcoming'
                  ? `Upcoming · ${n.daysUntil}d`
                  : 'Planned'}
            </Pill>
          </span>
        </div>
      ))}
      {cf.commitments.map((c) => (
        <div key={c.commitmentId} className="flex items-center justify-between gap-2">
          <span className="text-ink-2">
            {c.fundName} uncalled · {c.window}
          </span>
          <span className="tnum font-mono text-[12px]">{fmtUsdCompact(c.uncalledUsd)}</span>
        </div>
      ))}
      <div className="mt-1 border-t border-line pt-2 text-[12px]">
        Next 12 months:{' '}
        <span className="tnum font-mono">{fmtUsdCompact(cf.coverage12m.needsUsd)}</span> of
        confirmed and likely needs against{' '}
        <span className="tnum font-mono">{fmtUsdCompact(cf.coverage12m.dailyLiquidUsd)}</span>{' '}
        sellable daily
        {cf.coverage12m.ratio !== null && (
          <>
            {' '}
            · coverage{' '}
            <span
              className={`tnum font-mono ${cf.coverage12m.ratio < 1.5 ? 'font-semibold text-crit' : 'text-ok'}`}
            >
              {cf.coverage12m.ratio.toFixed(1)}x
            </span>
          </>
        )}
      </div>
    </div>
  );
}
