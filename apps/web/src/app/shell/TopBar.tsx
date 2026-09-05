import type { JSX } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { HealthResponse, type HealthResponse as Health } from '@jb/contracts';
import { getJson } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ClockControl } from './ClockControl';

export function useHealth(): UseQueryResult<Health> {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => getJson('/health', HealthResponse),
    refetchInterval: 30_000,
  });
}

export function TopBar(): JSX.Element {
  const health = useHealth();
  const data = health.data;
  const tone =
    health.isError || !data?.database.reachable ? 'crit' : data.status === 'ok' ? 'ok' : 'warn';
  const label = health.isError
    ? 'API unreachable'
    : !data
      ? 'Connecting…'
      : !data.database.reachable
        ? 'Database unreachable'
        : data.database.lastLoadRun
          ? `Data loaded ${fmtDateTime(data.database.lastLoadRun.loadedAt)}`
          : 'Database empty — run db:seed';
  const dot = { ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit' }[tone];

  return (
    <header className="flex h-14 items-center gap-6 border-b border-line bg-surface px-8">
      <div className="text-[13px] text-muted">
        RM <span className="font-medium text-ink">Priscilla Ong</span>
        <span className="mx-2 text-line-2">·</span>
        <span className="font-mono text-[12px]">RM-SG-014</span>
      </div>
      <div className="ml-auto flex items-center gap-5 text-[12.5px] text-muted">
        <ClockControl />
        {data && (
          <div>
            Data to <span className="font-medium text-ink">{fmtDate(data.datasetToday)}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
          <span>{label}</span>
        </div>
      </div>
    </header>
  );
}
