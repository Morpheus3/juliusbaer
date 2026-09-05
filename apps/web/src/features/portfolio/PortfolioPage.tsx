import { useQuery } from '@tanstack/react-query';
import { ClientOverviewResponse, type SnapshotDate } from '@jb/contracts';
import type { JSX } from 'react';
import { Link, NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { ClientPicker } from '@/components/ClientPicker';
import { PageHeader } from '@/components/PageHeader';
import { getJson } from '@/lib/api';
import { useMeta } from '@/lib/meta';

const TABS = [
  { to: '', label: 'Overview' },
  { to: 'holdings', label: 'Holdings' },
  { to: 'exposure', label: 'Exposure' },
  { to: 'transactions', label: 'Transactions' },
  { to: 'cashflows', label: 'Cash flows' },
] as const;

export function useSnapshotParam(): [SnapshotDate, (d: SnapshotDate) => void, string[]] {
  const meta = useMeta();
  const dates = meta.data?.snapshots.map((x) => x.date) ?? [];
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('snapshot');
  const snap = raw && dates.includes(raw) ? raw : (meta.data?.current ?? '');
  return [
    snap,
    (d) => {
      const next = new URLSearchParams(sp);
      next.set('snapshot', d);
      setSp(next, { replace: true });
    },
    dates,
  ];
}

export function SnapshotSelect({
  value,
  onChange,
  options,
}: {
  value: SnapshotDate;
  onChange: (d: SnapshotDate) => void;
  options: string[];
}): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-muted">
      As of
      <select
        className="rounded border border-line bg-surface px-2 py-1 font-mono text-[12.5px] text-ink"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {options.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Portfolio deep dive (L2/L3) shell with tabs. Wireframe slide 03. */
export function PortfolioPage(): JSX.Element {
  const { clientId = '' } = useParams();
  const q = useQuery({
    queryKey: ['overview', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/overview`, ClientOverviewResponse),
  });

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        eyebrow="Customer view · L2"
        title={
          <>
            <Link to={`/clients/${clientId}`} className="text-ink no-underline hover:text-accent">
              {q.data?.client.name ?? clientId}
            </Link>
            <span className="mx-2 text-line-2">/</span>Portfolio deep dive
          </>
        }
        right={<ClientPicker value={clientId} to={(id) => `/clients/${id}/portfolio`} />}
      />
      <nav className="mb-4 flex gap-1 border-b border-line" aria-label="Portfolio sections">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === ''}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 text-[13px] no-underline ${isActive ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ clientId, overview: q.data }} />
    </div>
  );
}
