import { useQuery } from '@tanstack/react-query';
import { HoldingsResponse, type HoldingRowView } from '@jb/contracts';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router-dom';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';
import { SnapshotSelect, useSnapshotParam } from './PortfolioPage';

const LIQ_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'neutral'> = {
  Daily: 'ok',
  Weekly: 'ok',
  Monthly: 'warn',
  'Quarterly Gate': 'crit',
  Illiquid: 'crit',
};

export function HoldingsTab(): JSX.Element {
  const { clientId = 'CL-0002' } = useParams();
  const [snapshot, setSnapshot] = useSnapshotParam();
  const [portfolio, setPortfolio] = useState<string>('all');
  const q = useQuery({
    queryKey: ['holdings', clientId, snapshot],
    queryFn: () =>
      getJson(`/api/v1/clients/${clientId}/holdings?snapshot=${snapshot}`, HoldingsResponse),
  });
  if (q.isPending) {
    return <p className="text-muted">Loading…</p>;
  }
  if (q.isError) {
    return <div className="text-crit">{q.error.message}</div>;
  }
  const portfolios = [...new Set(q.data.rows.map((r) => r.portfolioId))].sort();
  const rows = q.data.rows.filter((r) => portfolio === 'all' || r.portfolioId === portfolio);
  const total = rows.reduce((s, r) => s + r.marketValueUsd, 0);
  const flagged = rows.filter((r) => r.concentration.breached).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-muted">
        <SnapshotSelect value={snapshot} onChange={setSnapshot} />
        <label className="flex items-center gap-2">
          Portfolio
          <select
            className="rounded border border-line bg-surface px-2 py-1 font-mono text-[12.5px] text-ink"
            value={portfolio}
            onChange={(e) => {
              setPortfolio(e.target.value);
            }}
          >
            <option value="all">Household (all)</option>
            {portfolios.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto">
          {rows.length} positions · {fmtUsdCompact(total)} · {flagged} concentration flag
          {flagged === 1 ? '' : 's'}
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface-2 text-[10.5px] uppercase tracking-[0.08em] text-muted">
            <tr>
              <Th>Asset</Th>
              <Th>Portfolio</Th>
              <Th r>Mkt val (USD)</Th>
              <Th r>Wt% pf</Th>
              <Th r>Wt% hh</Th>
              <Th r>Cost (base)</Th>
              <Th r>Return</Th>
              <Th>Liq.</Th>
              <Th>Conc.</Th>
              <Th>Acquired</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={`${r.portfolioId}-${r.instrumentId}`} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, r = false }: { children: React.ReactNode; r?: boolean }): JSX.Element {
  return (
    <th className={`px-3 py-2 font-semibold ${r ? 'text-right' : 'text-left'}`}>{children}</th>
  );
}

function Row({ r }: { r: HoldingRowView }): JSX.Element {
  return (
    <tr className="border-t border-line align-top hover:bg-surface-2/60">
      <td className="px-3 py-1.5">
        <div className="text-ink">
          {r.name}
          {r.sustainabilityExcluded && (
            <span className="ml-1">
              <Pill tone="warn">excluded</Pill>
            </span>
          )}
          {r.stale && (
            <span className="ml-1" title={`valued ${fmtDate(r.valuationDate)}`}>
              <Pill tone="neutral">stale mark</Pill>
            </span>
          )}
        </div>
        <div className="font-mono text-[10.5px] text-muted">
          {r.instrumentId} · {r.assetClass} · {r.subAssetClass} · {r.currency}
        </div>
      </td>
      <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-2">{r.portfolioId}</td>
      <td className="tnum px-3 py-1.5 text-right font-mono">{fmtUsdCompact(r.marketValueUsd)}</td>
      <td className="tnum px-3 py-1.5 text-right font-mono">{r.weightPct.toFixed(1)}</td>
      <td className="tnum px-3 py-1.5 text-right font-mono text-ink-2">
        {r.householdWeightPct.toFixed(1)}
      </td>
      <td className="tnum px-3 py-1.5 text-right font-mono text-ink-2">
        {r.costBasisBase === null ? (
          <span className="text-muted">n/a</span>
        ) : (
          r.costBasisBase.toLocaleString('en-US', { maximumFractionDigits: 0 })
        )}
      </td>
      <td
        className={`tnum px-3 py-1.5 text-right font-mono ${(r.unrealisedPnlPct ?? 0) < 0 ? 'text-crit' : 'text-ok'}`}
      >
        {r.unrealisedPnlPct === null ? (
          <span className="text-muted">n/a</span>
        ) : (
          `${r.unrealisedPnlPct > 0 ? '+' : ''}${r.unrealisedPnlPct.toFixed(1)}%`
        )}
      </td>
      <td className="px-3 py-1.5">
        <Pill tone={LIQ_TONE[r.liquidityTier] ?? 'neutral'}>{r.liquidityTier}</Pill>
      </td>
      <td className="px-3 py-1.5">
        {r.concentration.breached ? (
          <Pill tone="crit">
            FLAG {r.weightPct.toFixed(1)} &gt; {r.concentration.limitPct}
          </Pill>
        ) : r.concentration.applies ? (
          <Pill tone="ok">OK</Pill>
        ) : (
          <span className="text-[11px] text-muted">n/a</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-ink-2">{fmtDate(r.acquiredDate)}</td>
    </tr>
  );
}
