import type { JSX, ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  right,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brass">
          {eyebrow}
        </div>
        <h1 className="m-0 font-serif text-[26px] font-semibold leading-tight text-ink">{title}</h1>
        {children}
      </div>
      {right !== undefined && <div className="flex items-center gap-3">{right}</div>}
    </div>
  );
}
