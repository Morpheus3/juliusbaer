import type { JSX, ReactNode } from 'react';

export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'crit' | 'warn' | 'ok' | undefined;
}): JSX.Element {
  const color =
    tone === 'crit'
      ? 'text-crit'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'ok'
          ? 'text-ok'
          : 'text-ink';
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className={`tnum mt-0.5 font-serif text-[22px] font-semibold leading-tight ${color}`}>
        {value}
      </div>
      {sub !== undefined && <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}
