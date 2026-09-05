import { useQuery } from '@tanstack/react-query';
import { ExposureResponse, type ExposureBucket } from '@jb/contracts';
import type { JSX } from 'react';
import { useParams } from 'react-router-dom';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { fmtUsdCompact } from '@/lib/format';
import { SnapshotSelect, useSnapshotParam } from './PortfolioPage';

export function ExposureTab(): JSX.Element {
  const { clientId = '' } = useParams();
  const [snapshot, setSnapshot, snapshotOptions] = useSnapshotParam();
  const q = useQuery({
    queryKey: ['exposure', clientId, snapshot],
    queryFn: () =>
      getJson(`/api/v1/clients/${clientId}/exposure?snapshot=${snapshot}`, ExposureResponse),
  });
  if (q.isPending) {
    return <p className="text-muted">Loading…</p>;
  }
  if (q.isError) {
    return <div className="text-crit">{q.error.message}</div>;
  }
  const d = q.data;
  const breached = d.names.filter((n) => n.breached);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-[12.5px] text-muted">
        <SnapshotSelect value={snapshot} onChange={setSnapshot} options={snapshotOptions} />
        <span className="ml-auto">
          Household {fmtUsdCompact(d.totalUsd)} · {d.legs.length} structured-product legs looked
          through · {breached.length} name{breached.length === 1 ? '' : 's'} over limit
        </span>
      </div>

      <Panel
        title="Exposure by name, looked through"
        right="direct holdings plus what the notes reference"
      >
        <table className="w-full text-[12.5px]">
          <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
            <tr>
              <th className="py-1 text-left font-semibold">Exposure</th>
              <th className="py-1 text-right font-semibold">Direct</th>
              <th className="py-1 text-right font-semibold">Via notes</th>
              <th className="py-1 text-right font-semibold">Total</th>
              <th className="py-1 text-right font-semibold">% household</th>
              <th className="py-1 text-right font-semibold">Limit</th>
              <th className="py-1 text-left font-semibold">Sources</th>
            </tr>
          </thead>
          <tbody>
            {d.names.slice(0, 15).map((n) => (
              <tr key={n.exposureName} className="border-t border-line align-top">
                <td className="py-1.5 pr-2 font-medium text-ink">
                  {n.exposureName} {n.breached && <Pill tone="crit">over limit</Pill>}
                </td>
                <td className="tnum py-1.5 text-right font-mono">{fmtUsdCompact(n.directUsd)}</td>
                <td
                  className={`tnum py-1.5 text-right font-mono ${n.viaNotesUsd > 0 ? 'text-brass' : 'text-muted'}`}
                >
                  {n.viaNotesUsd > 0 ? fmtUsdCompact(n.viaNotesUsd) : '—'}
                </td>
                <td className="tnum py-1.5 text-right font-mono">{fmtUsdCompact(n.totalUsd)}</td>
                <td
                  className={`tnum py-1.5 text-right font-mono ${n.breached ? 'font-semibold text-crit' : ''}`}
                >
                  {n.totalPct.toFixed(1)}%
                </td>
                <td className="tnum py-1.5 text-right font-mono text-muted">
                  {n.limitPct === null ? '—' : `${n.limitPct}%`}
                </td>
                <td className="py-1.5 pl-3 text-[11px] text-muted">
                  {n.sources.map((s) => (
                    <div key={`${s.portfolioId}-${s.instrumentId}-${s.via}`}>
                      {s.portfolioId} · {s.name} · {fmtUsdCompact(s.usd)}{' '}
                      {s.via === 'note' && <span className="text-brass">via note</span>}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid grid-cols-2 gap-4">
        <Buckets title="By sector" rows={d.bySector} />
        <Buckets title="By region" rows={d.byRegion} />
        <Buckets title="By asset class" rows={d.byAssetClass} direct />
        <Buckets title="By currency" rows={d.byCurrency} direct />
      </div>

      {d.legs.length > 0 && (
        <Panel title="Structured product legs" right="what each note actually references">
          <table className="w-full text-[12px]">
            <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="py-1 text-left font-semibold">Note</th>
                <th className="py-1 text-left font-semibold">Leg</th>
                <th className="py-1 text-right font-semibold">Weight</th>
                <th className="py-1 text-right font-semibold">Exposure</th>
                <th className="py-1 text-left font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {d.legs.map((l) => (
                <tr key={`${l.instrumentId}-${l.leg}`} className="border-t border-line align-top">
                  <td className="py-1 pr-2 text-ink-2">
                    {l.instrumentName}{' '}
                    <span className="font-mono text-[10.5px] text-muted">
                      {fmtUsdCompact(l.noteUsd)}
                    </span>
                  </td>
                  <td className="py-1 pr-2 text-ink">
                    {l.leg}{' '}
                    <span className="text-[10.5px] text-muted">
                      {l.sector} · {l.region}
                    </span>
                  </td>
                  <td className="tnum py-1 text-right font-mono">{(l.weight * 100).toFixed(0)}%</td>
                  <td className="tnum py-1 text-right font-mono">{fmtUsdCompact(l.exposureUsd)}</td>
                  <td className="py-1 pl-3 text-[11px] text-muted">{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <details className="text-[12px] text-muted">
        <summary className="cursor-pointer">Assumptions</summary>
        <ul className="m-0 mt-1 list-disc pl-5">
          {d.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Buckets({
  title,
  rows,
  direct = false,
}: {
  title: string;
  rows: ExposureBucket[];
  direct?: boolean;
}): JSX.Element {
  const max = Math.max(...rows.map((r) => r.lookthroughPct), 1);
  return (
    <Panel title={title} right={direct ? 'direct classification' : 'looked through'}>
      <div className="space-y-1.5">
        {rows.slice(0, 10).map((r) => (
          <div
            key={r.key}
            className="grid grid-cols-[150px_1fr_120px] items-center gap-3 text-[12px]"
          >
            <span className="truncate text-ink-2" title={r.key}>
              {r.key}
            </span>
            <div className="relative h-2.5 rounded-sm bg-surface-2">
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-accent/70"
                style={{ width: `${(r.lookthroughPct / max) * 100}%` }}
              />
              {!direct && r.directPct !== r.lookthroughPct && (
                <div
                  className="absolute inset-y-0 left-0 rounded-sm bg-accent"
                  style={{ width: `${(r.directPct / max) * 100}%` }}
                  title={`direct ${r.directPct.toFixed(1)}%`}
                />
              )}
            </div>
            <span className="tnum text-right font-mono">
              {r.lookthroughPct.toFixed(1)}%
              {!direct && r.directPct !== r.lookthroughPct && (
                <span className="ml-1 text-[10.5px] text-muted">
                  ({r.directPct.toFixed(1)} direct)
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
