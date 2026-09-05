import type { JSX, ReactNode } from 'react';

export function Panel({
  title,
  right,
  children,
  className = '',
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section className={`rounded-md border border-line bg-surface ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
          {title}
        </h2>
        {right !== undefined && <div className="text-[12px] text-muted">{right}</div>}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
