import { useQuery } from '@tanstack/react-query';
import { SignalsResponse, type Signal } from '@jb/contracts';
import { useMemo, useState, type JSX, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClientPicker } from '@/components/ClientPicker';
import { PageHeader } from '@/components/PageHeader';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';
import { useMeta } from '@/lib/meta';
import { useClockDate } from '@/state/clock';
import { SEVERITY_SHORT, SEVERITY_TONE, ageLabel } from './signalFormat';

type SeverityFilter = 'all' | 'high' | 'medium';

/** Market signals feed (RM view L1) with the evidence drawer (L2). Wireframe slide 04. */
export function SignalsPage(): JSX.Element {
  const clock = useClockDate();
  const meta = useMeta();
  const [sp, setSp] = useSearchParams();
  const clientId = sp.get('client') ?? meta.data?.defaultClientId ?? '';
  const [selected, setSelected] = useState<string | null>(null);
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [kind, setKind] = useState<'all' | 'event' | 'derived'>('all');
  const [region, setRegion] = useState('all');
  const [picked, setPicked] = useState<string[]>([]);

  const q = useQuery({
    queryKey: ['signals', clock, clientId],
    queryFn: () => getJson(`/api/v1/signals?clock=${clock}&clientId=${clientId}`, SignalsResponse),
    enabled: clock !== '' && clientId !== '',
    placeholderData: (prev) => prev,
  });

  const regions = useMemo(
    () => [...new Set((q.data?.signals ?? []).map((s) => s.region))].sort(),
    [q.data],
  );
  const shown = (q.data?.signals ?? []).filter(
    (s) =>
      (severity === 'all' ||
        (severity === 'high'
          ? s.severity === 'HIGH' || s.severity === 'SEVERE'
          : s.severity !== 'LOW')) &&
      (kind === 'all' || s.kind === kind) &&
      (region === 'all' || s.region === region),
  );
  const current = shown.find((s) => s.id === selected) ?? shown[0] ?? null;

  const togglePick = (id: string): void => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  return (
    <div className="max-w-[1500px]">
      <PageHeader
        eyebrow="RM view · L1 / L2"
        title="Real-time market signals"
        right={
          <>
            <ClientPicker
              value={clientId}
              to={(id) => {
                const next = new URLSearchParams(sp);
                next.set('client', id);
                setSp(next, { replace: true });
                return `/signals?${next.toString()}`;
              }}
            />
            <Link
              to={`/clients/${clientId}/impact?signals=${picked.join(',')}`}
              className={`rounded px-3 py-1.5 text-[12.5px] font-medium no-underline ${picked.length > 0 ? 'bg-accent text-white hover:bg-accent/90' : 'pointer-events-none bg-surface-2 text-muted'}`}
            >
              Run portfolio impact{picked.length > 0 ? ` (${picked.length})` : ''}
            </Link>
          </>
        }
      >
        {q.data && (
          <div className="mt-1 flex items-center gap-2 text-[12.5px] text-muted">
            <span>
              Clock <span className="font-mono text-ink">{fmtDate(q.data.clock)}</span> · positions
              as of <span className="font-mono text-ink">{fmtDate(q.data.snapshotDate)}</span>
            </span>
            {q.data.stale && (
              <Pill tone="warn">
                Stale data: valuation {q.data.snapshotAgeDays} days older than the clock
              </Pill>
            )}
          </div>
        )}
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <Chips
          value={kind}
          onChange={setKind}
          options={[
            ['all', 'All sources'],
            ['event', 'Event log'],
            ['derived', 'Market moves'],
          ]}
        />
        <span className="text-line-2">|</span>
        <Chips
          value={severity}
          onChange={setSeverity}
          options={[
            ['all', 'All severities'],
            ['medium', 'Medium+'],
            ['high', 'High+'],
          ]}
        />
        <span className="text-line-2">|</span>
        <select
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
          }}
          className="rounded border border-line bg-surface px-2 py-1 text-[12px]"
        >
          <option value="all">Region: all</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="ml-auto text-muted">
          {shown.length} signals · tick to select for impact
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        <div className="rounded-md border border-line bg-surface">
          <div className="border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
            Streaming signals · live feed
          </div>
          {q.isPending && <p className="px-4 py-3 text-muted">Loading…</p>}
          {q.isError && <p className="px-4 py-3 text-crit">{q.error.message}</p>}
          <ul className="m-0 max-h-[70vh] list-none overflow-y-auto p-0">
            {shown.map((s) => (
              <SignalRow
                key={s.id}
                s={s}
                active={current?.id === s.id}
                picked={picked.includes(s.id)}
                onSelect={() => {
                  setSelected(s.id);
                }}
                onPick={() => {
                  togglePick(s.id);
                }}
              />
            ))}
            {shown.length === 0 && !q.isPending && (
              <li className="px-4 py-6 text-center text-muted">
                No signals before {fmtDate(clock)} match the filters.
              </li>
            )}
          </ul>
        </div>
        <EvidenceDrawer s={current} clientId={clientId} picked={picked} onPick={togglePick} />
      </div>
    </div>
  );
}

