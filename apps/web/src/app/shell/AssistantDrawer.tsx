import { useQueryClient } from '@tanstack/react-query';
import type { AnswerCard, AssistantResponse, Proposal } from '@jb/contracts';
import { useEffect, useRef, useState, type JSX } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Pill } from '@/components/Pill';
import { ask, confirm } from '@/features/assistant/assistantApi';
import { useBook } from '@/lib/book';
import { fmtDateTime } from '@/lib/format';
import { useAssistant, type Turn } from '@/state/assistant';
import { clientIdFromPath } from '@/state/clientContext';
import { useClockDate } from '@/state/clock';

const STARTERS_CLIENT = [
  'why is this client first?',
  'what happened since the baseline?',
  'what is the LTV?',
  'what did the Fed hold do here?',
  'what did he say last time?',
  'what should I do next?',
];
const STARTERS_BOOK = [
  'who should I call first today?',
  'which clients need action now?',
  'who has excluded holdings?',
  'who has not been contacted in 60 days?',
  'what are the latest market signals?',
  'compare the two most urgent clients',
];

/**
 * The conversation layer, on every screen. Language becomes an insight, a list, a navigation or a
 * proposed task. Answers carry their tool trace; tasks wait for a confirm. Works without an API key
 * through the grammar planner and the template writer; says which one answered.
 */
export function AssistantDrawer(): JSX.Element | null {
  const { open, turns, setOpen, push, update, clear } = useAssistant();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const clock = useClockDate();
  const book = useBook();
  const clientId = clientIdFromPath(pathname);
  const clientName = book.data?.clients.find((c) => c.clientId === clientId)?.name ?? null;
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [turns]);

  if (!open) {
    return null;
  }

  const send = (q: string): void => {
    const t = q.trim();
    if (!t || clock === '') {
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    push({ id, text: t, at: new Date().toISOString(), response: null, error: null, pending: true });
    setText('');
    ask({ text: t, ...(clientId ? { clientId } : {}), route: pathname }, clock)
      .then((response) => {
        update(id, { response, pending: false });
        if (response.navigate) {
          void navigate(response.navigate);
        }
      })
      .catch((e: unknown) => {
        update(id, { error: e instanceof Error ? e.message : String(e), pending: false });
      });
  };

  return (
    <aside
      aria-label="Assistant"
      className="flex h-full w-[440px] shrink-0 flex-col border-l border-line bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[15px] font-semibold text-ink">Ask the workbench</div>
          <div className="truncate text-[11.5px] text-muted">
            Scope:{' '}
            {clientId ? (
              <span className="text-ink">{clientName ?? clientId}</span>
            ) : (
              <span className="text-ink">the book</span>
            )}{' '}
            · answers from the engines · tasks wait for your confirm
          </div>
        </div>
        {turns.length > 0 && (
          <button type="button" onClick={clear} className="text-[11.5px] text-muted hover:text-ink">
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
          }}
          aria-label="Close assistant"
          className="rounded px-2 py-1 text-[13px] text-muted hover:bg-surface-2 hover:text-ink"
        >
          ✕ <span className="font-mono text-[10.5px]">⌘/</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="m-0 text-[13px] text-ink-2">
              Ask about {clientId ? 'this client' : 'a client'}, a group of clients, or the market
              signals. Say “show me …” to open a room, or say what to do and I will propose it.
            </p>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {(clientId ? STARTERS_CLIENT : STARTERS_BOOK).map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => {
                      send(s);
                    }}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-2 hover:bg-surface-2"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ol className="m-0 list-none space-y-4 p-0">
          {turns.map((t) => (
            <TurnView key={t.id} t={t} onAsk={send} />
          ))}
        </ol>
        <div ref={bottom} />
      </div>

      <form
        className="border-t border-line px-3 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <div className="flex items-center gap-2 rounded-md border border-line bg-ground px-2.5 py-1.5 focus-within:border-accent">
          <input
            ref={input}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            placeholder={
              clientId
                ? `Ask about ${clientName?.split(' ')[0] ?? 'this client'}, or the book…`
                : 'Ask about a client, the book, or the market…'
            }
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none"
            maxLength={600}
          />
          <button
            type="submit"
            disabled={text.trim() === ''}
            className="rounded bg-accent px-3 py-1 text-[12.5px] font-medium text-white disabled:bg-surface-2 disabled:text-muted"
          >
            Ask
          </button>
        </div>
        <div className="mt-1 text-[10.5px] text-muted">
          Facts come only from the workbench's engines. Nothing is written or sent without your
          confirm.
        </div>
      </form>
    </aside>
  );
}

function TurnView({ t, onAsk }: { t: Turn; onAsk: (q: string) => void }): JSX.Element {
  const r = t.response;
  return (
    <li>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="rounded-md bg-accent-soft px-3 py-1.5 text-[13px] text-ink">{t.text}</div>
        <span className="shrink-0 font-mono text-[10px] text-muted">
          {fmtDateTime(t.at).split(', ')[1] ?? ''}
        </span>
      </div>
      {t.pending && <div className="px-1 text-[12.5px] text-muted">Reading the engines…</div>}
      {t.error && (
        <div className="rounded border border-crit/30 bg-crit-soft px-3 py-2 text-[12.5px] text-crit">
          {t.error}
        </div>
      )}
      {r && <Answer r={r} onAsk={onAsk} />}
    </li>
  );
}

