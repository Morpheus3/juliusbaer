import type { JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { useMeta } from '@/lib/meta';

/** Sends a client-scoped route to the dataset's first client once the meta is known. */
export function DefaultClientRedirect({ to }: { to: (clientId: string) => string }): JSX.Element {
  const meta = useMeta();
  if (meta.isPending) {
    return <p className="text-muted">Loading…</p>;
  }
  const clientId = meta.isError ? null : meta.data.defaultClientId;
  if (clientId === null) {
    return (
      <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
        No dataset is loaded. Run the seed and refresh.
      </div>
    );
  }
  return <Navigate to={to(clientId)} replace />;
}
