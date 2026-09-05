import { useQuery } from '@tanstack/react-query';
import { ClientListResponse } from '@jb/contracts';
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJson } from '@/lib/api';

interface Props {
  value: string;
  /** Builds the route for a chosen client. */
  to: (clientId: string) => string;
}

/** Compact client switcher used in Customer-view page headers. */
export function ClientPicker({ value, to }: Props): JSX.Element {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['clients'],
    queryFn: () => getJson('/api/v1/clients', ClientListResponse),
  });
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-muted">
      Client
      <select
        className="rounded border border-line bg-surface px-2 py-1 text-[13px] text-ink"
        value={value}
        onChange={(e) => {
          void navigate(to(e.target.value));
        }}
      >
        {(q.data?.clients ?? [{ clientId: value, name: value }]).map((c) => (
          <option key={c.clientId} value={c.clientId}>
            {c.name} · {c.clientId}
          </option>
        ))}
      </select>
    </label>
  );
}
