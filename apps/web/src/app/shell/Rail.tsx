import type { JSX } from 'react';
import { NavLink } from 'react-router-dom';

interface Module {
  to: string;
  label: string;
  hint: string;
}

const RM_VIEW: Module[] = [
  { to: '/book', label: 'Book cockpit', hint: 'Now · 7 days · 30 days' },
  { to: '/signals', label: 'Market signals', hint: 'Event log replay' },
  { to: '/audit', label: 'Audit & data quality', hint: 'Register and log' },
];

const CUSTOMER_VIEW: Module[] = [
  { to: '/impact', label: 'Signal impact', hint: 'Stress waterfall' },
  { to: '/rubric', label: 'Risk rubric', hint: 'Capacity · Appetite · Horizon' },
  { to: '/actions', label: 'Risk & actions', hint: 'Matrix and ranked actions' },
  { to: '/vector', label: 'Customer vector', hint: 'Factual record · behavioural features' },
];

function Group({ title, items }: { title: string; items: Module[] }): JSX.Element {
  return (
    <div>
      <div className="px-5 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-rail-muted">
        {title}
      </div>
      <ul className="m-0 list-none p-0">
        {items.map((m) => (
          <li key={m.to}>
            <NavLink
              to={m.to}
              className={({ isActive }) =>
                [
                  'block border-l-2 px-5 py-2 no-underline transition-colors',
                  isActive
                    ? 'border-brass bg-rail-2 text-white'
                    : 'border-transparent text-rail-ink hover:bg-rail-2/60',
                ].join(' ')
              }
            >
              <div className="text-[13.5px] font-medium">{m.label}</div>
              <div className="text-[11.5px] text-rail-muted">{m.hint}</div>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Rail(): JSX.Element {
  return (
    <nav aria-label="Modules" className="flex h-full flex-col bg-rail text-rail-ink">
      <div className="flex items-center gap-3 px-5 pb-3 pt-5">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-brass font-serif text-[13px] font-semibold text-rail">
          PB
        </div>
        <div>
          <div className="font-serif text-[15px] font-semibold leading-tight text-white">
            RM Workbench
          </div>
          <div className="text-[11px] text-rail-muted">Private Banking · Asia desk</div>
        </div>
      </div>
      <Group title="RM view" items={RM_VIEW} />
      <Group title="Customer view" items={CUSTOMER_VIEW} />
      <div className="mt-auto px-5 py-4 text-[11px] leading-relaxed text-rail-muted">
        Synthetic SingHacks 2026 data.
        <br />
        No automated trading. RM approval required.
      </div>
    </nav>
  );
}
