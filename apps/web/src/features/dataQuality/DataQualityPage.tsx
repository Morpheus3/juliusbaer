import type { JSX, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AuditResponse,
  DataQualitySummary,
  type DataQualityCode,
  type DataQualitySeverity,
} from '@jb/contracts';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Pill } from '@/components/Pill';
import { fmtDateTime } from '@/lib/format';
import { getJson } from '@/lib/api';

const CODE_LABEL: Record<DataQualityCode, string> = {
  STALE_VALUATION: 'Stale valuation',
  MISSING_COST_BASIS: 'Missing cost basis',
  ENTITY_WITHOUT_AGE: 'Entity client',
  CUSTODY_OUTSIDE_MANDATE: 'Custody outside mandate',
  KYC_OVERDUE: 'KYC overdue',
  KYC_DUE_SOON: 'KYC due soon',
  MISSING_SECTOR: 'Missing sector',
  PRIVATE_MARKET_MARK_LAG: 'Private-market mark lag',
  AUM_RECONCILIATION: 'AUM reconciliation',
  WEIGHT_SUM: 'Weights do not sum to 100',
  LTV_RECOMPUTE: 'LTV recompute',
  COMMITMENT_ARITHMETIC: 'Commitment arithmetic',
  ORPHAN_REFERENCE: 'Orphan reference',
  SUSTAINABILITY_EXCLUSION_HELD: 'Excluded instrument held',
};

const SEV_CLASS: Record<DataQualitySeverity, string> = {
  error: 'bg-crit-soft text-crit',
  warning: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
};

/** L3 · the data-quality register written by the loader. */
export function DataQualityPage(): JSX.Element {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'register' ? 'register' : 'audit';
  const setTab = (t: 'audit' | 'register'): void => {
    const next = new URLSearchParams(sp);
    next.set('tab', t);
    setSp(next, { replace: true });
  };
  return (
    <div className="max-w-6xl">
      <div className="mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brass">
          RM view · L3
        </div>
        <h1 className="font-serif text-[26px] font-semibold text-ink">Audit &amp; data quality</h1>
        <nav className="mt-2 flex gap-1 border-b border-line" aria-label="Audit sections">
          {(['audit', 'register'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
              }}
              className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${tab === t ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {t === 'audit' ? 'Audit trail' : 'Data-quality register'}
            </button>
          ))}
        </nav>
      </div>
      {tab === 'audit' ? <AuditTrail clientId={sp.get('client')} /> : <Register />}
    </div>
  );
}