function Chips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}): JSX.Element {
  return (
    <div className="flex gap-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => {
            onChange(v);
          }}
          className={`rounded-full border px-2.5 py-0.5 ${value === v ? 'border-transparent bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SignalRow({
  s,
  active,
  picked,
  onSelect,
  onPick,
}: {
  s: Signal;
  active: boolean;
  picked: boolean;
  onSelect: () => void;
  onPick: () => void;
}): JSX.Element {
  return (
    <li
      className={`border-b border-line ${active ? 'bg-accent-soft/60' : 'hover:bg-surface-2/60'}`}
    >
      <div className="grid grid-cols-[28px_64px_minmax(0,1fr)] gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={picked}
          onChange={onPick}
          aria-label={`Select ${s.title} for impact`}
          className="mt-1 accent-[#1f4e79]"
        />
        <div>
          <Pill tone={SEVERITY_TONE[s.severity]}>{SEVERITY_SHORT[s.severity]}</Pill>
        </div>
        <button
          type="button"
          onClick={onSelect}
          className="m-0 border-0 bg-transparent p-0 text-left"
        >
          <div className="text-[13.5px] font-medium text-ink">{s.title}</div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {s.eventType} · {ageLabel(s.ageDays)} · {fmtDate(s.date)} · source {s.source.name} ·
            confidence {s.confidence.overall}%
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-2">
            Affected: {s.affectedAssetClasses.join(', ') || '—'}
          </div>
          {s.client && (
            <div className="mt-1 text-[12px] text-ink-2">
              <span className="font-medium text-brass">Why it matters:</span>{' '}
              {s.client.whyItMatters}
            </div>
          )}
        </button>
      </div>
    </li>
  );
}

function EvidenceDrawer({
  s,
  clientId,
  picked,
  onPick,
}: {
  s: Signal | null;
  clientId: string;
  picked: string[];
  onPick: (id: string) => void;
}): JSX.Element {
  if (!s) {
    return (
      <div className="rounded-md border border-line bg-surface px-4 py-6 text-center text-muted">
        Select a signal to open its evidence.
      </div>
    );
  }
  const bar = (v: number): JSX.Element => (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-surface-2">
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${v}%` }} />
      </div>
      <span className="tnum w-9 text-right font-mono text-[11px]">{Math.round(v)}%</span>
    </div>
  );
  const shockEntries = describeShock(s);
  return (
    <aside className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
          Evidence drawer
        </div>
        <button
          type="button"
          onClick={() => {
            onPick(s.id);
          }}
          className="rounded border border-line px-2 py-0.5 text-[11.5px] text-ink-2 hover:bg-surface-2"
        >
          {picked.includes(s.id) ? 'Remove from impact' : 'Add to impact'}
        </button>
      </div>
      <div className="space-y-4 px-4 py-3 text-[12.5px]">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Pill tone={SEVERITY_TONE[s.severity]}>{s.severity}</Pill>
            <span className="font-mono text-[11px] text-muted">{s.id}</span>
          </div>
          <div className="font-serif text-[16px] font-semibold leading-snug text-ink">
            {s.description}
          </div>
        </div>
        <Section title="Primary source">
          <div className="text-ink-2">
            <span className="font-medium text-ink">{s.source.name}</span> — {s.source.reference}.{' '}
            {s.source.detail}.
          </div>
          <div className="mt-1 text-muted">Transmission: {s.channels.join(' · ')}</div>
        </Section>
        <Section title="Confidence breakdown">
          <div className="space-y-1.5">
            <Row label="Data freshness">{bar(s.confidence.dataFreshness)}</Row>
            <Row label="Source reliability">{bar(s.confidence.sourceReliability)}</Row>
            <Row label="Model confidence">{bar(s.confidence.modelConfidence)}</Row>
            <Row label="Overall">
              <span className="tnum font-serif text-[20px] font-semibold text-ink">
                {s.confidence.overall}%
              </span>
            </Row>
          </div>
          <ul className="m-0 mt-2 list-disc pl-4 text-[11.5px] text-muted">
            {s.confidence.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Section>
        <Section title="Implied factor shock (base case)">
          {shockEntries.length === 0 ? (
            <span className="text-muted">none</span>
          ) : (
            <ul className="m-0 list-none p-0 font-mono text-[11.5px] text-ink-2">
              {shockEntries.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </Section>
        {s.client && (
          <Section title={`Affected client assets · ${clientId}`}>
            <div className="mb-1 text-ink">
              <span className="tnum font-serif text-[18px] font-semibold">
                {fmtUsdCompact(s.client.exposedUsd)}
              </span>{' '}
              <span className="text-muted">
                · {s.client.exposedPct.toFixed(1)}% of the household
              </span>
            </div>
            <ul className="m-0 list-none space-y-1 p-0">
              {s.client.affected.slice(0, 8).map((a) => (
                <li
                  key={`${a.portfolioId}-${a.instrumentId}`}
                  className="flex items-start justify-between gap-2"
                >
                  <span className="text-ink-2">
                    {a.name}
                    <span className="ml-1 font-mono text-[10.5px] text-muted">{a.portfolioId}</span>
                    {a.via !== 'direct' && <Pill tone="brass">{a.via}</Pill>}
                    <div className="text-[10.5px] text-muted">{a.matchedBy}</div>
                  </span>
                  <span className="tnum whitespace-nowrap font-mono text-[11.5px]">
                    {fmtUsdCompact(a.marketValueUsd)} · {a.householdPct.toFixed(1)}%
                  </span>
                </li>
              ))}
              {s.client.affected.length === 0 && (
                <li className="text-muted">No holdings reached through the mapped channels.</li>
              )}
            </ul>
          </Section>
        )}
        <Link
          to={`/clients/${clientId}/impact?signals=${[...new Set([...picked, s.id])].join(',')}`}
          className="block rounded bg-accent px-3 py-2 text-center text-[12.5px] font-medium text-white no-underline hover:bg-accent/90"
        >
          Run portfolio impact
        </Link>
      </div>
    </aside>
  );
}

function describeShock(s: Signal): string[] {
  const out: string[] = [];
  const sh = s.shock;
  for (const [k, v] of Object.entries(sh.rates_bps)) {
    out.push(`${k} rates ${v > 0 ? '+' : ''}${v} bps`);
  }
  for (const [k, v] of Object.entries(sh.credit_spread_bps)) {
    out.push(`${k.toUpperCase()} spreads ${v > 0 ? '+' : ''}${v} bps`);
  }
  for (const [k, v] of Object.entries(sh.equity_pct)) {
    out.push(`equity ${k.replace(/_/g, ' ')} ${v > 0 ? '+' : ''}${v}%`);
  }
  for (const [k, v] of Object.entries(sh.sector_overlay_pct)) {
    out.push(`${k} overlay ${v > 0 ? '+' : ''}${v}%`);
  }
  for (const [k, v] of Object.entries(sh.fx_pct_vs_usd)) {
    out.push(`${k} vs USD ${v > 0 ? '+' : ''}${v}%`);
  }
  if (sh.gold_pct) {
    out.push(`gold ${sh.gold_pct > 0 ? '+' : ''}${sh.gold_pct}%`);
  }
  if (sh.brent_pct) {
    out.push(`Brent ${sh.brent_pct > 0 ? '+' : ''}${sh.brent_pct}%`);
  }
  if (sh.vix_points) {
    out.push(`VIX ${sh.vix_points > 0 ? '+' : ''}${sh.vix_points} pts`);
  }
  return out;
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-2">
      <span className="text-ink-2">{label}</span>
      {children}
    </div>
  );
}
