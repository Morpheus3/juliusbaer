import type { HorizonItem, Theme, Urgency } from '@jb/contracts';
import { useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { Kpi } from '@/components/Kpi';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { Brief } from '@/features/today/Brief';
import { PromiseLedger } from '@/features/promises/PromiseLedger';
import { CallSheet } from '@/features/today/CallSheet';
import { chapterFor } from '@/features/today/chapterFor';
import { useBook } from '@/lib/book';
import { fmtDate, fmtUsdCompact } from '@/lib/format';

const LANES: { key: Urgency; title: string; sub: string }[] = [
  { key: 'now', title: 'Act now', sub: 'today' },
  { key: 'week', title: 'Next 7 days', sub: 'this week' },
  { key: 'month', title: 'Next 30 days', sub: 'this month' },
];
const THEME_LABEL: Record<Theme, string> = {
  collateral: 'Collateral',
  mandate: 'Mandate',
  concentration: 'Concentration',
  liquidity: 'Liquidity',
  compliance: 'Compliance',
  contact: 'Contact',
  valuation: 'Valuation',
  signal: 'Signal',
};

/** Today: the morning brief, the call sheet, the lanes and the book by urgency. Wireframe slide 01 shell. */
export function BookPage(): JSX.Element {
  const q = useBook();
  const [centre, setCentre] = useState('all');
  const [theme, setTheme] = useState<Theme | 'all'>('all');
  const [severity, setSeverity] = useState<'all' | 'high'>('all');
  const [client, setClient] = useState<string | null>(null);
  const d = q.data;

  const centres = useMemo(
    () => [...new Set((d?.clients ?? []).map((c) => c.bookingCentre))].sort(),
    [d],
  );
  const centreClients = useMemo(
    () =>
      new Set(
        (d?.clients ?? [])
          .filter((c) => centre === 'all' || c.bookingCentre === centre)
          .map((c) => c.clientId),
      ),
    [d, centre],
  );
  const shown = (d?.items ?? []).filter(
    (i) =>
      centreClients.has(i.clientId) &&
      (theme === 'all' || i.theme === theme) &&
      (severity === 'all' || i.severity === 'high') &&
      (client === null || i.clientId === client),
  );

  return (
    <div className="max-w-[1600px]">
      <PageHeader
        eyebrow="RM view · L1"
        title="Today"
        right={
          d && (
            <span className="text-[12.5px] text-muted">
              clock {fmtDate(d.clock)} · positions {fmtDate(d.snapshotDate)}
              {d.previousSnapshotDate ? ` · momentum vs ${fmtDate(d.previousSnapshotDate)}` : ''}
            </span>
          )
        }
      >
        {d && (
          <p className="mb-0 mt-1 text-[12.5px] text-muted">
            {d.kpis.items.now} to act on now, {d.kpis.items.week} this week, {d.kpis.items.month}{' '}
            this month across {d.kpis.clients} clients.
          </p>
        )}
      </PageHeader>

      {q.isPending && <p className="text-muted">Ranking the book…</p>}
      {q.isError && (
        <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {q.error.message}
        </div>
      )}
      {d && (
        <div className="space-y-4">
          <Brief book={d} />
          <CallSheet />
          <PromiseLedger clientId={null} compact showClient />
          <div className="grid grid-cols-6 gap-3">
            <Kpi
              label="Book AUM"
              value={fmtUsdCompact(d.kpis.aumUsd)}
              sub={`${d.kpis.ytdChangePct > 0 ? '+' : ''}${d.kpis.ytdChangePct.toFixed(1)}% since baseline`}
              tone={d.kpis.ytdChangePct < 0 ? 'crit' : 'ok'}
            />
            <Kpi
              label="Act now"
              value={String(d.kpis.items.now)}
              tone={d.kpis.items.now > 0 ? 'crit' : 'ok'}
              sub="items"
            />
            <Kpi
              label="Clients in breach"
              value={String(d.kpis.clientsInBreach)}
              tone={d.kpis.clientsInBreach > 0 ? 'warn' : 'ok'}
              sub="mandate bands"
            />
            <Kpi
              label="Facilities near trigger"
              value={String(d.kpis.facilitiesNearTrigger)}
              tone={d.kpis.facilitiesNearTrigger > 0 ? 'crit' : 'ok'}
              sub="< 5 points headroom"
            />
            <Kpi
              label="KYC"
              value={`${d.kpis.kycOverdue} / ${d.kpis.kycDueSoon}`}
              tone={d.kpis.kycOverdue > 0 ? 'crit' : d.kpis.kycDueSoon > 0 ? 'warn' : 'ok'}
              sub="overdue / due in 45 days"
            />
            <Kpi
              label="Rubric assessed"
              value={`${d.kpis.rubricAssessed}/${d.kpis.clients}`}
              sub="clients scored"
              tone={d.kpis.rubricAssessed < d.kpis.clients ? 'warn' : 'ok'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <select
              value={centre}
              onChange={(e) => {
                setCentre(e.target.value);
              }}
              className="rounded border border-line bg-surface px-2 py-1"
            >
              <option value="all">All booking centres</option>
              {centres.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value as Theme | 'all');
              }}
              className="rounded border border-line bg-surface px-2 py-1"
            >
              <option value="all">All themes</option>
              {(Object.keys(THEME_LABEL) as Theme[]).map((t) => (
                <option key={t} value={t}>
                  {THEME_LABEL[t]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setSeverity((s) => (s === 'all' ? 'high' : 'all'));
              }}
              className={`rounded-full border px-2.5 py-0.5 ${severity === 'high' ? 'border-transparent bg-ink text-white' : 'border-line bg-surface text-ink-2'}`}
            >
              High severity only
            </button>
            {client && (
              <button
                type="button"
                onClick={() => {
                  setClient(null);
                }}
                className="rounded-full border border-brass bg-brass-soft px-2.5 py-0.5 text-brass"
              >
                {d.clients.find((c) => c.clientId === client)?.name ?? client} × clear
              </button>
            )}
            <span className="ml-auto text-muted">{shown.length} items shown</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {LANES.map((lane) => {
              const items = shown.filter((i) => i.lane === lane.key);
              return (
                <section key={lane.key} className="rounded-md border border-line bg-surface">
                  <header
                    className={`flex items-baseline justify-between border-b border-line px-4 py-2 ${lane.key === 'now' ? 'bg-crit-soft/50' : lane.key === 'week' ? 'bg-warn-soft/40' : 'bg-surface-2'}`}
                  >
                    <span className="text-[13px] font-semibold text-ink">{lane.title}</span>
                    <span className="text-[11.5px] text-muted">
                      {items.length} · {lane.sub}
                    </span>
                  </header>
                  <ul className="m-0 max-h-[60vh] list-none divide-y divide-line overflow-y-auto p-0">
                    {items.map((i) => (
                      <ItemCard
                        key={i.id}
                        i={i}
                        onClient={() => {
                          setClient(i.clientId);
                        }}
                      />
                    ))}
                    {items.length === 0 && (
                      <li className="px-4 py-6 text-center text-[12px] text-muted">
                        Nothing in this lane.
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>

          <Panel
            title="The book by urgency"
            right="ranked by urgency score · click a row to filter the lanes"
          >
            <table className="w-full text-[12.5px]">
              <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="py-1 text-left font-semibold">#</th>
                  <th className="py-1 text-left font-semibold">Client</th>
                  <th className="py-1 text-right font-semibold">Urgency</th>
                  <th className="py-1 text-center font-semibold">Now / 7d / 30d</th>
                  <th className="py-1 text-left font-semibold">Rubric</th>
                  <th className="py-1 text-left font-semibold">Themes</th>
                  <th className="py-1 text-left font-semibold">Top item</th>
                  <th className="py-1 text-right font-semibold">AUM</th>
                </tr>
              </thead>
              <tbody>
                {d.clients
                  .filter((c) => centre === 'all' || c.bookingCentre === centre)
                  .map((c, i) => (
                    <tr
                      key={c.clientId}
                      onClick={() => {
                        setClient(c.clientId === client ? null : c.clientId);
                      }}
                      className={`cursor-pointer border-t border-line hover:bg-surface-2/60 ${client === c.clientId ? 'bg-accent-soft/60' : ''}`}
                    >
                      <td className="py-1.5 font-mono text-muted">{i + 1}</td>
                      <td className="py-1.5">
                        <Link
                          to={`/clients/${c.clientId}`}
                          className="font-medium text-ink no-underline hover:text-accent"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          {c.name}
                        </Link>
                        <div className="font-mono text-[10.5px] text-muted">
                          {c.clientId} · {c.bookingCentre} · {c.riskProfile}
                        </div>
                      </td>
                      <td className="tnum py-1.5 text-right font-mono font-semibold text-ink">
                        {c.urgencyScore}
                      </td>
                      <td className="tnum py-1.5 text-center font-mono">
                        <span className={c.counts.now ? 'text-crit' : 'text-muted'}>
                          {c.counts.now}
                        </span>{' '}
                        /{' '}
                        <span className={c.counts.week ? 'text-warn' : 'text-muted'}>
                          {c.counts.week}
                        </span>{' '}
                        / <span className="text-ink-2">{c.counts.month}</span>
                      </td>
                      <td className="py-1.5">
                        {c.rubric ? (
                          <span
                            className="font-mono text-[11.5px] text-ink-2"
                            title={c.rubric.status}
                          >
                            C{c.rubric.capacity} A{c.rubric.appetite} H{c.rubric.horizon}
                          </span>
                        ) : (
                          <Link to={`/clients/${c.clientId}/rubric`} className="text-[11.5px]">
                            assess
                          </Link>
                        )}
                      </td>
                      <td className="py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {c.themes.map((t) => (
                            <Pill key={t} tone="neutral">
                              {THEME_LABEL[t]}
                            </Pill>
                          ))}
                        </div>
                      </td>
                      <td className="py-1.5 text-ink-2">{c.topItem ?? '—'}</td>
                      <td className="tnum py-1.5 text-right font-mono">
                        {fmtUsdCompact(c.aumUsd)}{' '}
                        <span
                          className={`text-[10.5px] ${c.ytdChangePct < 0 ? 'text-crit' : 'text-ok'}`}
                        >
                          {c.ytdChangePct > 0 ? '+' : ''}
                          {c.ytdChangePct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Panel>

          <details className="text-[12px] text-muted">
            <summary className="cursor-pointer">How the lanes are built</summary>
            <ul className="m-0 mt-1 list-disc pl-5">
              {d.method.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}

function ItemCard({ i, onClient }: { i: HorizonItem; onClient: () => void }): JSX.Element {
  const mom =
    i.momentum === 'escalated'
      ? { t: '↑ escalated', c: 'text-crit' }
      : i.momentum === 'new'
        ? { t: '● new', c: 'text-brass' }
        : i.momentum === 'eased'
          ? { t: '↓ eased', c: 'text-ok' }
          : { t: '→ unchanged', c: 'text-muted' };
  return (
    <li className="px-4 py-2.5 text-[12.5px]">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onClient}
          className="m-0 border-0 bg-transparent p-0 text-left font-semibold text-ink hover:text-accent"
        >
          {i.clientName}
        </button>
        <span className="flex items-center gap-1">
          <Pill
            tone={i.severity === 'high' ? 'crit' : i.severity === 'medium' ? 'warn' : 'neutral'}
          >
            {THEME_LABEL[i.theme]}
          </Pill>
        </span>
      </div>
      <Link
        to={`/clients/${i.clientId}#${chapterFor(i.theme)}`}
        title="Open the client journey at this chapter"
        className="mt-0.5 block text-ink-2 no-underline hover:text-accent"
      >
        {i.title}
      </Link>
      <div className="mt-0.5 text-[11px] text-muted">{i.laneReason}</div>
      <div className={`mt-0.5 text-[10.5px] ${mom.c}`}>
        {mom.t}
        {i.previousLane && i.previousLane !== i.lane ? ` from ${i.previousLane}` : ''}
        {i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ''}
      </div>
    </li>
  );
}
