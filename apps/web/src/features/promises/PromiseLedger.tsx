import type { PromiseView } from '@jb/contracts';
import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/Pill';
import { fmtDate } from '@/lib/format';
import { useAddPromise, usePromises, useResolvePromise } from './promisesApi';

/** The promise ledger for one client or the book: who owes what, by when, from which sentence. */
export function PromiseLedger({
  clientId,
  compact = false,
  showClient = false,
}: {
  clientId: string | null;
  compact?: boolean;
  showClient?: boolean;
}): JSX.Element {
  const q = usePromises(clientId);
  const resolve = useResolvePromise();
  const [showResolved, setShowResolved] = useState(false);
  const [adding, setAdding] = useState(false);
  const rows = (q.data?.promises ?? []).filter((p) => showResolved || p.status === 'open');
  const open = (q.data?.promises ?? []).filter((p) => p.status === 'open');
  const overdue = open.filter((p) => (p.overdueDays ?? 0) > 0);

  return (
    <div className="rounded-md border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
          Promise ledger · {open.length} open{overdue.length ? ` · ${overdue.length} past due` : ''}
        </h3>
        <div className="flex items-center gap-3 text-[11.5px]">
          {q.data && q.data.extractedNow > 0 && (
            <Pill tone="brass">{q.data.extractedNow} newly extracted</Pill>
          )}
          <button
            type="button"
            onClick={() => {
              setShowResolved((v) => !v);
            }}
            className="text-muted hover:text-ink"
          >
            {showResolved ? 'hide resolved' : 'show resolved'}
          </button>
          {clientId && (
            <button
              type="button"
              onClick={() => {
                setAdding((v) => !v);
              }}
              className="text-accent"
            >
              {adding ? 'cancel' : '+ add'}
            </button>
          )}
        </div>
      </header>
      {adding && clientId && (
        <AddForm
          clientId={clientId}
          onDone={() => {
            setAdding(false);
          }}
        />
      )}
      {q.isPending && <p className="m-0 px-4 py-3 text-[12.5px] text-muted">Reading the notes…</p>}
      {q.data && rows.length === 0 && (
        <p className="m-0 px-4 py-3 text-[12.5px] text-muted">
          No {showResolved ? '' : 'open '}promise on record. Promises come from the notes, from
          calls logged in the companion, or by hand.
        </p>
      )}
      <ul className="m-0 list-none divide-y divide-line p-0">
        {rows.map((p) => (
          <Row
            key={p.id}
            p={p}
            compact={compact}
            showClient={showClient}
            onResolve={(status) => {
              resolve.mutate({ id: p.id, status });
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function Row({
  p,
  compact,
  showClient,
  onResolve,
}: {
  p: PromiseView;
  compact: boolean;
  showClient: boolean;
  onResolve: (s: 'done' | 'dropped') => void;
}): JSX.Element {
  const [quote, setQuote] = useState(false);
  const late = (p.overdueDays ?? 0) > 0 && p.status === 'open';
  return (
    <li className="px-4 py-2 text-[12.5px]">
      <div className="flex items-start gap-2">
        <Pill tone={p.kind === 'decision-debt' ? 'warn' : p.party === 'rm' ? 'info' : 'brass'}>
          {p.kind === 'decision-debt' ? 'decision debt' : p.party === 'rm' ? 'RM' : 'client'}
        </Pill>
        <div className="min-w-0 flex-1">
          <div className="text-ink">
            {showClient && (
              <Link
                to={`/clients/${p.clientId}#decided`}
                className="mr-1 font-medium no-underline hover:text-accent"
              >
                {p.clientName}:
              </Link>
            )}
            {p.text}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
            {p.dueDate ? (
              <span className={late ? 'font-semibold text-crit' : ''}>
                due {fmtDate(p.dueDate)}
                {late ? ` · ${p.overdueDays} days late` : ''}
              </span>
            ) : (
              <span>undated</span>
            )}
            <span>
              · from {p.sourceKind}
              {p.sourceDate ? ` ${fmtDate(p.sourceDate)}` : ''}
            </span>
            {p.status !== 'open' && (
              <Pill tone={p.status === 'done' ? 'ok' : 'neutral'}>{p.status}</Pill>
            )}
            {!compact && (
              <button
                type="button"
                onClick={() => {
                  setQuote((v) => !v);
                }}
                className="text-accent"
              >
                {quote ? 'hide quote' : 'quote'}
              </button>
            )}
          </div>
          {quote && (
            <blockquote className="m-0 mt-1 border-l-2 border-line pl-2 text-[12px] italic text-ink-2">
              “{p.quote}”
            </blockquote>
          )}
        </div>
        {p.status === 'open' && !compact && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => {
                onResolve('done');
              }}
              className="rounded border border-line px-2 py-0.5 text-[11.5px] text-ink-2 hover:bg-ok-soft hover:text-ok"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => {
                onResolve('dropped');
              }}
              className="rounded border border-line px-2 py-0.5 text-[11.5px] text-muted hover:bg-surface-2"
            >
              Drop
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function AddForm({ clientId, onDone }: { clientId: string; onDone: () => void }): JSX.Element {
  const m = useAddPromise(clientId);
  const [party, setParty] = useState<'rm' | 'client'>('rm');
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[12px]"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate(
          { party, text, kind: 'promise', ...(due ? { dueDate: due } : {}) },
          { onSuccess: onDone },
        );
      }}
    >
      <select
        value={party}
        onChange={(e) => {
          setParty(e.target.value as 'rm' | 'client');
        }}
        className="rounded border border-line bg-surface px-1.5 py-0.5"
      >
        <option value="rm">RM promises</option>
        <option value="client">Client promises</option>
      </select>
      <input
        required
        minLength={3}
        maxLength={300}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        placeholder="what, exactly"
        className="min-w-[240px] flex-1 rounded border border-line bg-surface px-2 py-0.5"
      />
      <input
        type="date"
        value={due}
        onChange={(e) => {
          setDue(e.target.value);
        }}
        className="rounded border border-line bg-surface px-1.5 py-0.5"
      />
      <button
        type="submit"
        disabled={m.isPending}
        className="rounded bg-ink px-2.5 py-1 font-medium text-white"
      >
        Add
      </button>
      {m.isError && <span className="text-crit">{m.error.message}</span>}
    </form>
  );
}