function AuditTrail({ clientId }: { clientId: string | null }): JSX.Element {
  const [kind, setKind] = useState('all');
  const q = useQuery({
    queryKey: ['audit', clientId ?? 'all'],
    queryFn: () =>
      getJson(`/api/v1/audit${clientId ? `?clientId=${clientId}` : ''}`, AuditResponse),
    refetchInterval: 15_000,
  });
  const events = (q.data?.events ?? []).filter((e) => kind === 'all' || e.kind === kind);
  const kinds = [...new Set((q.data?.events ?? []).map((e) => e.kind))].sort();
  return (
    <div className="space-y-3">
      <p className="m-0 max-w-3xl text-[13.5px] text-ink-2">
        Every assessment, override, lock, approval, rejection, triage, draft and send is recorded
        with its actor and timestamp. The log is append-only.
        {clientId && (
          <>
            {' '}
            Showing <span className="font-mono">{clientId}</span> ·{' '}
            <Link to="/audit">all clients</Link>
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            setKind('all');
          }}
          className={`rounded-full border px-3 py-1 text-[12px] ${kind === 'all' ? 'border-transparent bg-ink text-white' : 'border-line bg-surface text-ink-2'}`}
        >
          All · {q.data?.events.length ?? 0}
        </button>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
            }}
            className={`rounded-full border px-3 py-1 text-[12px] ${kind === k ? 'border-transparent bg-ink text-white' : 'border-line bg-surface text-ink-2'}`}
          >
            {k.replace(/_/g, ' ').toLowerCase()} ·{' '}
            {(q.data?.events ?? []).filter((e) => e.kind === k).length}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface-2 text-[10.5px] uppercase tracking-[0.08em] text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">When</th>
              <th className="px-3 py-2 text-left font-semibold">Event</th>
              <th className="px-3 py-2 text-left font-semibold">Actor</th>
              <th className="px-3 py-2 text-left font-semibold">Client</th>
              <th className="px-3 py-2 text-left font-semibold">Summary</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11.5px] text-muted">
                  {fmtDateTime(e.createdAt)}
                </td>
                <td className="px-3 py-1.5">
                  <Pill
                    tone={
                      e.kind.includes('REJECTED') || e.kind.includes('DISMISSED')
                        ? 'neutral'
                        : ['APPROVED', 'LOCKED', 'SENT'].some((k) => e.kind.includes(k))
                          ? 'ok'
                          : e.kind.includes('OVERRIDE')
                            ? 'brass'
                            : 'info'
                    }
                  >
                    {e.kind.replace(/_/g, ' ').toLowerCase()}
                  </Pill>
                </td>
                <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-2">{e.actor}</td>
                <td className="px-3 py-1.5 font-mono text-[11.5px]">
                  {e.clientId ? <Link to={`/clients/${e.clientId}`}>{e.clientId}</Link> : '—'}
                </td>
                <td className="px-3 py-1.5 text-ink-2">{e.summary}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  No events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Register(): JSX.Element {
  const [severity, setSeverity] = useState<DataQualitySeverity | 'all'>('all');
  const q = useQuery({
    queryKey: ['data-quality'],
    queryFn: () => getJson('/api/v1/data-quality', DataQualitySummary),
  });

  if (q.isPending) {
    return <p className="text-muted">Loading the register…</p>;
  }
  if (q.isError) {
    return (
      <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
        Could not load the register: {q.error.message}
      </div>
    );
  }

  const { total, bySeverity, byCode, issues } = q.data;
  const shown = severity === 'all' ? issues : issues.filter((i) => i.severity === severity);
  const codes = (Object.keys(byCode) as DataQualityCode[]).filter((c) => byCode[c] > 0);

  return (
    <div className="max-w-6xl">
      <div className="mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brass">
          RM view · L3
        </div>
        <h1 className="font-serif text-[26px] font-semibold text-ink">Audit &amp; data quality</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] text-ink-2">
          Artefacts detected when the dataset was loaded. Each is attached to the client it affects
          and will appear as a caveat beside any figure it touches. The register is rebuilt on every
          load.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterChip
          active={severity === 'all'}
          onClick={() => {
            setSeverity('all');
          }}
        >
          All · {total}
        </FilterChip>
        {(['error', 'warning', 'info'] as const).map((s) => (
          <FilterChip
            key={s}
            active={severity === s}
            onClick={() => {
              setSeverity(s);
            }}
            tone={s}
          >
            {s} · {bySeverity[s]}
          </FilterChip>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 lg:grid-cols-4">
        {codes.map((c) => (
          <div key={c} className="rounded-md border border-line bg-surface px-4 py-3">
            <div className="text-[12.5px] font-medium text-ink">{CODE_LABEL[c]}</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="tnum font-serif text-[22px] font-semibold">{byCode[c]}</span>
              <span className="font-mono text-[10.5px] text-muted">{c}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.08em] text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Severity</th>
              <th className="px-3 py-2 text-left font-semibold">Check</th>
              <th className="px-3 py-2 text-left font-semibold">Client</th>
              <th className="px-3 py-2 text-left font-semibold">Entity</th>
              <th className="px-3 py-2 text-left font-semibold">Finding</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id} className="border-t border-line align-top">
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEV_CLASS[i.severity]}`}
                  >
                    {i.severity}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink-2">{CODE_LABEL[i.code]}</td>
                <td className="px-3 py-2 font-mono text-[12px] text-ink-2">{i.clientId ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-[11.5px] text-muted">
                  {i.entityType} · {i.entityId}
                </td>
                <td className="px-3 py-2 text-ink-2">{i.message}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  No findings at this severity.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: DataQualitySeverity;
  children: ReactNode;
}): JSX.Element {
  const base = 'rounded-full border px-3 py-1 text-[12px] font-medium capitalize transition-colors';
  const cls = active
    ? tone
      ? `${SEV_CLASS[tone]} border-transparent`
      : 'border-transparent bg-ink text-white'
    : 'border-line bg-surface text-ink-2 hover:bg-surface-2';
  return (
    <button type="button" onClick={onClick} className={`${base} ${cls}`}>
      {children}
    </button>
  );
}
