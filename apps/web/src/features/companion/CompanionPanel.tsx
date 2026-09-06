import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CashflowsResponse,
  EndCallResponse,
  GuardrailsResponse,
  PreviewPromisesResponse,
  type AssistantResponse,
  type PromiseCandidate,
} from '@jb/contracts';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Pill } from '@/components/Pill';
import { ask } from '@/features/assistant/assistantApi';
import { usePromises } from '@/features/promises/promisesApi';
import { useCombinedRisk } from '@/features/risk/riskApi';
import { getJson, postJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';
import { useClockDate } from '@/state/clock';

interface Cue {
  id: string;
  text: string;
  response: AssistantResponse | null;
  error: string | null;
  added: boolean;
}

interface SpeechLike {
  start(): void;
  stop(): void;
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
}

function speechRecognition(): (new () => SpeechLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechLike;
    webkitSpeechRecognition?: new () => SpeechLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * The in-call companion. Cues go to the assistant with the client fixed; answers arrive with
 * their tools. Guardrails come from the cross-border reference and the rubric. The note drafts
 * from the cues the RM adds; promises are extracted as candidates; ending the call logs it all.
 */
export function CompanionPanel({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string;
  clientName: string;
  onClose: () => void;
}): JSX.Element {
  const clock = useClockDate();
  const qc = useQueryClient();
  const guard = useQuery({
    queryKey: ['guardrails', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/guardrails`, GuardrailsResponse),
    staleTime: 300_000,
  });
  const cf = useQuery({
    queryKey: ['cashflows', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/cashflows`, CashflowsResponse),
  });
  const risk = useCombinedRisk(clientId);
  const promises = usePromises(clientId);
  const [started] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [cueText, setCueText] = useState('');
  const [cues, setCues] = useState<Cue[]>([]);
  const [note, setNote] = useState('');
  const [candidates, setCandidates] = useState<(PromiseCandidate & { keep: boolean })[]>([]);
  const [markDone, setMarkDone] = useState(true);
  const [draft, setDraft] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechLike | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => {
      clearInterval(t);
    };
  }, [started]);

  // Promise candidates follow the note, debounced.
  useEffect(() => {
    if (note.trim().length < 12) {
      setCandidates([]);
      return;
    }
    const h = setTimeout(() => {
      postJson(
        `/api/v1/clients/${clientId}/promises/preview?clock=${clock}`,
        { text: note },
        PreviewPromisesResponse,
      )
        .then((r) => {
          setCandidates((prev) =>
            r.candidates.map((c) => ({
              ...c,
              keep: prev.find((p) => p.quote === c.quote)?.keep ?? true,
            })),
          );
        })
        .catch(() => {
          /* preview is best effort */
        });
    }, 600);
    return () => {
      clearTimeout(h);
    };
  }, [note, clientId, clock]);

  const end = useMutation({
    mutationFn: () =>
      postJson(
        `/api/v1/clients/${clientId}/calls/end?clock=${clock}`,
        {
          note,
          cues: cues
            .filter((c) => c.response)
            .map((c) => ({ text: c.text, answer: c.response?.answer ?? '' })),
          promises: candidates
            .filter((c) => c.keep)
            .map((c) => ({ party: c.party, text: c.text, dueDate: c.dueDate, quote: c.quote })),
          markDone,
          draft,
          durationSeconds: elapsed,
        },
        EndCallResponse,
      ),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });

  const sendCue = (text: string): void => {
    const t = text.trim();
    if (!t) {
      return;
    }
    const id = `${Date.now()}`;
    setCues((c) => [...c, { id, text: t, response: null, error: null, added: false }]);
    setCueText('');
    ask({ text: t, clientId, route: 'companion' }, clock)
      .then((response) => {
        setCues((c) => c.map((x) => (x.id === id ? { ...x, response } : x)));
      })
      .catch((e: unknown) => {
        setCues((c) =>
          c.map((x) =>
            x.id === id ? { ...x, error: e instanceof Error ? e.message : String(e) } : x,
          ),
        );
      });
  };

  const toggleListen = (): void => {
    const Ctor = speechRecognition();
    if (!Ctor) {
      return;
    }
    if (listening) {
      rec.current?.stop();
      setListening(false);
      return;
    }
    const r = new Ctor();
    r.lang = 'en-US';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1]?.[0]?.transcript ?? '';
      if (last) {
        sendCue(last);
      }
    };
    r.onend = () => {
      setListening(false);
    };
    rec.current = r;
    r.start();
    setListening(true);
  };

  const g = guard.data;
  const nextNeed = useMemo(
    () =>
      cf.data?.needs
        .filter((n) => n.status !== 'running')
        .sort((a, b) => a.daysUntil - b.daysUntil)[0],
    [cf.data],
  );
  const topAction = risk.data?.actions[0];
  const topSignalReason = risk.data?.signalRisk.reasons[0];
  const openPromises = promises.data?.promises.filter((p) => p.status === 'open') ?? [];
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  if (end.data) {
    const r = end.data;
    return (
      <aside className="flex h-full flex-col rounded-md border border-ok/40 bg-surface">
        <div className="border-b border-line px-4 py-3 font-serif text-[16px] font-semibold text-ink">
          Call logged
        </div>
        <ul className="m-0 list-none space-y-1.5 px-4 py-3 text-[12.5px] text-ink-2">
          <li>
            Note and {cues.length} cue{cues.length === 1 ? '' : 's'} written to the audit trail.
          </li>
          <li>
            {r.promisesCreated} promise{r.promisesCreated === 1 ? '' : 's'} added to the ledger.
          </li>
          <li>{r.callDone ? 'Call marked done on the call sheet.' : 'Call not marked done.'}</li>
          {r.draft && (
            <li>
              Draft “{r.draft.subject}” ({r.draft.language}) waiting in the workflow.
            </li>
          )}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mx-4 mb-4 rounded bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white"
        >
          Close companion
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Call companion"
      className="flex max-h-[calc(100vh-180px)] flex-col rounded-md border border-brass/50 bg-surface"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line bg-brass-soft/50 px-4 py-2">
        <div>
          <div className="font-serif text-[15px] font-semibold text-ink">
            On the call · {clientName}
          </div>
          <div className="text-[11px] text-muted">
            <span className="tnum font-mono">
              {mm}:{ss}
            </span>
            {g ? ` · ${g.language} · ${g.residence} resident, ${g.bookingCentre} booking` : ''}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-[12px] text-muted hover:text-ink">
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {/* Guardrails */}
        <section className="rounded border border-line bg-surface-2 px-3 py-2 text-[12px]">
          <div className="mb-1 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            <span>Guardrails for this call</span>
            {g && (
              <Pill
                tone={
                  g.crossBorder.status === 'none'
                    ? 'ok'
                    : g.crossBorder.status === 'restricted'
                      ? 'warn'
                      : 'neutral'
                }
              >
                cross-border {g.crossBorder.status}
              </Pill>
            )}
          </div>
          {g && (
            <>
              <ul className="m-0 list-none space-y-0.5 p-0">
                {g.crossBorder.rules.map((r) => (
                  <li key={r.topic} className="flex gap-1.5">
                    <span className={r.allowed ? 'text-ok' : 'text-crit'}>
                      {r.allowed ? '✓' : '✗'}
                    </span>
                    <span>
                      <span className="font-medium text-ink">{r.topic}:</span>{' '}
                      <span className="text-ink-2">{r.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-ink-2">
                Suitability: {g.suitability.profile} {g.suitability.score}/10, horizon{' '}
                {g.suitability.horizonYears}y
                {g.suitability.rubric
                  ? ` · rubric C${g.suitability.rubric.capacity} A${g.suitability.rubric.appetite} H${g.suitability.rubric.horizon}`
                  : ' · no rubric yet'}
                {g.suitability.notes.map((n) => (
                  <div key={n} className="text-warn">
                    {n}
                  </div>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-muted">{g.notPermitted.join(' ')}</div>
              {g.sensitivities.length > 0 && (
                <div className="mt-1.5">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-crit">
                    Avoid · in their words
                  </div>
                  {g.sensitivities.slice(0, 3).map((s) => (
                    <div key={`${s.date}-${s.quote}`} className="text-ink-2">
                      <span className="font-mono text-[10px] text-muted">{fmtDate(s.date)}</span> “
                      {s.quote}”
                    </div>
                  ))}
                </div>
              )}
              {g.crossBorder.source === 'none' && (
                <div className="text-warn">No cross-border reference file loaded.</div>
              )}
            </>
          )}
        </section>

        {/* Ready cards */}
        <section className="grid grid-cols-2 gap-2 text-[12px]">
          {nextNeed && (
            <Card title="Next cash need">
              {fmtDate(nextNeed.dueFrom)} · {nextNeed.description} · {nextNeed.currency}{' '}
              {Math.round(nextNeed.amount).toLocaleString('en-US')}
            </Card>
          )}
          {topAction && <Card title="First action">{topAction.title}</Card>}
          {topSignalReason && <Card title="Signals">{topSignalReason}</Card>}
          <Card title={`Open promises · ${openPromises.length}`}>
            {openPromises.slice(0, 2).map((p) => (
              <div key={p.id}>
                {p.party === 'rm' ? 'RM: ' : 'Client: '}
                {p.text}
              </div>
            ))}
            {openPromises.length === 0 && 'None on record.'}
          </Card>
        </section>

        {/* Cues */}
        <section>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            Cues · answers in a second
          </div>
          <ul className="m-0 list-none space-y-2 p-0">
            {cues.map((c) => (
              <li key={c.id} className="rounded border border-line px-3 py-2 text-[12.5px]">
                <div className="italic text-ink-2">“{c.text}”</div>
                {!c.response && !c.error && <div className="text-muted">Reading the engines…</div>}
                {c.error && <div className="text-crit">{c.error}</div>}
                {c.response && (
                  <>
                    <div className="mt-1 text-ink">{c.response.answer}</div>
                    {c.response.bullets.slice(0, 3).map((b) => (
                      <div key={b} className="text-[12px] text-ink-2">
                        · {b}
                      </div>
                    ))}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                      <span>tools: {c.response.trace.map((t) => t.tool).join(', ') || 'none'}</span>
                      <button
                        type="button"
                        disabled={c.added}
                        onClick={() => {
                          setNote(
                            (n) => `${n}${n ? '\n' : ''}${c.text}: ${c.response?.answer ?? ''}`,
                          );
                          setCues((cs) =>
                            cs.map((x) => (x.id === c.id ? { ...x, added: true } : x)),
                          );
                        }}
                        className="text-accent disabled:text-muted"
                      >
                        {c.added ? 'added to note' : 'add to note'}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Note and promises */}
        <section>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            Note, drafting as you go
          </div>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            rows={5}
            placeholder="What was said, what was agreed. Promises are picked out below as you type."
            className="w-full rounded border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink"
          />
          {candidates.length > 0 && (
            <div className="mt-1 rounded border border-line bg-surface-2 px-3 py-2 text-[12px]">
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-2">
                Promises heard · confirm each
              </div>
              {candidates.map((c) => (
                <label key={c.quote} className="flex items-start gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={c.keep}
                    onChange={(e) => {
                      setCandidates((cs) =>
                        cs.map((x) => (x.quote === c.quote ? { ...x, keep: e.target.checked } : x)),
                      );
                    }}
                  />
                  <span>
                    <Pill
                      tone={
                        c.kind === 'decision-debt' ? 'warn' : c.party === 'rm' ? 'info' : 'brass'
                      }
                    >
                      {c.kind === 'decision-debt'
                        ? 'decision debt'
                        : c.party === 'rm'
                          ? 'RM'
                          : 'client'}
                    </Pill>{' '}
                    <span className="text-ink">{c.text}</span>
                    {c.dueDate && <span className="text-muted"> · due {fmtDate(c.dueDate)}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>
      </div>

      <form
        className="border-t border-line px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendCue(cueText);
        }}
      >
        <div className="flex items-center gap-1.5">
          <input
            ref={input}
            value={cueText}
            onChange={(e) => {
              setCueText(e.target.value);
            }}
            placeholder="Cue: “asking about selling the perpetual”"
            className="min-w-0 flex-1 rounded border border-line bg-ground px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent"
            maxLength={600}
          />
          {speechRecognition() && (
            <button
              type="button"
              onClick={toggleListen}
              title="Dictate a cue (browser speech recognition, nothing recorded server-side)"
              className={`rounded border px-2 py-1.5 text-[12px] ${listening ? 'border-crit bg-crit-soft text-crit' : 'border-line text-ink-2'}`}
            >
              {listening ? '● listening' : '🎙'}
            </button>
          )}
          <button
            type="submit"
            disabled={cueText.trim() === ''}
            className="rounded bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white disabled:bg-surface-2 disabled:text-muted"
          >
            Ask
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-ink-2">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={markDone}
              onChange={(e) => {
                setMarkDone(e.target.checked);
              }}
            />{' '}
            mark done on the sheet
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => {
                setDraft(e.target.checked);
              }}
            />{' '}
            draft follow-up{g ? ` (${g.language})` : ''}
          </label>
        </div>
        <button
          type="button"
          disabled={note.trim() === '' || end.isPending}
          onClick={() => {
            end.mutate();
          }}
          className="mt-2 w-full rounded bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:bg-surface-2 disabled:text-muted"
          title={
            note.trim() === '' ? 'Write a note first' : 'Log the call, the promises and the cues'
          }
        >
          End call → log the note, {candidates.filter((c) => c.keep).length} promise
          {candidates.filter((c) => c.keep).length === 1 ? '' : 's'} and {cues.length} cue
          {cues.length === 1 ? '' : 's'}
        </button>
        {end.isError && <div className="mt-1 text-[12px] text-crit">{end.error.message}</div>}
      </form>
    </aside>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded border border-line px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted">{title}</div>
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

export { fmtUsdCompact };
