import { useQuery } from '@tanstack/react-query';
import { TransactionsResponse } from '@jb/contracts';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router-dom';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';

const TONE: Record<string, 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'brass'> = {
  Dividend: 'ok',
  Coupon: 'ok',
  Interest: 'ok',
  Distribution: 'ok',
  'Management Fee': 'neutral',
  'Interest Charge': 'neutral',
  Withdrawal: 'warn',
  'Capital Call': 'warn',
  'Facility Drawdown': 'crit',
  'Structured Product Subscription': 'brass',
  Buy: 'info',
  'Redemption Request': 'warn',
  'Transfer In': 'info',
  'Valuation Update': 'neutral',
};

export function TransactionsTab(): JSX.Element {
  const { clientId = '' } = useParams();
  const [type, setType] = useState('all');
  const q = useQuery({
    queryKey: ['transactions', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/transactions`, TransactionsResponse),
  });
  if (q.isPending) {
    return <p className="text-muted">Loading…</p>;
  }
  if (q.isError) {
    return <div className="text-crit">{q.error.message}</div>;
  }
  const rows = q.data.rows.filter((r) => type === 'all' || r.type === type);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Chip
          active={type === 'all'}
          onClick={() => {
            setType('all');
          }}
        >
          All · {q.data.rows.length}
        </Chip>
        {q.data.types.map((t) => (
          <Chip
            key={t}
            active={type === t}
            onClick={() => {
              setType(t);
            }}
          >
            {t} · {q.data.rows.filter((r) => r.type === t).length} ·{' '}
            {fmtUsdCompact(q.data.totalsUsdByType[t] ?? 0)}
          </Chip>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface-2 text-[10.5px] uppercase tracking-[0.08em] text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Date</th>
              <th className="px-3 py-2 text-left font-semibold">Type</th>
              <th className="px-3 py-2 text-left font-semibold">Portfolio</th>
              <th className="px-3 py-2 text-left font-semibold">Instrument</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 text-right font-semibold">USD</th>
              <th className="px-3 py-2 text-left font-semibold">Narrative</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.transactionId} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{fmtDate(t.tradeDate)}</td>
                <td className="px-3 py-1.5">
                  <Pill tone={TONE[t.type] ?? 'neutral'}>{t.type}</Pill>
                </td>
                <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-2">{t.portfolioId}</td>
                <td className="px-3 py-1.5 text-ink-2">
                  {t.instrumentName ?? <span className="text-muted">—</span>}
                </td>
                <td
                  className={`tnum whitespace-nowrap px-3 py-1.5 text-right font-mono ${t.amount < 0 ? 'text-crit' : 'text-ok'}`}
                >
                  {t.currency} {t.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </td>
                <td
                  className={`tnum px-3 py-1.5 text-right font-mono ${t.amountUsd < 0 ? 'text-crit' : 'text-ok'}`}
                >
                  {fmtUsdCompact(t.amountUsd)}
                </td>
                <td className="max-w-[420px] px-3 py-1.5 text-[12px] text-ink-2">{t.narrative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12px] ${active ? 'border-transparent bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}
    >
      {children}
    </button>
  );
}
