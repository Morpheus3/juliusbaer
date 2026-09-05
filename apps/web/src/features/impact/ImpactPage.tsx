import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ImpactResponse,
  ImpactRunsResponse,
  ScenariosResponse,
  SignalsResponse,
  type ImpactLine,
  type ScenarioSeverity,
} from '@jb/contracts';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ClientPicker } from '@/components/ClientPicker';
import { CHART, EChart, usdCompact } from '@/components/EChart';
import { Kpi } from '@/components/Kpi';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { ApiError, getJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';
import { useClock } from '@/state/clock';
import { SEVERITY_SHORT, SEVERITY_TONE } from '../signals/signalFormat';

async function postJson<T>(url: string, body: unknown, parse: (v: unknown) => T): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof json === 'object' &&
      json !== null &&
      'message' in json &&
      typeof json.message === 'string'
        ? json.message
        : res.statusText;
    throw new ApiError(res.status, message);
  }
  return parse(json);
}

/** Signal impact analysis (Customer view L2). Wireframe slide 05. */
export function ImpactPage(): JSX.Element {
  const { clientId = 'CL-0002' } = useParams();
  const clock = useClock((s) => s.clock);
  const [sp, setSp] = useSearchParams();
  const initial = useMemo(() => (sp.get('signals') ?? '').split(',').filter(Boolean), [sp]);
  const [signalIds, setSignalIds] = useState<string[]>(initial);
  const [scenarioId, setScenarioId] = useState<string>(sp.get('scenario') ?? '');
  const [severity, setSeverity] = useState<ScenarioSeverity>('base');
  const [adding, setAdding] = useState(false);

  const signals = useQuery({
    queryKey: ['signals', clock, clientId],
    queryFn: () => getJson(`/api/v1/signals?clock=${clock}&clientId=${clientId}`, SignalsResponse),
  });
  const scenarios = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => getJson('/api/v1/scenarios', ScenariosResponse),
    staleTime: Infinity,
  });
  const runs = useQuery({
    queryKey: ['impact-runs', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/impact/runs`, ImpactRunsResponse),
  });

  const run = useMutation({
    mutationFn: (save: boolean) =>
      postJson(
        `/api/v1/clients/${clientId}/impact?clock=${clock}`,
        {
          signalIds,
          scenarioId: scenarioId || undefined,
          severity,
          save,
          label: save ? `${scenarioId || 'signals'} · ${severity}` : undefined,
        },
        (v) => ImpactResponse.parse(v),
      ),
    onSuccess: (_d, save) => {
      if (save) {
        void runs.refetch();
      }
    },
  });

  const canRun = signalIds.length > 0 || scenarioId !== '';
  const [autoRan, setAutoRan] = useState(false);
  useEffect(() => {
    const next = new URLSearchParams();
    if (signalIds.length) {
      next.set('signals', signalIds.join(','));
    }
    if (scenarioId) {
      next.set('scenario', scenarioId);
    }
    setSp(next, { replace: true });
  }, [signalIds, scenarioId, setSp]);

  useEffect(() => {
    // Run once on arrival when the URL already names signals or a scenario.
    if (!autoRan && canRun && signals.data) {
      setAutoRan(true);
      run.mutate(false);
    }
  }, [autoRan, canRun, signals.data, run]);

  const chosen = (signals.data?.signals ?? []).filter((s) => signalIds.includes(s.id));
  const scenario = scenarios.data?.scenarios.find((s) => s.id === scenarioId);

  return (
    <div className="max-w-[1500px]">
      <PageHeader
        eyebrow="Customer view · L2"
        title={
          <>
            <Link to={`/clients/${clientId}`} className="text-ink no-underline hover:text-accent">
              {clientId}
            </Link>
            <span className="mx-2 text-line-2">/</span>Signal impact analysis
          </>
        }
        right={
          <ClientPicker value={clientId} to={(id) => `/clients/${id}/impact?${sp.toString()}`} />
        }
      >
        <div className="mt-1 text-[12px] text-muted">
          Estimates are modelled, not guaranteed. For RM use only. Positions as of{' '}
          {signals.data ? fmtDate(signals.data.snapshotDate) : '…'}.
        </div>
      </PageHeader>

      <div className="mb-4 rounded-md border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted">Selected signals:</span>
          {chosen.map((s) => (
            <span
              key={s.id}
              className="flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5"
            >
              <Pill tone={SEVERITY_TONE[s.severity]}>{SEVERITY_SHORT[s.severity]}</Pill>
              <span className="text-ink">
                {s.title.length > 48 ? `${s.title.slice(0, 46)}…` : s.title}
              </span>
              <button
                type="button"
                aria-label={`Remove ${s.id}`}
                onClick={() => {
                  setSignalIds((ids) => ids.filter((x) => x !== s.id));
                }}
                className="ml-1 text-muted hover:text-crit"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setAdding((a) => !a);
            }}
            className="rounded-full border border-dashed border-line-2 px-2.5 py-0.5 text-ink-2 hover:bg-surface-2"
          >
            + Add signal
          </button>
          <span className="ml-auto flex items-center gap-2">
            <label className="text-muted">
              Scenario{' '}
              <select
                value={scenarioId}
                onChange={(e) => {
                  setScenarioId(e.target.value);
                }}
                className="rounded border border-line bg-surface px-2 py-1 text-[12.5px] text-ink"
              >
                <option value="">none (signals only)</option>
                {scenarios.data?.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex rounded border border-line">
              {(['mild', 'base', 'severe'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSeverity(s);
                  }}
                  className={`px-2.5 py-1 text-[12px] capitalize ${severity === s ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2'}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!canRun || run.isPending}
              onClick={() => {
                run.mutate(false);
              }}
              className="rounded bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white disabled:bg-surface-2 disabled:text-muted"
            >
              {run.isPending ? 'Running…' : 'Run impact'}
            </button>
          </span>
        </div>
        {adding && signals.data && (
          <div className="mt-3 max-h-48 overflow-y-auto rounded border border-line">
            {signals.data.signals.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12px] hover:bg-surface-2/60"
              >
                <input
                  type="checkbox"
                  checked={signalIds.includes(s.id)}
                  onChange={() => {
                    setSignalIds((ids) =>
                      ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id],
                    );
                  }}
                  className="accent-[#1f4e79]"
                />
                <Pill tone={SEVERITY_TONE[s.severity]}>{SEVERITY_SHORT[s.severity]}</Pill>
                <span className="text-ink-2">{s.title}</span>
                <span className="ml-auto font-mono text-[10.5px] text-muted">{s.date}</span>
              </label>
            ))}
          </div>
        )}
        {scenario && (
          <p className="mb-0 mt-2 text-[12px] text-ink-2">
            {scenario.description}{' '}
            <span className="text-muted">
              Horizon {scenario.horizonDays} days. {scenario.probabilityNote}
            </span>
          </p>
        )}
      </div>

      {run.isError && (
        <div className="mb-4 rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {run.error.message}
        </div>
      )}
      {!run.data && !run.isPending && !run.isError && (
        <div className="rounded-md border border-dashed border-line-2 px-4 py-10 text-center text-muted">
          Pick signals from the feed or a scenario, then run the impact.
        </div>
      )}
      {run.data && (
        <Result
          d={run.data}
          onSave={() => {
            run.mutate(true);
          }}
          saving={run.isPending}
        />
      )}

      {runs.data && runs.data.runs.length > 0 && (
        <Panel title="Saved scenarios" className="mt-4">
          <ul className="m-0 list-none divide-y divide-line p-0 text-[12.5px]">
            {runs.data.runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-ink-2">
                  {r.label ?? 'unnamed'}{' '}
                  <span className="font-mono text-[10.5px] text-muted">
                    {r.signalIds.join(', ')}
                    {r.scenarioId ? ` · ${r.scenarioId}` : ''} · as of {r.snapshotDate}
                  </span>
                </span>
                <span className={`tnum font-mono ${r.totalUsd < 0 ? 'text-crit' : 'text-ok'}`}>
                  {fmtUsdCompact(r.totalUsd)} ({r.totalPct.toFixed(2)}%)
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Result({
  d,
  onSave,
  saving,
}: {
  d: ImpactResponse;
  onSave: () => void;
  saving: boolean;
}): JSX.Element {
  const allFactors: [string, number][] = [
    ['Rates', d.by_factor.rates],
    ['Credit', d.by_factor.credit],
    ['Equity', d.by_factor.equity],
    ['FX', d.by_factor.fx],
    ['Commodity', d.by_factor.commodity],
  ];
  const factors = allFactors.filter(([, v]) => Math.abs(v) > 0.5);
  const steps: { name: string; v: number; kind: 'total' | 'delta' }[] = [
    { name: 'Current', v: d.start_usd, kind: 'total' },
    ...factors.map(([n, v]) => ({ name: n, v, kind: 'delta' as const })),
    { name: 'Stressed', v: d.stressed_usd, kind: 'total' },
  ];
  let running = d.start_usd;
  const base: number[] = [];
  const up: number[] = [];
  const down: number[] = [];
  steps.forEach((s) => {
    if (s.kind === 'total') {
      base.push(0);
      up.push(s.v);
      down.push(0);
      running = s.v;
    } else if (s.v >= 0) {
      base.push(running);
      up.push(s.v);
      down.push(0);
      running += s.v;
    } else {
      base.push(running + s.v);
      up.push(0);
      down.push(-s.v);
      running += s.v;
    }
  });
  const minY = Math.min(d.start_usd, d.stressed_usd) * 0.97;
  const waterfall = {
    grid: { left: 70, right: 12, top: 12, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      textStyle: { fontFamily: CHART.font },
      formatter: (p: { dataIndex: number }[]) => {
        const s = steps[p[0]?.dataIndex ?? 0];
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
      min: minY,
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
        barWidth: 40,
        data: up.map((v, i) => ({
          value: v,
          itemStyle: { color: steps[i]?.kind === 'total' ? CHART.accent : CHART.ok },
        })),
      },
      { type: 'bar', stack: 'w', barWidth: 40, data: down, itemStyle: { color: CHART.crit } },
    ],
  };
  const tone = d.total_usd < 0 ? 'crit' : 'ok';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        <Kpi
          label="Total estimated impact"
          value={`${d.total_usd > 0 ? '+' : ''}${fmtUsdCompact(d.total_usd)}`}
          tone={tone}
          sub={`${d.total_pct > 0 ? '+' : ''}${d.total_pct.toFixed(2)}% of ${fmtUsdCompact(d.start_usd)}`}
        />
        <Kpi
          label="Confidence"
          value={`${Math.round(d.confidence.point * 100)}%`}
          sub={`range ${fmtUsdCompact(d.confidence.low_usd)} to ${fmtUsdCompact(d.confidence.high_usd)}`}
        />
        <Kpi
          label="Modelled coverage"
          value={`${d.coverage.modelled_pct_of_aum.toFixed(0)}%`}
          sub={`${fmtUsdCompact(d.coverage.unmodelled_usd)} carried flat (private marks)`}
        />
        <Kpi
          label="Collateral"
          value={collateralLabel(d)}
          tone={
            d.collateral.some((c) => c.breached_after)
              ? 'crit'
              : d.collateral.length
                ? 'warn'
                : undefined
          }
          sub={
            d.collateral[0]
              ? `from ${d.collateral[0].ltv_before_pct.toFixed(1)}% · trigger ${d.collateral[0].margin_call_ltv_pct}%`
              : 'not applicable'
          }
        />
        <Kpi
          label="12m liquidity coverage"
          value={
            d.liquidity.coverage_after === null
              ? 'n/a'
              : `${d.liquidity.coverage_after.toFixed(1)}x`
          }
          tone={
            d.liquidity.coverage_after !== null && d.liquidity.coverage_after < 1.5
              ? 'crit'
              : undefined
          }
          sub={
            d.liquidity.coverage_before === null
              ? 'no dated needs'
              : `from ${d.liquidity.coverage_before.toFixed(1)}x · severity ${d.severity}`
          }
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        <Panel title="Portfolio stress waterfall" right={`by factor · ${d.severity} case`}>
          <EChart option={waterfall} height={250} />
        </Panel>
        <Panel title="Asset class impact">
          <ul className="m-0 list-none space-y-1.5 p-0 text-[12.5px]">
            {d.by_asset_class.map((a) => {
              const max = Math.max(...d.by_asset_class.map((x) => Math.abs(x.impact_usd)), 1);
              return (
                <li
                  key={a.asset_class}
                  className="grid grid-cols-[150px_1fr_120px] items-center gap-3"
                >
                  <span className="text-ink-2">{a.asset_class}</span>
                  <div className="relative h-2.5 rounded-sm bg-surface-2">
                    <div
                      className="absolute inset-y-0 rounded-sm"
                      style={{
                        left:
                          a.impact_usd < 0 ? `${50 - (Math.abs(a.impact_usd) / max) * 50}%` : '50%',
                        width: `${(Math.abs(a.impact_usd) / max) * 50}%`,
                        background: a.impact_usd < 0 ? CHART.crit : CHART.ok,
                      }}
                    />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
                  </div>
                  <span
                    className={`tnum text-right font-mono ${a.impact_usd < 0 ? 'text-crit' : 'text-ok'}`}
                  >
                    {a.impact_usd > 0 ? '+' : ''}
                    {fmtUsdCompact(a.impact_usd)}{' '}
                    <span className="text-[10.5px] text-muted">{a.impact_pct.toFixed(1)}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        <Panel title="Top impacted holdings" right="worst first">
          <table className="w-full text-[12px]">
            <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="py-1 text-left font-semibold">Holding</th>
                <th className="py-1 text-right font-semibold">Value</th>
                <th className="py-1 text-right font-semibold">Impact</th>
                <th className="py-1 text-right font-semibold">%</th>
                <th className="py-1 text-left font-semibold">Model</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.slice(0, 10).map((l) => (
                <LineRow key={`${l.portfolio_id}-${l.instrument_id}`} l={l} />
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="space-y-4">
          {d.collateral.length > 0 && (
            <Panel title="Collateral after shock">
              {d.collateral.map((c) => (
                <div key={c.facility_id} className="text-[12.5px] text-ink-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px]">{c.facility_id}</span>
                    <Pill
                      tone={
                        c.breached_after
                          ? 'crit'
                          : c.margin_call_ltv_pct - c.ltv_after_pct < 2
                            ? 'warn'
                            : 'ok'
                      }
                    >
                      LTV {c.ltv_before_pct.toFixed(1)}% → {c.ltv_after_pct.toFixed(1)}%
                    </Pill>
                  </div>
                  <div className="mt-1">
                    Lending value{' '}
                    {c.lending_value_before.toLocaleString('en-US', { maximumFractionDigits: 0 })} →{' '}
                    {c.lending_value_after.toLocaleString('en-US', { maximumFractionDigits: 0 })}{' '}
                    (facility ccy).
                    {c.breached_after && (
                      <span className="text-crit">
                        {' '}
                        Shortfall to cure:{' '}
                        {c.shortfall_ccy.toLocaleString('en-US', { maximumFractionDigits: 0 })}.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </Panel>
          )}
          <Panel title="Assumptions">
            <ul className="m-0 list-disc space-y-1 pl-4 text-[11.5px] text-ink-2">
              {d.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
              {d.confidence.notes.map((n) => (
                <li key={n} className="text-muted">
                  {n}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled
          title="Iteration 7"
          className="rounded border border-line bg-surface px-3 py-1.5 text-[12.5px] text-muted"
        >
          Draft client outreach
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded border border-accent bg-surface px-3 py-1.5 text-[12.5px] text-accent hover:bg-accent-soft disabled:text-muted"
        >
          Save scenario
        </button>
        <button
          type="button"
          disabled
          title="Iteration 7"
          className="rounded border border-line bg-surface px-3 py-1.5 text-[12.5px] text-muted"
        >
          Discuss with CIO
        </button>
      </div>
    </div>
  );
}

function collateralLabel(d: ImpactResponse): string {
  const first = d.collateral[0];
  if (!first) {
    return 'no facility';
  }
  if (d.collateral.some((c) => c.breached_after)) {
    return 'MARGIN CALL';
  }
  return `LTV ${first.ltv_after_pct.toFixed(1)}%`;
}

function LineRow({ l }: { l: ImpactLine }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-line align-top">
        <td className="py-1 pr-2 text-ink-2">
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
            }}
            className="m-0 border-0 bg-transparent p-0 text-left text-ink-2 hover:text-accent"
          >
            {l.name}
          </button>
          <div className="font-mono text-[10.5px] text-muted">
            {l.portfolio_id} · {l.asset_class} · {l.currency}
          </div>
        </td>
        <td className="tnum py-1 text-right font-mono">{fmtUsdCompact(l.mv_usd)}</td>
        <td
          className={`tnum py-1 text-right font-mono ${l.total_usd < 0 ? 'text-crit' : l.total_usd > 0 ? 'text-ok' : 'text-muted'}`}
        >
          {l.total_usd === 0 ? '—' : `${l.total_usd > 0 ? '+' : ''}${fmtUsdCompact(l.total_usd)}`}
        </td>
        <td className="tnum py-1 text-right font-mono text-ink-2">{l.total_pct.toFixed(1)}</td>
        <td className="py-1 pl-3 text-[11px] text-muted">{l.model}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-surface-2 px-3 py-2 font-mono text-[10.5px] text-ink-2">
            rates {l.rates_usd} · credit {l.credit_usd} · equity {l.equity_usd} · fx {l.fx_usd} ·
            commodity {l.commodity_usd} · parameters {JSON.stringify(l.parameters)}
          </td>
        </tr>
      )}
    </>
  );
}
