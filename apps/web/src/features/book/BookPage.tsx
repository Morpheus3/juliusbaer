import type { JSX, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClientListResponse } from '@jb/contracts';
import { Link } from 'react-router-dom';
import { getJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';

/**
 * Iteration 0 stand-in for the book cockpit: the twenty clients as loaded. The horizon
 * lanes and urgency ranking arrive in iteration 6.
 */
export function BookPage(): JSX.Element {
  const q = useQuery({
    queryKey: ['clients'],
    queryFn: () => getJson('/api/v1/clients', ClientListResponse),
  });

  if (q.isPending) {
    return <p className="text-muted">Loading the book…</p>;
  }
  if (q.isError) {
    return (
      <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
        Could not load clients: {q.error.message}
      </div>
    );
  }

  const { clients, asOf } = q.data;
  const totalAum = clients.reduce((s, c) => s + c.totalAumUsd, 0);

  return (
    <div className="max-w-6xl">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brass">
            RM view · L1
          </div>
          <h1 className="font-serif text-[26px] font-semibold text-ink">Book cockpit</h1>
        </div>
        <div className="text-[12.5px] text-muted">As of {fmtDate(asOf)}</div>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-3">
        <Kpi label="Clients" value={String(clients.length)} />
        <Kpi label="Book AUM" value={fmtUsdCompact(totalAum)} />
        <Kpi label="Portfolios" value={String(clients.reduce((s, c) => s + c.portfolioCount, 0))} />
        <Kpi label="UHNW" value={String(clients.filter((c) => c.wealthBand === 'UHNW').length)} />
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.08em] text-muted">
            <tr>
              <Th>Client</Th>
              <Th>Centre</Th>
              <Th>Profile</Th>
              <Th className="text-right">Score</Th>
              <Th className="text-right">Horizon</Th>
              <Th>Liquidity</Th>
              <Th className="text-right">AUM (USD)</Th>
              <Th>KYC due</Th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.clientId} className="border-t border-line hover:bg-surface-2/60">
                <td className="px-3 py-2">
                  <Link
                    to={`/clients/${c.clientId}`}
                    className="font-medium text-ink no-underline hover:text-accent"
                  >
                    {c.name}
                  </Link>
                  <div className="font-mono text-[11px] text-muted">
                    {c.clientId} · {c.isEntity ? 'Entity' : `${c.age ?? '—'} yrs`} · {c.lifeStage}
                  </div>
                </td>
                <td className="px-3 py-2 text-ink-2">{c.bookingCentre}</td>
                <td className="px-3 py-2 text-ink-2">{c.riskProfile}</td>
                <td className="tnum px-3 py-2 text-right font-mono text-[12px]">
                  {c.riskToleranceScore}/10
                </td>
                <td className="tnum px-3 py-2 text-right font-mono text-[12px]">
                  {c.investmentHorizonYears}y
                </td>
                <td className="px-3 py-2 text-ink-2">{c.liquidityNeeds}</td>
                <td className="tnum px-3 py-2 text-right font-mono text-[12px]">
                  {fmtUsdCompact(c.totalAumUsd)}
                </td>
                <td className="px-3 py-2 text-ink-2">{fmtDate(c.kycReviewDue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="tnum mt-1 font-serif text-[24px] font-semibold text-ink">{value}</div>
    </div>
  );
}

function Th({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return <th className={`px-3 py-2 text-left font-semibold ${className}`}>{children}</th>;
}
