import { useQuery } from '@tanstack/react-query';
import { BoardResponse } from '@jb/contracts';
import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { CHART, EChart } from '@/components/EChart';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { fmtUsdCompact } from '@/lib/format';
import { useMeta } from '@/lib/meta';

const SHORT: Record<string, string> = {
  'Cash and Equivalents': 'Cash',
  'Fixed Income': 'FI',
  Equity: 'Eq',
  Alternatives: 'Alt',
  Commodities: 'Cmdty',
  'Structured Products': 'SP',
};

/** Mandate governance and collateral across the whole book (RM view L2). */
export function BoardPage(): JSX.Element {
  const meta = useMeta();
  const [snapshot, setSnapshot] = useState<string>('');
  const snap = snapshot !== '' ? snapshot : (meta.data?.current ?? '');
  const q = useQuery({
    queryKey: ['board', snap],
    queryFn: () => getJson(`/api/v1/book/board?snapshot=${snap}`, BoardResponse),
    enabled: snap !== '',
  });
  const [onlyBreaches, setOnlyBreaches] = useState(false);
  const d = q.data;
  const rows = (d?.portfolios ?? []).filter((p) => !onlyBreaches || p.breachType !== 'none');
  return (
    <div className="max-w-[1600px]">
      <PageHeader
        eyebrow="RM view · L2"
        title="Mandate and collateral board"
        right={
          <>
            <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
              <input
                type="checkbox"
                checked={onlyBreaches}
                onChange={(e) => {
                  setOnlyBreaches(e.target.checked);
                }}
                className="accent-[#1f4e79]"
              />{' '}
              breaches only
            </label>
            <label className="flex items-center gap-2 text-[12.5px] text-muted">
              As of
              <select
                value={snap}
                onChange={(e) => {
                  setSnapshot(e.target.value);
                }}
                className="rounded border border-line bg-surface px-2 py-1 font-mono text-[12.5px] text-ink"
              >
                {meta.data?.snapshots.map((s) => (
                  <option key={s.date} value={s.date}>
                    {s.date}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />
      {q.isPending && <p className="text-muted">Loading…</p>}
      {q.isError && (
        <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {q.error.message}
        </div>
      )}
      {d && (
        <div className="space-y-4">
          <Panel
            title="Portfolios against their bands"
            right={`${rows.length} portfolios · cells show weight % · red outside band · arrows show trend since ${d.previousSnapshotDate ?? 'n/a'}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                  <tr>
                    <th className="py-1 text-left font-semibold">Portfolio</th>
                    <th className="py-1 text-left font-semibold">Mandate</th>
                    {d.assetClasses.map((ac) => (
                      <th key={ac} className="py-1 text-center font-semibold" title={ac}>
                        {SHORT[ac] ?? ac}
                      </th>
                    ))}
                    <th className="py-1 text-left font-semibold">Breach</th>
                    <th className="py-1 text-right font-semibold">AUM</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.portfolioId} className="border-t border-line align-top">
                      <td className="py-1.5 pr-2">
                        <Link
                          to={`/clients/${p.clientId}/portfolio`}
                          className="font-medium text-ink no-underline hover:text-accent"
                        >
                          {p.clientName}
                        </Link>
                        <div className="text-[10.5px] text-muted">
                          {p.name} <span className="font-mono">{p.portfolioId}</span>
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-ink-2">
                        {p.mandateCode}
                        {!p.managed && (
                          <div className="text-[10.5px] text-muted">custody · not measured</div>
                        )}
                      </td>
                      {d.assetClasses.map((ac) => {
                        const c = p.cells.find((x) => x.assetClass === ac);
                        if (!c) {
                          return (
                            <td key={ac} className="py-1.5 text-center text-muted">
                              —
                            </td>
                          );
                        }
                        const out = p.managed && c.status !== 'within';
                        return (
                          <td
                            key={ac}
                            className="py-1.5 text-center"
                            title={`band ${c.minPct}–${c.maxPct}% · ${c.status} ${c.deviationPts ? `(${c.deviationPts > 0 ? '+' : ''}${c.deviationPts} pts)` : ''} · ${c.trend}`}
                          >
                            <span
                              className={`tnum inline-block min-w-[52px] rounded px-1.5 py-0.5 font-mono ${out ? 'bg-crit-soft font-semibold text-crit' : p.managed ? 'bg-ok-soft/50 text-ink-2' : 'text-muted'}`}
                            >
                              {c.weightPct.toFixed(0)}%
                              {p.managed && c.trend !== 'flat' && (
                                <span
                                  className={`ml-0.5 ${c.trend === 'worsening' ? 'text-crit' : 'text-ok'}`}
                                >
                                  {c.trend === 'worsening' ? '↑' : '↓'}
                                </span>
                              )}
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-1.5 pl-2">
                        {p.breachType === 'none' ? (
                          <Pill tone="ok">within</Pill>
                        ) : (
                          <>
                            <Pill
                              tone={
                                p.breachType === 'drift'
                                  ? 'crit'
                                  : p.breachType === 'waived'
                                    ? 'neutral'
                                    : 'warn'
                              }
                            >
                              {p.breachType}
                            </Pill>
                            {p.singleLineBreaches > 0 && (
                              <span className="ml-1 text-[10.5px] text-muted">
                                {p.singleLineBreaches} single-line
                              </span>
                            )}
                            {p.exclusionBreaches > 0 && (
                              <span className="ml-1 text-[10.5px] text-crit">
                                {p.exclusionBreaches} excluded
                              </span>
                            )}
                            {p.breachNote && (
                              <div className="mt-0.5 max-w-[260px] text-[10.5px] text-muted">
                                {p.breachNote}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="tnum py-1.5 text-right font-mono">
                        {fmtUsdCompact(p.aumUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Collateral: loan-to-value against the margin-call trigger"
            right="tightest first"
          >
            <div className="grid grid-cols-5 gap-3">
              {d.facilities.map((f) => (
                <div
                  key={f.facilityId}
                  className={`rounded-md border px-3 py-2 ${f.headroomPts < 2 ? 'border-crit/40 bg-crit-soft/30' : f.headroomPts < 5 ? 'border-warn/40' : 'border-line'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        to={`/clients/${f.clientId}/portfolio/cashflows`}
                        className="text-[12.5px] font-medium text-ink no-underline hover:text-accent"
                      >
                        {f.clientName}
                      </Link>
                      <div className="font-mono text-[10.5px] text-muted">
                        {f.facilityId} · {f.currency}
                      </div>
                    </div>
                    <Pill tone={f.headroomPts < 2 ? 'crit' : f.headroomPts < 5 ? 'warn' : 'ok'}>
                      {f.ltvPct.toFixed(1)}% / {f.marginCallLtvPct}%
                    </Pill>
                  </div>
                  <EChart
                    height={80}
                    option={{
                      grid: { left: 4, right: 4, top: 8, bottom: 4 },
                      xAxis: {
                        type: 'category',
                        show: false,
                        data: f.series.map((s) => s.snapshotDate),
                      },
                      yAxis: {
                        type: 'value',
                        show: false,
                        min: (v: { min: number }) => Math.min(v.min, f.marginCallLtvPct) - 5,
                        max: (v: { max: number }) => Math.max(v.max, f.marginCallLtvPct) + 3,
                      },
                      tooltip: {
                        trigger: 'axis',
                        textStyle: { fontFamily: CHART.font, fontSize: 11 },
                        formatter: (p: { name: string; value: number }[]) =>
                          `${p[0]?.name ?? ''}: ${p[0]?.value ?? ''}%`,
                      },
                      series: [
                        {
                          type: 'line',
                          data: f.series.map((s) => s.ltvPct),
                          symbolSize: 5,
                          lineStyle: { color: CHART.accent, width: 2 },
                          itemStyle: { color: CHART.accent },
                          areaStyle: { color: 'rgba(31,78,121,0.08)' },
                          markLine: {
                            silent: true,
                            symbol: 'none',
                            lineStyle: { color: CHART.crit, type: 'dashed' },
                            label: { show: false },
                            data: [{ yAxis: f.marginCallLtvPct }],
                          },
                        },
                      ],
                    }}
                  />
                  <div className="text-[11px] text-muted">
                    {f.headroomPts.toFixed(1)} pts headroom ·{' '}
                    {f.breachedEver
                      ? f.curedBy === 'market'
                        ? 'breached earlier, cured by the market'
                        : f.curedBy === 'action'
                          ? 'breached earlier, cured by repayment'
                          : 'breached earlier, not cured'
                      : 'never breached'}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <details className="text-[12px] text-muted">
            <summary className="cursor-pointer">Method</summary>
            <ul className="m-0 mt-1 list-disc pl-5">
              {d.method.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
