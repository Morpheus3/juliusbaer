import { useQuery } from '@tanstack/react-query';
import {
  AuditResponse,
  CashflowsResponse,
  ChangeResponse,
  ClientOverviewResponse,
  ImpactResponse,
  NotesResponse,
  RubricAssessmentResponse,
  ScenariosResponse,
  SignalsResponse,
  WorkflowResponse,
  type CombinedRiskResponse,
  type Scenario,
} from '@jb/contracts';
import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Pill } from '@/components/Pill';
import { Client360Body } from '@/features/client360/Client360Body';
import { DecisionButtons } from '@/features/risk/DecisionButtons';
import { useCombinedRisk } from '@/features/risk/riskApi';
import { SuitabilityBadge } from '@/features/risk/SuitabilityBadge';
import { SEVERITY_SHORT, SEVERITY_TONE, ageLabel } from '@/features/signals/signalFormat';
import { ApiError, getJson, postJson } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtUsdCompact } from '@/lib/format';
import { useMeta } from '@/lib/meta';
import { useClockDate } from '@/state/clock';
import {
  couldHappenProse,
  happenedProse,
  pickScenario,
  standingProse,
  type Prose,
} from './journeyProse';

const CHAPTERS = [
  { id: 'stand', n: 1, title: 'Where they stand' },
  { id: 'happened', n: 2, title: 'What happened' },
  { id: 'could', n: 3, title: 'What could happen' },
  { id: 'do', n: 4, title: 'What to do' },
  { id: 'decided', n: 5, title: 'What I decided' },
] as const;
type ChapterId = (typeof CHAPTERS)[number]['id'];

/**
 * The client journey: one page, five chapters, read top to bottom in the order a good advisor
 * thinks. Composed from the existing endpoints; every chapter opens with sentences built from
 * computed facts and links to the room where the detail lives.
 */
export function JourneyPage(): JSX.Element {
  const { clientId = '' } = useParams();
  const clock = useClockDate();
  const meta = useMeta();
  const overview = useQuery({
    queryKey: ['overview', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/overview`, ClientOverviewResponse),
  });
  const [active, setActive] = useState<ChapterId>('stand');
  useScrollSpy(setActive, overview.data !== undefined && meta.data !== undefined);
  useHashChapter(overview.data !== undefined && meta.data !== undefined);

  return (
    <div className="grid max-w-[1500px] grid-cols-[168px_minmax(0,1fr)] gap-8">
      <ChapterRail active={active} />
      <div className="min-w-0 space-y-10">
        {overview.isPending && <p className="text-muted">Reading the client…</p>}
        {overview.isError && (
          <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
            {overview.error.message}
          </div>
        )}
        {overview.data && meta.data && (
          <>
            <Standing clientId={clientId} o={overview.data} baseline={meta.data.baseline} />
            <Happened clientId={clientId} clock={clock} />
            <CouldHappen clientId={clientId} clock={clock} o={overview.data} />
            <WhatToDo clientId={clientId} clock={clock} />
            <Decided clientId={clientId} clock={clock} />
          </>
        )}
      </div>
    </div>
  );
}

/** Opens the chapter named in the URL hash (lane cards link to `#do`, `#happened`, …) once it exists. */
function useHashChapter(ready: boolean): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) {
      return;
    }
    const id = hash.slice(1);
    if (CHAPTERS.some((c) => c.id === id)) {
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
      });
    }
  }, [ready, hash]);
}

/** Highlights the chapter in view. Attaches once the chapters exist, hence the `ready` flag. */
function useScrollSpy(onChange: (id: ChapterId) => void, ready: boolean): void {
  useEffect(() => {
    if (!ready) {
      return;
    }
    const main = document.querySelector('main');
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          onChange(visible.target.id as ChapterId);
        }
      },
      { root: main, rootMargin: '-10% 0px -60% 0px', threshold: 0 },
    );
    for (const c of CHAPTERS) {
      const el = document.getElementById(c.id);
      if (el) {
        obs.observe(el);
      }
    }
    return () => {
      obs.disconnect();
    };
  }, [onChange, ready]);
}

