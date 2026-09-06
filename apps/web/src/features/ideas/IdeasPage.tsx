import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IdeasResponse, OutreachDraft, SignalsResponse, type IdeaMatch } from '@jb/contracts';
import { useState, type JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { SuitabilityBadge } from '@/features/risk/SuitabilityBadge';
import { getJson, postJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';
import { useClockDate } from '@/state/clock';

const KIND_LABEL = {
  lending: 'Lending',
  mandate: 'Discretionary mandate',
  succession: 'Succession',
  'next-generation': 'Next generation',
  deployment: 'Decision debt',
} as const;

/** The idea desk: an idea or a signal in, the clients it fits out, gated; opportunities on the side. */
export function IdeasPage(): JSX.Element {
  const clock = useClockDate();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const signalId = sp.get('signal') ?? '';
  const [text, setText] = useState(q);
  const [showMethod, setShowMethod] = useState(false);
  const feed = useQuery({
    queryKey: ['signals', clock, ''],
    queryFn: () => getJson(`/api/v1/signals?clock=${clock}`, SignalsResponse),
    enabled: clock !== '',
    staleTime: 60_000,
  });
  const ideas = useQuery({
    queryKey: ['ideas', clock, q, signalId],
    queryFn: () =>
      getJson(
        `/api/v1/ideas?clock=${clock}${q ? `&q=${encodeURIComponent(q)}` : ''}${signalId ? `&signalId=${encodeURIComponent(signalId)}` : ''}`,
        IdeasResponse,
      ),
    enabled: clock !== '',
    placeholderData: (p) => p,
  });
  const d = ideas.data;
  const notable = (feed.data?.signals ?? [])
    .filter((s) => s.severity === 'HIGH' || s.severity === 'SEVERE')
    .slice(0, 12);

  const submit = (): void => {
    const next = new URLSearchParams(sp);
    if (text.trim()) {
      next.set('q', text.trim());
    } else {
      next.delete('q');
    }
    setSp(next, { replace: true });
  };

  return (
    <div className="max-w-[1500px]">
      <PageHeader
        eyebrow="RM view · L1 / L2"
        title="Idea desk"
        right={d && <span className="text-[12.5px] text-muted">clock {fmtDate(d.clock)}</span>}
      >
        <p className="mb-0 mt-1 text-[12.5px] text-muted">
          Ideas find their own clients: the trade-idea rules run across the book, gated by
          suitability. Blocked clients are shown so you know why not.
        </p>
      </PageHeader>

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          placeholder="Ask the book: “short-duration credit after the Fed hold”, “trim concentration”, “raise cash”…"
          className="min-w-[380px] flex-1 rounded-md border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent"
        />
        <select
          value={signalId}
          onChange={(e) => {
            const next = new URLSearchParams(sp);
            if (e.target.value) {
              next.set('signal', e.target.value);
            } else {
              next.delete('signal');
            }
            setSp(next, { replace: true });
          }}
          className="rounded-md border border-line bg-surface px-2 py-2 text-[12.5px]"
        >
          <option value="">Any signal</option>
          {notable.map((s) => (
            <option key={s.id} value={s.id}>
              {fmtDate(s.date)} · {s.title.slice(0, 70)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-white"
        >
          Find clients
        </button>
        <button
          type="button"
          onClick={() => {
            setShowMethod((v) => !v);
          }}
          className="text-[12px] text-accent"
        >
          {showMethod ? 'Hide method' : 'How this works'}
        </button>
      </form>
      {showMethod && d && (
        <ol className="m-0 mb-4 space-y-1 rounded border border-line bg-surface-2 px-4 py-2 pl-8 text-[12px] text-ink-2">
          {d.method.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ol>
      )}

      {ideas.isPending && <p className="text-muted">Running the idea rules across the book…</p>}
      {ideas.isError && (
        <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {ideas.error.message}
        </div>
      )}
      {d && (
        <div className="space-y-4">
          <Panel
            title={`Fits · ${d.matches.length}${d.signal ? ` · after ${d.signal.title.slice(0, 60)}` : d.query ? ` · “${d.query}”` : ' · every idea in the book'}`}
            right={
              d.matches.length > 0
                ? 'one draft per client, in their language, each reviewed before it goes anywhere'
                : ''
            }
          >
            {d.matches.length === 0 && (
              <p className="m-0 text-[12.5px] text-muted">
                No idea passes for this query at the clock. Try another phrasing or pick a signal.
              </p>
            )}
            <ul className="m-0 list-none divide-y divide-line p-0">
              {d.matches.map((m) => (
                <MatchRow
                  key={`${m.clientId}-${m.idea.id}`}
                  m={m}
                  signalId={d.signal?.id ?? null}
                />
              ))}
            </ul>
          </Panel>

          {d.blocked.length > 0 && (
            <Panel
              title={`Blocked by suitability · ${d.blocked.length}`}
              right="shown so you know why not"
            >
              <ul className="m-0 list-none divide-y divide-line p-0">
                {d.blocked.map((m) => (
                  <MatchRow
                    key={`${m.clientId}-${m.idea.id}`}
                    m={m}
                    signalId={d.signal?.id ?? null}
                  />
                ))}
              </ul>
            </Panel>
          )}

          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4">
            <Panel
              title={`Opportunities · ${d.opportunities.length}`}
              right="rules with reasons; notes quoted"
            >
              <ul className="m-0 list-none divide-y divide-line p-0 text-[12.5px]">
                {d.opportunities.map((o) => (
                  <li key={`${o.clientId}-${o.kind}`} className="flex items-start gap-3 py-2">
                    <Pill
                      tone={
                        o.kind === 'lending'
                          ? 'info'
                          : o.kind === 'mandate'
                            ? 'brass'
                            : o.kind === 'deployment'
                              ? 'warn'
                              : 'neutral'
                      }
                    >
                      {KIND_LABEL[o.kind]}
                    </Pill>
                    <div className="min-w-0">
                      <Link
                        to={o.link}
                        className="font-medium text-ink no-underline hover:text-accent"
                      >
                        {o.clientName}
                      </Link>
                      <span className="text-ink-2"> · {o.title}</span>
                      <div className="text-[12px] text-ink-2">{o.why}</div>
                      {o.quote && (
                        <blockquote className="m-0 mt-0.5 border-l-2 border-line pl-2 text-[12px] italic text-muted">
                          “{o.quote}”{' '}
                          <span className="not-italic">
                            · {o.quoteDate ? fmtDate(o.quoteDate) : ''}
                          </span>
                        </blockquote>
                      )}
                    </div>
                  </li>
                ))}
                {d.opportunities.length === 0 && (
                  <li className="py-2 text-muted">No opportunity rule fires at this clock.</li>
                )}
              </ul>
            </Panel>
            <Panel title="Ideas landing" right="last 60 days · high and severe signals">
              <table className="w-full text-[12px]">
                <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                  <tr>
                    <th className="py-1 text-left font-semibold">Signal</th>
                    <th className="py-1 text-right font-semibold">Reached</th>
                    <th className="py-1 text-right font-semibold">Drafted</th>
                    <th className="py-1 text-right font-semibold">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {d.uptake.map((u) => (
                    <tr key={u.signalId} className="border-t border-line">
                      <td className="py-1 pr-2 text-ink-2">
                        <span className="font-mono text-[10.5px] text-muted">
                          {fmtDate(u.date)}
                        </span>{' '}
                        {u.title.slice(0, 60)}
                      </td>
                      <td className="tnum py-1 text-right font-mono">{u.reached}</td>
                      <td className="tnum py-1 text-right font-mono">{u.drafted}</td>
                      <td className="tnum py-1 text-right font-mono">{u.sent}</td>
                    </tr>
                  ))}
                  {d.uptake.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-2 text-muted">
                        No high or severe signal in the last 60 days.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchRow({ m, signalId }: { m: IdeaMatch; signalId: string | null }): JSX.Element {
  const clock = useClockDate();
  const qc = useQueryClient();
  const draft = useMutation({
    mutationFn: () =>
      postJson(
        `/api/v1/clients/${m.clientId}/outreach/draft?clock=${clock}`,
        {
          channel: 'email',
          actionIds: [],
          signalIds: signalId ? [signalId] : m.idea.motivatedBy.signalIds,
          tone: 'formal',
        },
        OutreachDraft,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ideas'] });
      void qc.invalidateQueries({ queryKey: ['workflow', m.clientId] });
    },
  });
  return (
    <li className="flex items-start gap-3 py-2.5 text-[12.5px]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={m.link} className="font-medium text-ink no-underline hover:text-accent">
            {m.clientName}
          </Link>
          <span className="text-muted">
            {fmtUsdCompact(m.aumUsd)} · {m.language} · {m.residence}
          </span>
          <Pill tone="neutral">{m.idea.direction}</Pill>
          <SuitabilityBadge s={m.idea.suitability} />
          <span className="text-[11px] text-muted">
            confidence {Math.round(m.idea.confidence * 100)}%
          </span>
        </div>
        <div className="mt-0.5 text-ink">{m.idea.title}</div>
        <div className="text-[12px] text-ink-2">{m.why}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {m.idea.suitability.status !== 'blocked' && (
          <button
            type="button"
            disabled={draft.isPending || draft.isSuccess}
            onClick={() => {
              draft.mutate();
            }}
            className="rounded border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-2 hover:bg-surface-2 disabled:text-muted"
          >
            {draft.isSuccess ? 'Drafted' : draft.isPending ? 'Drafting…' : `Draft in ${m.language}`}
          </button>
        )}
        {draft.isSuccess && (
          <Link to={`/clients/${m.clientId}/workflow`} className="text-[11px]">
            review in workflow →
          </Link>
        )}
        {draft.isError && <span className="text-[11px] text-crit">{draft.error.message}</span>}
      </div>
    </li>
  );
}
