import type { JSX, ReactNode } from 'react';

export type Tone = 'crit' | 'warn' | 'ok' | 'info' | 'brass' | 'neutral';

const TONE: Record<Tone, string> = {
  crit: 'bg-crit-soft text-crit',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  info: 'bg-info-soft text-info',
  brass: 'bg-brass-soft text-brass',
  neutral: 'bg-surface-2 text-ink-2',
};

export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}): JSX.Element {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold leading-relaxed ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
