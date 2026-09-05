import type { RankedAction } from '@jb/contracts';
import { useState, type JSX } from 'react';
import { Pill } from '@/components/Pill';
import { fmtDateTime } from '@/lib/format';
import { useDecide } from './riskApi';

export function DecisionButtons({
  clientId,
  id,
  entityType,
  decision,
  blocked,
  approveLabel = 'RM Approve and Log',
}: {
  clientId: string;
  id: string;
  entityType: 'action' | 'trade_idea';
  decision: RankedAction['decision'];
  blocked: boolean;
  approveLabel?: string;
}): JSX.Element {
  const m = useDecide(clientId);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  if (decision) {
    return (
      <div className="text-right text-[11.5px] text-muted">
        <Pill tone={decision.decision === 'approved' ? 'ok' : 'neutral'}>{decision.decision}</Pill>
        <div className="mt-0.5">
          {decision.actor} · {fmtDateTime(decision.at)}
        </div>
        {decision.note && <div className="italic">{decision.note}</div>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <button
          type="button"
          disabled={blocked || m.isPending}
          onClick={() => {
            m.mutate({ actionId: id, entityType, decision: 'approved' });
          }}
          className="rounded bg-accent px-2.5 py-1 text-[12px] font-medium text-white disabled:bg-surface-2 disabled:text-muted"
          title={blocked ? 'Blocked by a suitability rule' : ''}
        >
          {approveLabel}
        </button>
        <button
          type="button"
          disabled={m.isPending}
          onClick={() => {
            setRejecting((r) => !r);
          }}
          className="rounded border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:bg-surface-2"
        >
          Reject
        </button>
      </div>
      {rejecting && (
        <div className="flex gap-1">
          <input
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            placeholder="Reason (optional)"
            className="w-48 rounded border border-line px-2 py-1 text-[12px]"
          />
          <button
            type="button"
            onClick={() => {
              m.mutate({ actionId: id, entityType, decision: 'rejected', note: note || undefined });
            }}
            className="rounded bg-ink px-2 py-1 text-[12px] text-white"
          >
            Confirm
          </button>
        </div>
      )}
      {m.isError && <div className="text-[11px] text-crit">{m.error.message}</div>}
    </div>
  );
}
