import { useQuery } from '@tanstack/react-query';
import {
  AuditResponse,
  SignalsResponse,
  type BookResponse,
  type CallPlanResponse,
  type Signal,
} from '@jb/contracts';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useMeta } from '@/lib/meta';
import { useClockDate } from '@/state/clock';
import { useCallPlan } from './callPlanApi';

/** The four sentences of the morning brief, composed from computed facts. Templates; Claude may rewrite later, never add a fact. */
export function briefSentences(
  book: BookResponse,
  plan: CallPlanResponse | null,
  signals: Signal[],
  rmName: string | null,
): string[] {
  const out: string[] = [];
  const k = book.kpis;
  out.push(
    `${rmName ? `${rmName}, ` : ''}${k.clients} clients hold ${fmtMoney(k.aumUsd)}, ${k.ytdChangePct > 0 ? '+' : ''}${k.ytdChangePct.toFixed(1)}% since the baseline; ${k.items.now} item${k.items.now === 1 ? '' : 's'} need${k.items.now === 1 ? 's' : ''} action now, ${k.items.week} this week, ${k.items.month} this month.`,
  );
  const escalated = book.items.filter((i) => i.momentum === 'escalated');
  const fresh = book.items.filter((i) => i.momentum === 'new');
  if (escalated.length > 0 || fresh.length > 0) {
    const first = escalated[0] ?? fresh[0];
    out.push(
      `Since ${book.previousSnapshotDate ? fmtDate(book.previousSnapshotDate) : 'the last snapshot'}, ${escalated.length} item${escalated.length === 1 ? '' : 's'} moved up a lane and ${fresh.length} appeared${first ? `, among them ${first.clientName}: ${first.title}` : ''}.`,
    );
  } else {
    out.push('Nothing moved lanes since the last snapshot.');
  }
  const recent = signals
    .filter((s) => s.ageDays <= 30 && (s.severity === 'SEVERE' || s.severity === 'HIGH'))
    .sort((a, b) => a.ageDays - b.ageDays);
  const top = recent[0];
  if (top) {
    out.push(
      `${recent.length} high or severe signal${recent.length === 1 ? '' : 's'} in the last thirty days; the freshest, ${top.title} (${fmtDate(top.date)}), reaches ${top.affectedAssetClasses.join(', ') || 'no asset class'}.`,
    );
  }
  if (plan) {
    const calls = plan.entries.filter(
      (e) => e.status === 'planned' && e.kind === 'call' && e.day === plan.planDay,
    );
    const first = calls[0];
    if (first) {
      out.push(
        `Call ${first.clientName} first${first.slot ? `, ${first.slot.rmStart}–${first.slot.rmEnd}` : ''}: ${first.talkingPoints[0] ?? 'open items'}. ${calls.length - 1 > 0 ? `${calls.length - 1} more call${calls.length - 1 === 1 ? '' : 's'} fit today.` : ''}`.trim(),
      );
    } else {
      out.push('No call is due today at this clock.');
    }
  }
  return out;
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fmtMoney = (n: number): string => money.format(n);

/** The morning note: four sentences and what was recently decided. */
export function Brief({ book }: { book: BookResponse }): JSX.Element {
  const clock = useClockDate();
  const meta = useMeta();
  const plan = useCallPlan();
  const signals = useQuery({
    queryKey: ['signals', clock, ''],
    queryFn: () => getJson(`/api/v1/signals?clock=${clock}`, SignalsResponse),
    enabled: clock !== '',
    staleTime: 60_000,
  });
  const audit = useQuery({
    queryKey: ['audit', 'all'],
    queryFn: () => getJson('/api/v1/audit', AuditResponse),
    staleTime: 30_000,
  });
  const sentences = briefSentences(
    book,
    plan.data ?? null,
    signals.data?.signals ?? [],
    meta.data?.rm.name.split(' ')[0] ?? null,
  );
  const recent = [...(audit.data?.events ?? [])]
    .filter((e) => e.actor !== 'system')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6);

  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
      <div className="rounded-md border-l-[3px] border-brass bg-brass-soft/60 px-5 py-4">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass">
          The morning brief · {fmtDate(clock)}
          <Pill tone="brass">template · facts from the book, the signals and the call plan</Pill>
        </div>
        <p className="m-0 font-serif text-[17px] leading-relaxed text-ink">{sentences.join(' ')}</p>
      </div>
      <div className="rounded-md border border-line bg-surface px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
          <span>Recently decided</span>
          <Link to="/audit" className="font-normal normal-case tracking-normal">
            Audit trail →
          </Link>
        </div>
        <ul className="m-0 list-none space-y-1.5 p-0 text-[12px]">
          {recent.map((e) => (
            <li key={e.id} className="flex items-start gap-2">
              <span className="tnum shrink-0 font-mono text-[10.5px] text-muted">
                {fmtDateTime(e.createdAt)}
              </span>
              <span className="min-w-0 truncate text-ink-2">
                {e.clientId ? (
                  <Link
                    to={`/clients/${e.clientId}#decided`}
                    className="text-ink no-underline hover:text-accent"
                  >
                    {e.summary}
                  </Link>
                ) : (
                  e.summary
                )}
              </span>
            </li>
          ))}
          {audit.data && recent.length === 0 && (
            <li className="text-muted">Nothing decided yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
