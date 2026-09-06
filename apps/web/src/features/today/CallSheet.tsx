import type { CallPlanEntry, CallPlanTerm } from '@jb/contracts';
import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '@/components/Panel';
import { Pill, type Tone } from '@/components/Pill';
import { fmtDate } from '@/lib/format';
import { useClockDate } from '@/state/clock';
import { useCallPlan, useDeferCall, useDoneCall } from './callPlanApi';

const TERM_LABEL: Record<CallPlanTerm['term'], string> = {
  harm: 'Harm',
  clock: 'Clock',
  convergence: 'Convergence',
  relationship: 'Relationship debt',
  damper: 'Recency damper',
};

function dueTone(dueBy: string, clock: string): Tone {
  return dueBy <= clock ? 'crit' : 'warn';
}

function dueLabel(dueBy: string, clock: string): string {
  if (dueBy < clock) {
    return `overdue since ${fmtDate(dueBy)}`;
  }
  if (dueBy === clock) {
    return 'by today';
  }
  return `by ${fmtDate(dueBy)}`;
}

/**
 * The call sheet: whom to call, by when, at what hour, through which channel, and why. One row per
 * conversation. Every priority opens into its five terms.
 */
export function CallSheet({ compact = false }: { compact?: boolean }): JSX.Element {
  const clock = useClockDate();
  const q = useCallPlan();
  const [showMethod, setShowMethod] = useState(false);
  const d = q.data;
  if (q.isPending) {
    return <Panel title="Call sheet">Planning the day…</Panel>;
  }
  if (q.isError) {
    return (
      <Panel title="Call sheet">
        <span className="text-crit">{q.error.message}</span>
      </Panel>
    );
  }
  if (!d) {
    return <Panel title="Call sheet">No plan.</Panel>;
  }
  const today = d.entries.filter(
    (e) => e.status === 'planned' && e.kind === 'call' && e.day === d.planDay,
  );
  const later = d.entries.filter(
    (e) => e.status === 'planned' && e.kind === 'call' && e.day !== d.planDay,
  );
  const schedule = d.entries.filter((e) => e.status === 'planned' && e.kind === 'schedule');
  const deferred = d.entries.filter((e) => e.status === 'deferred');
  const done = d.entries.filter((e) => e.status === 'done');
  const hours = Math.floor(d.capacity.minutesToday / 60);
  const mins = d.capacity.minutesToday % 60;

  return (
    <Panel
      title={`Call sheet · ${fmtDate(d.planDay)}`}
      right={
        <span className="flex items-center gap-3">
          <span>
            {today.length} call{today.length === 1 ? '' : 's'} of {d.capacity.conversationsPerDay} ·{' '}
            {hours > 0 ? `${hours} h ` : ''}
            {mins > 0 || hours === 0 ? `${mins} min` : ''} · times in {d.rmTimezone}
          </span>
          <button
            type="button"
            onClick={() => {
              setShowMethod((v) => !v);
            }}
            className="text-accent"
          >
            {showMethod ? 'Hide method' : 'How this is ranked'}
          </button>
          {d.policySource === 'defaults' && <Pill tone="warn">default policy</Pill>}
        </span>
      }
    >
      {showMethod && (
        <ol className="m-0 mb-3 space-y-1 rounded border border-line bg-surface-2 px-4 py-2 pl-8 text-[12px] text-ink-2">
          {d.method.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ol>
      )}
      <ol className="m-0 list-none divide-y divide-line p-0">
        {today.map((e, i) => (
          <Row key={e.clientId} e={e} n={i + 1} clock={clock} compact={compact} />
        ))}
        {today.length === 0 && (
          <li className="py-3 text-[13px] text-muted">Nothing to call today at this clock.</li>
        )}
      </ol>
      {!compact && later.length > 0 && (
        <Group title={`Next days · ${later.length}`}>
          {later.map((e) => (
            <Row key={e.clientId} e={e} n={null} clock={clock} compact />
          ))}
        </Group>
      )}
      {(schedule.length > 0 || deferred.length > 0 || done.length > 0) && (
        <div className="mt-3 space-y-1 border-t border-line pt-2 text-[12.5px] text-ink-2">
          {schedule.length > 0 && (
            <div>
              <span className="font-semibold text-ink">Schedule, not call:</span>{' '}
              {schedule.map((e, i) => (
                <span key={e.clientId}>
                  {i > 0 ? ' · ' : ''}
                  <Link to={e.link}>{e.clientName}</Link>,{' '}
                  {e.talkingPoints.at(-1)?.toLowerCase() ?? 'review'}
                </span>
              ))}
            </div>
          )}
          {deferred.length > 0 && (
            <div>
              <span className="font-semibold text-ink">Deferred by you:</span>{' '}
              {deferred.map((e, i) => (
                <span key={e.clientId}>
                  {i > 0 ? ' · ' : ''}
                  <Link to={e.link}>{e.clientName}</Link> to {fmtDate(e.day)}
                  {e.deferral?.reason ? `, “${e.deferral.reason}”` : ''}
                </span>
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div>
              <span className="font-semibold text-ink">Done today:</span>{' '}
              {done.map((e, i) => (
                <span key={e.clientId}>
                  {i > 0 ? ' · ' : ''}
                  <Link to={e.link}>{e.clientName}</Link>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t border-line pt-2">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="text-[12px] font-semibold text-ink-2"
      >
        {open ? '▾' : '▸'} {title}
      </button>
      {open && <ol className="m-0 list-none divide-y divide-line p-0">{children}</ol>}
    </div>
  );
}

function Row({
  e,
  n,
  clock,
  compact,
}: {
  e: CallPlanEntry;
  n: number | null;
  clock: string;
  compact: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [deferring, setDeferring] = useState(false);
  const why = e.talkingPoints.slice(0, compact ? 1 : 2).join(' · ');
  return (
    <li className="py-2.5">
      <div className="flex items-start gap-3">
        <span className="tnum w-5 shrink-0 pt-0.5 font-mono text-[12px] text-muted">{n ?? ''}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link to={e.link} className="font-medium text-ink no-underline hover:text-accent">
              {e.clientName}
            </Link>
            <Pill tone={dueTone(e.dueBy, clock)}>{dueLabel(e.dueBy, clock)}</Pill>
            {e.returnedEarly && <Pill tone="crit">returned early</Pill>}
            <span className="text-[12px] text-ink-2">
              {e.day !== clock ? `${fmtDate(e.day)} · ` : ''}
              {e.slot
                ? `${e.slot.rmStart}–${e.slot.rmEnd} · ${e.slot.note}`
                : 'no shared hours, write first'}{' '}
              · {e.channel} · {e.language}
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen((v) => !v);
              }}
              className="ml-auto"
              title="Why this priority"
            >
              <Pill tone="brass">priority {e.priority}</Pill>
            </button>
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-2">
            {why}
            {e.lastContact && (
              <span className="text-muted">
                {' '}
                · last spoken {e.lastContact.daysAgo} days ago (
                {e.lastContact.channel.toLowerCase()})
              </span>
            )}
          </div>
          {open && (
            <div className="mt-2 rounded border border-line bg-surface-2 px-3 py-2 text-[12px]">
              <table className="w-full">
                <tbody>
                  {e.terms.map((t) => (
                    <tr key={t.term} className="align-top">
                      <td className="w-[130px] py-0.5 pr-2 font-medium text-ink">
                        {TERM_LABEL[t.term]}
                      </td>
                      <td className="tnum w-[52px] py-0.5 pr-2 text-right font-mono">
                        {t.points > 0 ? '+' : ''}
                        {t.points}
                      </td>
                      <td className="py-0.5 text-ink-2">{t.detail}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line">
                    <td className="py-0.5 pr-2 font-semibold text-ink">Priority</td>
                    <td className="tnum py-0.5 pr-2 text-right font-mono font-semibold">
                      {e.priority}
                    </td>
                    <td className="py-0.5 text-ink-2">
                      Due {fmtDate(e.dueBy)}: {e.dueReason}.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {deferring && (
            <DeferForm
              clientId={e.clientId}
              clock={clock}
              onClose={() => {
                setDeferring(false);
              }}
            />
          )}
        </div>
        {!compact && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              to={e.link}
              className="rounded bg-accent px-2.5 py-1 text-[12px] font-medium text-white no-underline hover:bg-accent/90"
            >
              Open journey
            </Link>
            <DoneButton clientId={e.clientId} />
            <button
              type="button"
              onClick={() => {
                setDeferring((v) => !v);
              }}
              className="rounded border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:bg-surface-2"
            >
              Defer
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function DoneButton({ clientId }: { clientId: string }): JSX.Element {
  const m = useDoneCall();
  return (
    <button
      type="button"
      disabled={m.isPending}
      onClick={() => {
        m.mutate({ clientId });
      }}
      className="rounded border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:bg-surface-2"
      title="Mark the call done at this clock; logged as an audit event"
    >
      Done
    </button>
  );
}

function DeferForm({
  clientId,
  clock,
  onClose,
}: {
  clientId: string;
  clock: string;
  onClose: () => void;
}): JSX.Element {
  const m = useDeferCall();
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2 rounded border border-line bg-surface-2 px-3 py-2 text-[12px]"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ clientId, until, reason }, { onSuccess: onClose });
      }}
    >
      <label className="flex items-center gap-1">
        Defer to
        <input
          type="date"
          required
          min={clock}
          value={until}
          onChange={(e) => {
            setUntil(e.target.value);
          }}
          className="rounded border border-line bg-surface px-1.5 py-0.5"
        />
      </label>
      <input
        required
        minLength={5}
        maxLength={300}
        placeholder="Reason (logged)"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
        }}
        className="min-w-[240px] flex-1 rounded border border-line bg-surface px-2 py-0.5"
      />
      <button
        type="submit"
        disabled={m.isPending}
        className="rounded bg-ink px-2.5 py-1 font-medium text-white"
      >
        Defer
      </button>
      <button type="button" onClick={onClose} className="text-muted">
        Cancel
      </button>
      {m.isError && <span className="text-crit">{m.error.message}</span>}
    </form>
  );
}