function Answer({ r, onAsk }: { r: AssistantResponse; onAsk: (q: string) => void }): JSX.Element {
  const [trace, setTrace] = useState(false);
  return (
    <div className="space-y-2 px-1">
      <p className="m-0 text-[13.5px] leading-relaxed text-ink">{r.answer}</p>
      {r.bullets.length > 0 && (
        <ul className="m-0 space-y-1 pl-4 text-[12.5px] text-ink-2">
          {r.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {r.cards.map((c) => (
        <Card key={c.title} c={c} />
      ))}
      {r.proposals.map((p) => (
        <ProposalCard key={p.id} p={p} />
      ))}
      {r.navigate && (
        <div className="text-[12px] text-muted">
          Opened <Link to={r.navigate}>{r.navigate}</Link>.
        </div>
      )}
      {r.warnings.map((w) => (
        <div
          key={w}
          className="rounded border border-warn/30 bg-warn-soft px-2.5 py-1.5 text-[11.5px] text-warn"
        >
          {w}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Pill tone={r.composer === 'claude' ? 'info' : 'neutral'}>
          {r.planner === 'claude' ? 'Claude planned' : 'grammar planned'} ·{' '}
          {r.composer === 'claude' ? 'Claude wrote' : 'template wrote'}
        </Pill>
        {r.scope.clientName && <span>scope {r.scope.clientName}</span>}
        <button
          type="button"
          onClick={() => {
            setTrace((v) => !v);
          }}
          className="text-accent"
        >
          {trace ? 'hide' : 'show'} tools ({r.trace.length})
        </button>
      </div>
      {trace && (
        <ul className="m-0 list-none space-y-0.5 rounded border border-line bg-surface-2 px-2.5 py-1.5 p-0 font-mono text-[10.5px] text-ink-2">
          {r.trace.map((c, i) => (
            <li key={`${c.tool}-${i}`}>
              <span className={c.ok ? 'text-ok' : 'text-crit'}>{c.ok ? '✓' : '✗'}</span> {c.tool}
              {Object.keys(c.args).length ? ` ${JSON.stringify(c.args)}` : ''} → {c.summary} ·{' '}
              {c.ms} ms
            </li>
          ))}
          {r.trace.length === 0 && <li>no tool needed</li>}
        </ul>
      )}
      {r.followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.followUps.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                onAsk(f);
              }}
              className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11.5px] text-ink-2 hover:bg-surface-2"
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ c }: { c: AnswerCard }): JSX.Element {
  return (
    <div className="overflow-x-auto rounded border border-line">
      <table className="w-full text-[12px]">
        <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.08em] text-muted">
          <tr>
            {c.columns.map((h, i) => (
              <th key={`${h}-${i}`} className="px-2 py-1 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {c.rows.map((row, i) => (
            <tr key={i} className="border-t border-line">
              {row.cells.map((cell, j) => (
                <td
                  key={j}
                  className={`px-2 py-1 align-top ${j === 0 ? 'text-ink' : 'text-ink-2'}`}
                >
                  {j === 0 && row.link ? (
                    <Link
                      to={row.link}
                      className="font-medium text-ink no-underline hover:text-accent"
                    >
                      {cell}
                    </Link>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProposalCard({ p }: { p: Proposal }): JSX.Element {
  const qc = useQueryClient();
  const [state, setState] = useState<{
    status: 'idle' | 'busy' | 'done' | 'error' | 'dismissed';
    note: string;
  }>({ status: 'idle', note: '' });
  const blocked =
    p.warning !== null &&
    !/will cover the open items|Blocked by a suitability rule/.test(p.warning);
  return (
    <div className="rounded-md border border-brass/50 bg-brass-soft/40 px-3 py-2 text-[12.5px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-ink">{p.title}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-muted">{p.effect}</div>
          {Object.keys(p.body).length > 0 && (
            <div className="mt-0.5 font-mono text-[10.5px] text-ink-2">
              {JSON.stringify(p.body)}
            </div>
          )}
          {p.warning && (
            <div className={`mt-1 text-[11.5px] ${blocked ? 'text-crit' : 'text-warn'}`}>
              {p.warning}
            </div>
          )}
        </div>
        {state.status === 'idle' || state.status === 'busy' ? (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              disabled={blocked || state.status === 'busy'}
              onClick={() => {
                setState({ status: 'busy', note: '' });
                confirm(p.id)
                  .then((r) => {
                    setState({ status: 'done', note: r.result });
                    void qc.invalidateQueries();
                  })
                  .catch((e: unknown) => {
                    setState({ status: 'error', note: e instanceof Error ? e.message : String(e) });
                  });
              }}
              className="rounded bg-brass px-2.5 py-1 text-[12px] font-semibold text-white disabled:bg-surface-2 disabled:text-muted"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => {
                setState({ status: 'dismissed', note: '' });
              }}
              className="rounded border border-line bg-surface px-2 py-1 text-[12px] text-ink-2"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <Pill
            tone={state.status === 'done' ? 'ok' : state.status === 'error' ? 'crit' : 'neutral'}
          >
            {state.status}
          </Pill>
        )}
      </div>
      {state.note && (
        <div className={`mt-1 text-[11.5px] ${state.status === 'error' ? 'text-crit' : 'text-ok'}`}>
          {state.note}
        </div>
      )}
    </div>
  );
}
