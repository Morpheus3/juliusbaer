import type { JSX } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useMeta } from '@/lib/meta';
import { clientIdFromPath, useClientContext } from '@/state/clientContext';
import { ClaudeKeyPanel } from './ClaudeKeyPanel';

interface Entry {
  to: string;
  label: string;
  hint: string;
  /** Match any route under `to`, not only the exact path. */
  prefix?: boolean;
}

const BOOK_ROOMS: Entry[] = [
  { to: '/board', label: 'Mandate & collateral', hint: 'Bands · LTV across the book' },
  { to: '/signals', label: 'Market signals', hint: 'Event log replay' },
  { to: '/audit', label: 'Audit & data quality', hint: 'Register and log' },
];

/** Client rooms, relative to the client in context. */
const CLIENT_ROOMS: { path: string; label: string; hint: string }[] = [
  { path: 'portfolio', label: 'Portfolio deep dive', hint: 'Holdings · exposure · cash flows' },
  { path: 'impact', label: 'Signal impact', hint: 'Stress waterfall' },
  { path: 'rubric', label: 'Risk rubric', hint: 'Capacity · Appetite · Horizon' },
  { path: 'actions', label: 'Risk & actions', hint: 'Matrix and ranked actions' },
  { path: 'trade-ideas', label: 'Trade ideas', hint: 'Signals × portfolio × rubric' },
  { path: 'workflow', label: 'Workflow & approvals', hint: 'Triage · review · outreach · log' },
  { path: 'vector', label: 'Customer vector', hint: 'Factual record · behavioural features' },
];

function Item({ e, end = true }: { e: Entry; end?: boolean }): JSX.Element {
  return (
    <li>
      <NavLink
        to={e.to}
        end={e.prefix ? false : end}
        className={({ isActive }) =>
          [
            'block border-l-2 px-5 py-2 no-underline transition-colors',
            isActive
              ? 'border-brass bg-rail-2 text-white'
              : 'border-transparent text-rail-ink hover:bg-rail-2/60',
          ].join(' ')
        }
      >
        <div className="text-[13.5px] font-medium">{e.label}</div>
        <div className="text-[11.5px] text-rail-muted">{e.hint}</div>
      </NavLink>
    </li>
  );
}

function GroupTitle({ children }: { children: string }): JSX.Element {
  return (
    <div className="px-5 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-rail-muted">
      {children}
    </div>
  );
}

/**
 * The rail is a corridor, not a module list: Today, the client in context, then the rooms folded
 * away. Room links are relative to the client in context so switching client never resets them.
 */
export function Rail(): JSX.Element {
  const meta = useMeta();
  const { pathname } = useLocation();
  const last = useClientContext((s) => s.lastClientId);
  const user = useAuth((s) => s.user);
  const isHead = user?.roles.some((r) => r === 'team_head' || r === 'admin') ?? false;
  const clientId = clientIdFromPath(pathname) ?? last ?? meta.data?.defaultClientId ?? null;
  const clientBase = clientId ? `/clients/${encodeURIComponent(clientId)}` : null;
  const inRoom =
    BOOK_ROOMS.some((r) => pathname.startsWith(r.to)) ||
    (clientBase !== null &&
      pathname.startsWith(`${clientBase}/`) &&
      CLIENT_ROOMS.some((r) => pathname.startsWith(`${clientBase}/${r.path}`)));

  return (
    <nav
      aria-label="Navigation"
      className="flex h-full flex-col overflow-y-auto bg-rail text-rail-ink"
    >
      <div className="flex items-center gap-3 px-5 pb-3 pt-5">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-brass font-serif text-[13px] font-semibold text-rail">
          PB
        </div>
        <div>
          <div className="font-serif text-[15px] font-semibold leading-tight text-white">
            RM Workbench
          </div>
          <div className="text-[11px] text-rail-muted">
            {meta.data?.rm.desk ?? 'Private Banking'}
          </div>
        </div>
      </div>

      <ul className="m-0 mt-2 list-none p-0">
        <Item e={{ to: '/book', label: 'Today', hint: 'Brief · call sheet · lanes' }} />
        <Item e={{ to: '/ideas', label: 'Ideas', hint: 'Which clients fit · opportunities' }} />
        {isHead && (
          <Item
            e={{
              to: '/team',
              label: 'Team',
              hint: 'Risk · conduct · coverage · signatures · the machine',
            }}
          />
        )}
        <Item
          e={{
            to: clientBase ?? '/client',
            label: 'Client journey',
            hint: clientId ? `${clientId} in context · ⌘K to switch` : 'Pick from the book',
          }}
        />
      </ul>

      <details open={inRoom} className="group">
        <summary className="cursor-pointer list-none px-5 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-rail-muted hover:text-rail-ink">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
          Rooms
        </summary>
        <GroupTitle>Book</GroupTitle>
        <ul className="m-0 list-none p-0">
          {BOOK_ROOMS.map((e) => (
            <Item key={e.to} e={e} end={false} />
          ))}
        </ul>
        <GroupTitle>Client</GroupTitle>
        <ul className="m-0 list-none p-0">
          {CLIENT_ROOMS.map((r) => (
            <Item
              key={r.path}
              e={{
                to: clientBase ? `${clientBase}/${r.path}` : `/${r.path}`,
                label: r.label,
                hint: r.hint,
              }}
              end={false}
            />
          ))}
        </ul>
      </details>

      <div className="mt-auto">
        <ClaudeKeyPanel />
      </div>
      <div className="px-5 py-4 text-[11px] leading-relaxed text-rail-muted">
        {meta.data?.datasetName ?? 'No dataset loaded'}
        <br />
        No automated trading. RM approval required.
      </div>
    </nav>
  );
}
