import type { JSX } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { HealthResponse, type HealthResponse as Health } from '@jb/contracts';
import { getJson } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useMeta } from '@/lib/meta';
import { useAuth } from '@/lib/auth';
import { useAssistant } from '@/state/assistant';
import { ClockControl } from './ClockControl';

export function useHealth(): UseQueryResult<Health> {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => getJson('/health', HealthResponse),
    refetchInterval: 30_000,
  });
}

export function TopBar({ onSwitch }: { onSwitch: () => void }): JSX.Element {
  const health = useHealth();
  const meta = useMeta();
  const user = useAuth((s) => s.user);
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
        <span className="font-medium text-ink">
          {user?.displayName ?? meta.data?.rm.name ?? '—'}
        </span>
        <span className="mx-2 text-line-2">·</span>
        <span className="font-mono text-[12px]">{user?.rmId ?? meta.data?.rm.id ?? ''}</span>
        {user && (
          <>
            <span className="mx-2 text-line-2">·</span>
            <span className="text-[11.5px]">
              sees{' '}
              {user.scope === 'own'
                ? 'own book'
                : user.scope === 'team'
                  ? 'the team'
                  : 'everything'}
              {meta.data ? ` (${meta.data.clientCount} clients)` : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                useAuth.getState().clear();
              }}
              className="ml-3 text-[11.5px] text-accent hover:underline"
            >
              Sign out
            </button>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-5 text-[12.5px] text-muted">
        <button
          type="button"
          onClick={() => {
            useAssistant.getState().toggle();
          }}
          className="rounded bg-ink px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent"
        >
          Ask <span className="ml-1 font-mono text-[11px] text-rail-muted">⌘/</span>
        </button>
        <button
          type="button"
          onClick={onSwitch}
          className="rounded border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-2 hover:bg-surface-2"
        >
          Switch client <span className="ml-1 font-mono text-[11px] text-muted">⌘K</span>
        </button>
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
