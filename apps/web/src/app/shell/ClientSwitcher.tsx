import { useQuery } from '@tanstack/react-query';
import { ClientListResponse } from '@jb/contracts';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { useBook } from '@/lib/book';
import { fmtUsdCompact } from '@/lib/format';
import { switchClientPath } from '@/state/clientContext';

interface Row {
  clientId: string;
  name: string;
  bookingCentre: string;
  aumUsd: number;
  urgencyScore: number | null;
  reason: string | null;
}

/**
 * Command-K client switcher. Clients come ranked by urgency with the same one-line reason as the
 * cockpit; choosing one keeps the current room, so comparing two clients is one keystroke.
 */
export function ClientSwitcher({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const book = useBook();
  const list = useQuery({
    queryKey: ['clients'],
    queryFn: () => getJson('/api/v1/clients', ClientListResponse),
    enabled: open && book.data === undefined,
  });
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const rows = useMemo<Row[]>(() => {
    if (book.data) {
      return book.data.clients.map((c) => ({
        clientId: c.clientId,
        name: c.name,
        bookingCentre: c.bookingCentre,
        aumUsd: c.aumUsd,
        urgencyScore: c.urgencyScore,
        reason: c.topItem,
      }));
    }
    return (list.data?.clients ?? []).map((c) => ({
      clientId: c.clientId,
      name: c.name,
      bookingCentre: c.bookingCentre,
      aumUsd: c.totalAumUsd,
      urgencyScore: null,
      reason: null,
    }));
  }, [book.data, list.data]);

  const needle = text.trim().toLowerCase();
  const shown = needle
    ? rows.filter(
        (r) => r.name.toLowerCase().includes(needle) || r.clientId.toLowerCase().includes(needle),
      )
    : rows;

  useEffect(() => {
    if (open) {
      setText('');
      setCursor(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);
  useEffect(() => {
    setCursor(0);
  }, [needle]);

  if (!open) {
    return null;
  }
  const go = (id: string): void => {
    onClose();
    void navigate(switchClientPath(pathname, search, id));
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-ink/40 pt-[12vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Switch client"
        className="w-[640px] max-w-[92vw] overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <input
          ref={input}
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, shown.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter') {
              const r = shown[cursor];
              if (r) {
                go(r.clientId);
              }
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          placeholder="Switch client — type a name or id, ranked by urgency"
          className="w-full border-b border-line bg-surface px-4 py-3 text-[14px] text-ink outline-none"
        />
        <ul className="m-0 max-h-[56vh] list-none overflow-y-auto p-0">
          {shown.length === 0 && (
            <li className="px-4 py-3 text-[13px] text-muted">
              {rows.length === 0 ? 'Loading clients…' : 'No client matches.'}
            </li>
          )}
          {shown.map((r, i) => (
            <li key={r.clientId}>
              <button
                type="button"
                onMouseEnter={() => {
                  setCursor(i);
                }}
                onClick={() => {
                  go(r.clientId);
                }}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === cursor ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
              >
                <span className="w-6 shrink-0 font-mono text-[11px] text-muted">
                  {r.urgencyScore !== null ? i + 1 : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {r.name}{' '}
                    <span className="font-mono text-[11px] font-normal text-muted">
                      {r.clientId}
                    </span>
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {r.bookingCentre} · {fmtUsdCompact(r.aumUsd)}
                    {r.reason ? ` · ${r.reason}` : ''}
                  </span>
                </span>
                {r.urgencyScore !== null && (
                  <Pill
                    tone={r.urgencyScore >= 20 ? 'crit' : r.urgencyScore >= 10 ? 'warn' : 'neutral'}
                  >
                    urgency {r.urgencyScore}
                  </Pill>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-2 text-[11.5px] text-muted">
          ↑↓ to move · Enter to open in the current room · Esc to close
        </div>
      </div>
    </div>
  );
}
