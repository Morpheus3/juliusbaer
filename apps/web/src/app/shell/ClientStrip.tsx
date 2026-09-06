import { useQuery } from '@tanstack/react-query';
import { ClientOverviewResponse, WorkflowResponse, type MatrixCell } from '@jb/contracts';
import type { JSX } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Pill, type Tone } from '@/components/Pill';
import { useCombinedRisk } from '@/features/risk/riskApi';
import { useCallPlan } from '@/features/today/callPlanApi';
import { getJson } from '@/lib/api';
import { useBook } from '@/lib/book';
import { fmtDate, fmtUsdCompact } from '@/lib/format';
import { useClockDate } from '@/state/clock';
import { clientIdFromPath } from '@/state/clientContext';

const CELL_TONE: Record<MatrixCell, Tone> = {
  URGENT: 'crit',
  'Act Now': 'crit',
  Discuss: 'warn',
  Review: 'info',
  Monitor: 'ok',
};

/**
 * Persistent client context under the top bar: who, where they stand, the next step. Composed on
 * the client from the same queries the rooms use, so it costs nothing extra on the pages that
 * already load them.
 */
export function ClientStrip({ onSwitch }: { onSwitch: () => void }): JSX.Element | null {
  const { pathname } = useLocation();
  const clientId = clientIdFromPath(pathname);
  if (clientId === null) {
    return null;
  }
  return <StripBody clientId={clientId} onSwitch={onSwitch} />;
}

function StripBody({
  clientId,
  onSwitch,
}: {
  clientId: string;
  onSwitch: () => void;
}): JSX.Element {
  const clock = useClockDate();
  const overview = useQuery({
    queryKey: ['overview', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/overview`, ClientOverviewResponse),
  });
  const risk = useCombinedRisk(clientId);
  const workflow = useQuery({
    queryKey: ['workflow', clientId, clock],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/workflow?clock=${clock}`, WorkflowResponse),
    enabled: clock !== '',
    staleTime: 30_000,
  });
  const book = useBook();
  const plan = useCallPlan();
  const call = plan.data?.entries.find((e) => e.clientId === clientId) ?? null;

  const c = overview.data?.client;
  const k = overview.data?.kpis;
  const row = book.data?.clients.find((x) => x.clientId === clientId);
  const rank = row && book.data ? book.data.clients.indexOf(row) + 1 : null;
  const cell = risk.data?.matrix.cell;
  const next = workflow.data?.steps.find((s) => s.status === 'current') ?? null;
  const allDone = workflow.data !== undefined && next === null;

  return (
    <div className="flex items-center gap-4 border-b border-line bg-rail px-8 py-2 text-rail-ink">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-rail-muted">
          <span className="font-serif text-[15px] font-semibold text-white">
            {c ? c.name : overview.isError ? 'Unknown client' : clientId}
          </span>
          <span className="font-mono text-[11.5px]">{clientId}</span>
          {c && (
            <>
              <span>· {c.bookingCentre}</span>
              <span>
                · {c.riskProfile} {c.riskToleranceScore}/10
              </span>
              {k && <span>· AUM {fmtUsdCompact(k.aumUsd)}</span>}
              <span>· {c.reportingLanguage}</span>
            </>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px]">
          {cell !== undefined && <Pill tone={CELL_TONE[cell]}>{cell}</Pill>}
          {rank !== null && row && (
            <span className="text-rail-muted">
              #{rank} of {book.data?.clients.length ?? '—'} in the book · urgency {row.urgencyScore}
            </span>
          )}
          {row?.topItem && <span className="truncate text-rail-ink">{row.topItem}</span>}
          {call && (
            <span className="text-rail-muted">
              ·{' '}
              {call.status === 'done'
                ? 'call done today'
                : call.status === 'deferred'
                  ? `deferred to ${fmtDate(call.day)}`
                  : `${call.kind === 'schedule' ? 'schedule' : 'call'} by ${call.dueBy <= clock ? 'today' : fmtDate(call.dueBy)}${call.slot ? ` · ${call.slot.rmStart}–${call.slot.rmEnd}` : ''} · ${call.channel} · ${call.language}`}
            </span>
          )}
          {!row && book.isPending && <span className="text-rail-muted">Ranking the book…</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {next && (
          <Link
            to={next.link}
            className="rounded bg-brass px-3 py-1.5 text-[12px] font-semibold text-white no-underline hover:bg-brass/90"
          >
            Next step {next.index} of {workflow.data?.steps.length ?? 9}: {next.title} →
          </Link>
        )}
        {allDone && <Pill tone="ok">All nine steps done</Pill>}
        <button
          type="button"
          onClick={onSwitch}
          className="rounded border border-rail-muted/50 px-2.5 py-1.5 text-[12px] text-rail-ink hover:bg-rail-2"
        >
          Switch client <span className="ml-1 font-mono text-[11px] text-rail-muted">⌘K</span>
        </button>
      </div>
    </div>
  );
}
