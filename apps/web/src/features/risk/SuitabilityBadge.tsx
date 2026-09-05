import type { Suitability } from '@jb/contracts';
import { useState, type JSX } from 'react';
import { Pill } from '@/components/Pill';

export function SuitabilityBadge({ s }: { s: Suitability }): JSX.Element {
  const [open, setOpen] = useState(false);
  const label =
    s.status === 'ok' ? 'Suitability OK' : s.status === 'review' ? 'Pending review' : 'Blocked';
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="m-0 border-0 bg-transparent p-0"
      >
        <Pill tone={s.status === 'ok' ? 'ok' : s.status === 'review' ? 'warn' : 'crit'}>
          {label}
        </Pill>
      </button>
      {open && (
        <ul className="absolute right-0 z-10 mt-1 w-80 list-none space-y-1 rounded border border-line bg-surface p-2 text-left text-[11.5px] shadow-lg">
          {s.checks.map((c) => (
            <li key={c.rule} className="flex gap-2">
              <span className={c.passed ? 'text-ok' : 'text-crit'}>{c.passed ? '✓' : '✗'}</span>
              <span>
                <span className="font-medium text-ink">{c.rule}</span>{' '}
                <span className="text-ink-2">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