function ChapterRail({ active }: { active: ChapterId }): JSX.Element {
  return (
    <nav aria-label="Chapters" className="sticky top-0 self-start pt-1">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass">
        Client journey
      </div>
      <ol className="m-0 list-none space-y-1 p-0">
        {CHAPTERS.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById(c.id)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`block w-full rounded border px-2.5 py-1.5 text-left text-[12.5px] ${active === c.id ? 'border-accent bg-accent-soft font-semibold text-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}
            >
              <span className="mr-1.5 font-mono text-[11px] text-muted">{c.n}</span>
              {c.title}
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Read top to bottom. Every figure links to the room where its rows live.
      </p>
    </nav>
  );
}

function Chapter({
  id,
  n,
  title,
  prose,
  rooms,
  children,
}: {
  id: ChapterId;
  n: number;
  title: string;
  prose: Prose | null;
  rooms: { to: string; label: string }[];
  children?: ReactNode;
}): JSX.Element {
  return (
    <section id={id} className="scroll-mt-4">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="m-0 font-serif text-[24px] font-semibold leading-tight text-ink">
          <span className="mr-2 font-mono text-[13px] font-normal text-muted">{n}</span>
          {title}
        </h2>
        <div className="flex flex-wrap gap-2 text-[12px]">
          {rooms.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="rounded border border-line bg-surface px-2.5 py-1 text-ink-2 no-underline hover:bg-surface-2"
            >
              {r.label} →
            </Link>
          ))}
        </div>
      </header>
      {prose && prose.sentences.length > 0 && (
        <div className="mb-4 rounded-md border-l-[3px] border-brass bg-brass-soft/60 px-4 py-3">
          <p className="m-0 font-serif text-[16.5px] leading-relaxed text-ink">
            {prose.sentences.join(' ')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <Pill tone="brass">facts · {prose.sources.length} sources</Pill>
            <span>{prose.sources.join(' · ')}</span>
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- chapter 1 */

function Standing({
  clientId,
  o,
  baseline,
}: {
  clientId: string;
  o: ClientOverviewResponse;
  baseline: string;
}): JSX.Element {
  const cf = useQuery({
    queryKey: ['cashflows', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/cashflows`, CashflowsResponse),
  });
  const rubric = useQuery({
    queryKey: ['rubric', clientId],
    queryFn: async () => {
      try {
        return await getJson(`/api/v1/clients/${clientId}/rubric`, RubricAssessmentResponse);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return null;
        }
        throw e;
      }
    },
  });
  const notes = useQuery({
    queryKey: ['notes', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/notes`, NotesResponse),
  });
  const prose = standingProse(o, cf.data ?? null, rubric.data ?? null, baseline);
  const moments = useMemo(() => {
    const out: { date: string; label: string; kind: string }[] = [];
    for (const n of cf.data?.needs ?? []) {
      if (n.status !== 'running') {
        out.push({
          date: n.dueFrom,
          label: `${n.description} · ${n.currency} ${Math.round(n.amount).toLocaleString('en-US')}`,
          kind: 'cash need',
        });
      }
    }
    out.push({ date: o.client.kycReviewDue, label: 'KYC refresh due', kind: 'compliance' });
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [cf.data, o.client.kycReviewDue]);

  return (
    <Chapter
      id="stand"
      n={1}
      title="Where they stand"
      prose={prose}
      rooms={[
        { to: `/clients/${clientId}/portfolio`, label: 'Portfolio' },
        { to: `/clients/${clientId}/portfolio/cashflows`, label: 'Cash flows' },
        { to: `/clients/${clientId}/vector`, label: 'Customer vector' },
      ]}
    >
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className="rounded-md border border-line bg-surface px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            Moments ahead
          </div>
          <ul className="m-0 list-none space-y-1.5 p-0 text-[12.5px]">
            {moments.map((m) => (
              <li key={`${m.kind}-${m.date}-${m.label}`} className="flex gap-3">
                <span className="tnum w-[90px] shrink-0 font-mono text-[12px] text-muted">
                  {fmtDate(m.date)}
                </span>
                <span className="text-ink">{m.label}</span>
                <Pill>{m.kind}</Pill>
              </li>
            ))}
            {moments.length === 0 && <li className="text-muted">Nothing dated in the record.</li>}
          </ul>
        </div>
        <div className="rounded-md border border-line bg-surface px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            <span>In their words · last notes</span>
            <span className="font-normal normal-case tracking-normal text-muted">
              {notes.data ? `${notes.data.notes.length} on record` : ''}
            </span>
          </div>
          <ul className="m-0 list-none space-y-2 p-0 text-[12.5px]">
            {(notes.data?.notes ?? []).slice(0, 3).map((n) => (
              <li key={n.noteId}>
                <div className="text-[11px] text-muted">
                  {fmtDate(n.date)} · {n.channel} · {n.rmName}
                </div>
                <blockquote className="m-0 line-clamp-3 border-l-2 border-line pl-2 text-ink-2">
                  {n.text}
                </blockquote>
              </li>
            ))}
            {notes.data?.notes.length === 0 && <li className="text-muted">No notes on record.</li>}
          </ul>
        </div>
      </div>
      <Client360Body d={o} />
    </Chapter>
  );
}

/* ---------------------------------------------------------------- chapter 2 */

function Happened({ clientId, clock }: { clientId: string; clock: string }): JSX.Element {
  const meta = useMeta();
  const snapshot = useMemo(() => {
    const dates = meta.data?.snapshots.map((s) => s.date) ?? [];
    const at = dates.filter((d) => d <= clock);
    return at[at.length - 1] ?? meta.data?.current ?? '';
  }, [meta.data, clock]);
  const change = useQuery({
    queryKey: ['change', clientId, snapshot],
    queryFn: () =>
      getJson(
        `/api/v1/clients/${clientId}/change?from=${meta.data?.baseline ?? ''}&to=${snapshot}`,
        ChangeResponse,
      ),
    enabled: snapshot !== '' && meta.data !== undefined,
  });
  const signals = useQuery({
    queryKey: ['signals', clock, clientId],
    queryFn: () => getJson(`/api/v1/signals?clock=${clock}&clientId=${clientId}`, SignalsResponse),
    enabled: clock !== '',
  });
  const reaching = (signals.data?.signals ?? []).filter((s) => (s.client?.exposedPct ?? 0) > 0);
  const prose = happenedProse(change.data ?? null, reaching);
  const c = change.data;

  return (
    <Chapter
      id="happened"
      n={2}
      title="What happened"
      prose={prose}
      rooms={[
        { to: `/clients/${clientId}/portfolio`, label: 'Attribution' },
        { to: `/signals?client=${clientId}`, label: 'Signals' },
      ]}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-md border border-line bg-surface px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            Change by asset class {c ? `· ${fmtDate(c.from)} → ${fmtDate(c.to)}` : ''}
          </div>
          {c && (
            <table className="w-full text-[12.5px]">
              <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="py-1 text-left font-semibold">Asset class</th>
                  <th className="py-1 text-right font-semibold">Price</th>
                  <th className="py-1 text-right font-semibold">FX</th>
                  <th className="py-1 text-right font-semibold">Flows</th>
                  <th className="py-1 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {c.byAssetClass
                  .filter((r) => r.startUsd !== 0 || r.endUsd !== 0)
                  .map((r) => {
                    const total = r.endUsd - r.startUsd;
                    return (
                      <tr key={r.assetClass} className="border-t border-line">
                        <td className="py-1 text-ink-2">{r.assetClass}</td>
                        <Money v={r.priceEffectUsd} />
                        <Money v={r.fxEffectUsd} />
                        <Money v={r.flowEffectUsd} />
                        <Money v={total} bold />
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
          {change.isPending && <p className="m-0 text-muted">Attributing…</p>}
        </div>
        <div className="rounded-md border border-line bg-surface px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            Signals reaching the household
          </div>
          <ul className="m-0 list-none space-y-2 p-0 text-[12.5px]">
            {reaching.slice(0, 4).map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <Pill tone={SEVERITY_TONE[s.severity]}>{SEVERITY_SHORT[s.severity]}</Pill>
                <div>
                  <Link
                    to={`/clients/${clientId}/impact?signals=${s.id}`}
                    className="font-medium text-ink no-underline hover:text-accent"
                  >
                    {s.title}
                  </Link>
                  <div className="text-[11px] text-muted">
                    {fmtDate(s.date)} · {ageLabel(s.ageDays)} · {s.client?.exposedPct.toFixed(1)}%
                    of household · conf {s.confidence.overall}%
                  </div>
                  {s.client?.whyItMatters && (
                    <div className="text-[12px] text-ink-2">{s.client.whyItMatters}</div>
                  )}
                </div>
              </li>
            ))}
            {signals.data && reaching.length === 0 && (
              <li className="text-muted">
                No signal before {fmtDate(clock)} reaches the holdings.
              </li>
            )}
          </ul>
        </div>
      </div>
    </Chapter>
  );
}

function Money({ v, bold = false }: { v: number; bold?: boolean }): JSX.Element {
  return (
    <td
      className={`tnum py-1 text-right font-mono ${v < 0 ? 'text-crit' : v > 0 ? 'text-ok' : 'text-muted'} ${bold ? 'font-semibold' : ''}`}
    >
      {v === 0 ? '—' : `${v < 0 ? '−' : '+'}${fmtUsdCompact(Math.abs(v))}`}
    </td>
  );
}

/* ---------------------------------------------------------------- chapter 3 */

function CouldHappen({
  clientId,
  clock,
  o,
}: {
  clientId: string;
  clock: string;
  o: ClientOverviewResponse;
}): JSX.Element {
  const risk = useCombinedRisk(clientId);
  const scenarios = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => getJson('/api/v1/scenarios', ScenariosResponse),
    staleTime: 600_000,
  });
  const pick = useMemo(
    () =>
      pickScenario(
        o.allocation.map((a) => ({ assetClass: a.assetClass, weightPct: a.weightPct })),
        scenarios.data?.scenarios ?? [],
      ),
    [o.allocation, scenarios.data],
  );
  const impact = useQuery({
    queryKey: ['journey-impact', clientId, clock, pick?.scenario.id ?? null],
    queryFn: () =>
      postJson(
        `/api/v1/clients/${clientId}/impact?clock=${clock}`,
        { scenarioId: pick?.scenario.id, severity: 'base', save: false },
        ImpactResponse,
      ),
    enabled: pick !== null && clock !== '',
    staleTime: 300_000,
    retry: 0,
  });
  const prose = couldHappenProse(risk.data ?? null, pick?.scenario ?? null, impact.data ?? null);

  return (
    <Chapter
      id="could"
      n={3}
      title="What could happen"
      prose={prose}
      rooms={[
        { to: `/clients/${clientId}/actions`, label: 'Combined risk' },
        {
          to: `/clients/${clientId}/impact${pick ? `?scenario=${pick.scenario.id}` : ''}`,
          label: 'Run another scenario',
        },
      ]}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4">
        <RiskSummary risk={risk.data ?? null} />
        <ScenarioCard
          pick={pick}
          impact={impact.data ?? null}
          error={impact.error}
          pending={impact.isPending && pick !== null}
        />
      </div>
    </Chapter>
  );
}

function RiskSummary({ risk }: { risk: CombinedRiskResponse | null }): JSX.Element {
  if (!risk) {
    return (
      <div className="rounded-md border border-line bg-surface px-4 py-3 text-muted">
        Grading risk…
      </div>
    );
  }
  const tone =
    risk.matrix.cell === 'URGENT' || risk.matrix.cell === 'Act Now'
      ? 'crit'
      : risk.matrix.cell === 'Discuss'
        ? 'warn'
        : risk.matrix.cell === 'Review'
          ? 'info'
          : 'ok';
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
        <span>Combined risk</span>
        <Pill tone={tone}>{risk.matrix.cell}</Pill>
      </div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="tnum font-serif text-[30px] font-semibold text-ink">
          {risk.gauge.composite.toFixed(1)}
        </span>
        <span className="text-[12px] text-muted">/ 10 composite</span>
      </div>
      <ul className="m-0 list-none space-y-1 p-0 text-[12.5px] text-ink-2">
        {risk.vulnerability.reasons.slice(0, 3).map((r) => (
          <li key={r}>· {r}</li>
        ))}
        {risk.signalRisk.reasons.slice(0, 2).map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>
      {risk.mismatches.length > 0 && (
        <div className="mt-2 text-[12px]">
          <span className="font-semibold text-warn">Mismatches:</span>{' '}
          <span className="text-ink-2">{risk.mismatches.join(' · ')}</span>
        </div>
      )}
    </div>
  );
}

function ScenarioCard({
  pick,
  impact,
  error,
  pending,
}: {
  pick: { scenario: Scenario; reason: string } | null;
  impact: ImpactResponse | null;
  error: Error | null;
  pending: boolean;
}): JSX.Element {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
        Named scenario, chosen for this client
      </div>
      {!pick && <p className="m-0 text-muted">No scenario library is loaded.</p>}
      {pick && (
        <>
          <div className="font-serif text-[16px] font-semibold text-ink">{pick.scenario.name}</div>
          <p className="m-0 mb-1 text-[12.5px] text-ink-2">{pick.scenario.description}</p>
          <p className="m-0 mb-2 text-[11.5px] italic text-muted">{pick.reason}</p>
          {pending && <p className="m-0 text-muted">Running the impact engine…</p>}
          {error && (
            <p className="m-0 text-[12.5px] text-crit">
              Impact engine unavailable: {error.message}
            </p>
          )}
          {impact && (
            <div className="grid grid-cols-3 gap-2 text-[12.5px]">
              <Stat
                label="Household"
                value={`${impact.total_pct > 0 ? '+' : ''}${impact.total_pct.toFixed(1)}%`}
                sub={fmtUsdCompact(impact.total_usd)}
                tone={impact.total_pct < 0 ? 'crit' : 'ok'}
              />
              {impact.collateral.slice(0, 1).map((c) => (
                <Stat
                  key={c.facility_id}
                  label="LTV after"
                  value={`${c.ltv_after_pct.toFixed(1)}%`}
                  sub={`${c.ltv_before_pct.toFixed(1)}% now · trigger ${c.margin_call_ltv_pct}%${c.breached_after ? ' · margin call' : ''}`}
                  tone={c.breached_after ? 'crit' : 'neutral'}
                />
              ))}
              {impact.liquidity.coverage_after !== null && (
                <Stat
                  label="Liquidity cover"
                  value={`${impact.liquidity.coverage_after.toFixed(1)}x`}
                  sub={`${impact.liquidity.coverage_before?.toFixed(1) ?? '—'}x now · 12 months`}
                  tone={impact.liquidity.coverage_after < 1 ? 'crit' : 'neutral'}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'crit' | 'ok' | 'neutral';
}): JSX.Element {
  return (
    <div className="rounded border border-line px-2.5 py-2">
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div
        className={`tnum font-serif text-[20px] font-semibold ${tone === 'crit' ? 'text-crit' : tone === 'ok' ? 'text-ok' : 'text-ink'}`}
      >
        {value}
      </div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- chapter 4 */

function WhatToDo({ clientId, clock }: { clientId: string; clock: string }): JSX.Element {
  const risk = useCombinedRisk(clientId);
  const workflow = useQuery({
    queryKey: ['workflow', clientId, clock],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/workflow?clock=${clock}`, WorkflowResponse),
    enabled: clock !== '',
    staleTime: 30_000,
  });
  const actions = risk.data?.actions ?? [];
  const ideas = risk.data?.tradeIdeas ?? [];
  const talking = [
    ...actions.slice(0, 3).map((a) => a.title),
    ...(risk.data?.signalRisk.reasons.slice(0, 1) ?? []),
  ];

  return (
    <Chapter
      id="do"
      n={4}
      title="What to do"
      prose={null}
      rooms={[
        { to: `/clients/${clientId}/actions`, label: 'Risk & actions' },
        { to: `/clients/${clientId}/trade-ideas`, label: 'Trade ideas' },
        { to: `/clients/${clientId}/workflow`, label: 'Workflow' },
      ]}
    >
      {talking.length > 0 && (
        <div className="mb-4 rounded-md border-l-[3px] border-brass bg-brass-soft/60 px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-brass">
            Talking points
          </div>
          <ol className="m-0 space-y-0.5 pl-5 font-serif text-[15.5px] text-ink">
            {talking.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            Ranked actions
          </div>
          {actions.slice(0, 5).map((a) => (
            <div key={a.id} className="rounded-md border border-line bg-surface px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted">#{a.rank}</span>
                    <span className="font-medium text-ink">{a.title}</span>
                    <Pill
                      tone={
                        a.urgency === 'now' ? 'crit' : a.urgency === 'week' ? 'warn' : 'neutral'
                      }
                    >
                      {a.urgency === 'now' ? 'now' : a.urgency === 'week' ? '7 days' : '30 days'}
                    </Pill>
                    <SuitabilityBadge s={a.suitability} />
                  </div>
                  <div className="mt-1 text-[12.5px] text-ink-2">{a.evidence}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted">
                    Benefit: {a.benefit} · Trade-off: {a.tradeOff}
                  </div>
                </div>
                <DecisionButtons
                  clientId={clientId}
                  id={a.id}
                  entityType="action"
                  decision={a.decision}
                  blocked={a.suitability.status === 'blocked'}
                  approveLabel="Approve and log"
                />
              </div>
            </div>
          ))}
          {risk.data && actions.length === 0 && (
            <p className="m-0 text-muted">No action is recommended at this clock.</p>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
              Trade ideas
            </div>
            <ul className="m-0 list-none space-y-2 p-0">
              {ideas.slice(0, 3).map((t) => (
                <li
                  key={t.id}
                  className="rounded-md border border-line bg-surface px-3 py-2 text-[12.5px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{t.title}</span>
                    <SuitabilityBadge s={t.suitability} />
                  </div>
                  <div className="mt-0.5 text-ink-2">{t.rationale}</div>
                  <div className="mt-1 text-[11px] text-muted">
                    confidence {Math.round(t.confidence * 100)}% · {t.confidenceNote}
                  </div>
                </li>
              ))}
              {risk.data && ideas.length === 0 && (
                <li className="text-muted">No idea passes at this clock.</li>
              )}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
              Outreach
            </div>
            <ul className="m-0 list-none space-y-1.5 p-0 text-[12.5px]">
              {(workflow.data?.outreach ?? []).map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded border border-line bg-surface px-3 py-1.5"
                >
                  <span className="min-w-0 truncate text-ink">{d.subject}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
                    {d.language} · {d.channel}
                    <Pill
                      tone={d.status === 'sent' ? 'ok' : d.status === 'draft' ? 'warn' : 'neutral'}
                    >
                      {d.status}
                    </Pill>
                  </span>
                </li>
              ))}
              {workflow.data?.outreach.length === 0 && (
                <li className="text-muted">
                  No draft yet.{' '}
                  <Link to={`/clients/${clientId}/workflow`}>Draft in the client's language →</Link>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </Chapter>
  );
}

/* ---------------------------------------------------------------- chapter 5 */

function Decided({ clientId, clock }: { clientId: string; clock: string }): JSX.Element {
  const audit = useQuery({
    queryKey: ['audit', clientId],
    queryFn: () => getJson(`/api/v1/audit?clientId=${clientId}`, AuditResponse),
  });
  const workflow = useQuery({
    queryKey: ['workflow', clientId, clock],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/workflow?clock=${clock}`, WorkflowResponse),
    enabled: clock !== '',
    staleTime: 30_000,
  });
  const steps = workflow.data?.steps ?? [];
  const done = steps.filter((s) => s.status === 'done').length;
  const events = [...(audit.data?.events ?? [])].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );

  return (
    <Chapter
      id="decided"
      n={5}
      title="What I decided"
      prose={null}
      rooms={[
        { to: `/clients/${clientId}/workflow`, label: 'Workflow' },
        { to: '/audit', label: 'Audit trail' },
      ]}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4">
        <div className="rounded-md border border-line bg-surface px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            Steps · {done} of {steps.length || 9} done
          </div>
          <ol className="m-0 list-none space-y-1 p-0 text-[12.5px]">
            {steps.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${s.status === 'done' ? 'bg-ok' : s.status === 'current' ? 'bg-brass' : 'bg-line-2'}`}
                />
                <Link
                  to={s.link}
                  className={`no-underline ${s.status === 'current' ? 'font-semibold text-ink' : 'text-ink-2'}`}
                >
                  {s.index}. {s.title}
                </Link>
                <span className="ml-auto text-[11px] text-muted">{s.status}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-md border border-line bg-surface px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            Logged for this client · {events.length}
          </div>
          <ul className="m-0 list-none divide-y divide-line p-0 text-[12.5px]">
            {events.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-1.5">
                <span className="tnum w-[130px] shrink-0 font-mono text-[11px] text-muted">
                  {fmtDateTime(e.createdAt)}
                </span>
                <span className="min-w-0">
                  <span className="mr-1.5 font-mono text-[10.5px] text-brass">{e.kind}</span>
                  <span className="text-ink">{e.summary}</span>
                  <span className="text-muted"> · {e.actor}</span>
                </span>
              </li>
            ))}
            {audit.data && events.length === 0 && (
              <li className="py-1.5 text-muted">
                Nothing logged yet. Decisions made above appear here.
              </li>
            )}
          </ul>
        </div>
      </div>
    </Chapter>
  );
}
