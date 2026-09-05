import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OutreachDraft,
  WorkflowResponse,
  type ActionReview,
  type TriagedAlert,
} from '@jb/contracts';
import { useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClientPicker } from '@/components/ClientPicker';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { ApiError, getJson } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useClockDate } from '@/state/clock';

async function postJson<T>(url: string, body: unknown, parse: (v: unknown) => T): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof json === 'object' &&
      json !== null &&
      'message' in json &&
      typeof json.message === 'string'
        ? json.message
        : res.statusText;
    throw new ApiError(res.status, message);
  }
  return parse(json);
}

/** End-to-end RM workflow and interaction states. Wireframe slide 08. */
export function WorkflowPage(): JSX.Element {
  const { clientId = '' } = useParams();
  const clock = useClockDate();
  const q = useQuery({
    queryKey: ['workflow', clientId, clock],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/workflow?clock=${clock}`, WorkflowResponse),
    enabled: clientId !== '' && clock !== '',
  });
  const d = q.data;
  return (
    <div className="max-w-[1600px]">
      <PageHeader
        eyebrow="Customer view · L1 / L3"
        title={
          <>
            RM workflow
            {d && (
              <>
                <span className="mx-2 text-line-2">—</span>
                <Link
                  to={`/clients/${clientId}`}
                  className="text-ink no-underline hover:text-accent"
                >
                  {d.clientName}
                </Link>
              </>
            )}
          </>
        }
        right={<ClientPicker value={clientId} to={(id) => `/clients/${id}/workflow`} />}
      >
        <div className="mt-1 text-[12.5px] text-muted">
          No automated trading: human approval required.{' '}
          {d && `Signed in as ${d.rm.id} (RM-Level-${d.rm.level}); checker ${d.rm.checkerId}.`}
        </div>
      </PageHeader>
      {q.isPending && <p className="text-muted">Loading…</p>}
      {q.isError && (
        <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {q.error.message}
        </div>
      )}
      {d && <Body d={d} clientId={clientId} clock={clock} />}
    </div>
  );
}

function Body({
  d,
  clientId,
  clock,
}: {
  d: WorkflowResponse;
  clientId: string;
  clock: string;
}): JSX.Element {
  return (
    <div className="space-y-4">
      <ol className="m-0 grid list-none grid-cols-9 gap-1 p-0">
        {d.steps.map((s) => (
          <li
            key={s.key}
            className={`rounded-md border px-2 py-2 text-center ${s.status === 'done' ? 'border-ok/40 bg-ok-soft/40' : s.status === 'current' ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}
          >
            <Link to={s.link} className="no-underline">
              <div
                className={`mx-auto grid h-6 w-6 place-items-center rounded-full font-mono text-[11px] ${s.status === 'done' ? 'bg-ok text-white' : s.status === 'current' ? 'bg-accent text-white' : 'bg-surface-2 text-muted'}`}
              >
                {s.status === 'done' ? '✓' : s.index}
              </div>
              <div className="mt-1 text-[11.5px] font-medium text-ink">{s.title}</div>
              <div className="text-[10px] leading-snug text-muted">{s.detail}</div>
            </Link>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-3 gap-4">
        <Panel
          title="Alert triage"
          right={
            d.stale.isStale ? (
              <Pill tone="warn">Stale data warning</Pill>
            ) : (
              <span>{d.stale.detail}</span>
            )
          }
        >
          {d.stale.isStale && (
            <div className="mb-2 rounded border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] text-warn">
              {d.stale.detail}
            </div>
          )}
          <ul className="m-0 list-none divide-y divide-line p-0">
            {d.alerts.map((a) => (
              <TriageRow key={a.id} a={a} clientId={clientId} />
            ))}
            {d.alerts.length === 0 && (
              <li className="py-4 text-center text-[12px] text-muted">No alerts.</li>
            )}
          </ul>
        </Panel>

        <Panel title="Recommendation review" right={`${d.reviews.length} approved`}>
          {d.reviews.length === 0 && (
            <p className="m-0 text-[12.5px] text-muted">
              Approve an action on the{' '}
              <Link to={`/clients/${clientId}/actions`}>combined risk page</Link> to bring it here
              for review.
            </p>
          )}
          <div className="space-y-3">
            {d.reviews.map((r) => (
              <ReviewCard key={r.action.id} r={r} clientId={clientId} />
            ))}
          </div>
        </Panel>

        <OutreachPanel d={d} clientId={clientId} clock={clock} />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {d.guardrails.map((g) => (
          <div
            key={g.name}
            className={`rounded-md border px-3 py-2 ${g.status === 'active' ? 'border-ok/40' : g.status === 'warning' ? 'border-warn/50 bg-warn-soft/40' : 'border-line'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-ink">{g.name}</span>
              <Pill
                tone={g.status === 'active' ? 'ok' : g.status === 'warning' ? 'warn' : 'neutral'}
              >
                {g.status}
              </Pill>
            </div>
            <div className="text-[11px] text-muted">{g.detail}</div>
          </div>
        ))}
      </div>
      <p className="m-0 text-[11.5px] text-muted">
        Audit trail: all actions, approvals, overrides and client communications are timestamped in
        the compliance log. <Link to={`/audit?client=${clientId}`}>Open the audit trail →</Link>
      </p>
    </div>
  );
}

function TriageRow({ a, clientId }: { a: TriagedAlert; clientId: string }): JSX.Element {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [dismissing, setDismissing] = useState(false);
  const m = useMutation({
    mutationFn: (body: { decision: 'triaged' | 'dismissed'; reason?: string }) =>
      postJson(`/api/v1/clients/${clientId}/alerts/${a.id}/triage`, body, () => undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflow', clientId] });
      void qc.invalidateQueries({ queryKey: ['overview', clientId] });
      void qc.invalidateQueries({ queryKey: ['book'] });
    },
  });
  const tone = a.severity === 'high' ? 'crit' : a.severity === 'medium' ? 'warn' : 'neutral';
  return (
    <li className={`py-2 text-[12.5px] ${a.triage?.decision === 'dismissed' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Pill tone={tone}>{a.severity.toUpperCase()}</Pill>{' '}
          <span className="font-medium text-ink">{a.title}</span>
          <div className="text-[11.5px] text-ink-2">{a.detail}</div>
        </div>
        {a.triage ? (
          <div className="whitespace-nowrap text-right text-[11px] text-muted">
            <Pill tone={a.triage.decision === 'triaged' ? 'info' : 'neutral'}>
              {a.triage.decision}
            </Pill>
            <div>{fmtDateTime(a.triage.at)}</div>
            {a.triage.reason && <div className="italic">{a.triage.reason}</div>}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1">
              <button
                type="button"
                disabled={m.isPending}
                onClick={() => {
                  m.mutate({ decision: 'triaged' });
                }}
                className="rounded bg-accent px-2 py-0.5 text-[11.5px] text-white"
              >
                Triage
              </button>
              <button
                type="button"
                onClick={() => {
                  setDismissing((x) => !x);
                }}
                className="rounded border border-line px-2 py-0.5 text-[11.5px] text-ink-2"
              >
                Dismiss
              </button>
            </div>
            {dismissing && (
              <div className="flex gap-1">
                <input
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                  }}
                  placeholder="Reason"
                  className="w-40 rounded border border-line px-2 py-0.5 text-[11.5px]"
                />
                <button
                  type="button"
                  disabled={reason.trim().length < 3}
                  onClick={() => {
                    m.mutate({ decision: 'dismissed', reason });
                  }}
                  className="rounded bg-ink px-2 py-0.5 text-[11.5px] text-white disabled:bg-surface-2 disabled:text-muted"
                >
                  Confirm
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function ReviewCard({ r, clientId }: { r: ActionReview; clientId: string }): JSX.Element {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (body: { decision: 'approved' | 'rejected'; note?: string }) =>
      postJson(`/api/v1/clients/${clientId}/actions/${r.action.id}/check`, body, () => undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflow', clientId] });
    },
  });
  return (
    <div className={`rounded-md border px-3 py-2 ${r.canProceed ? 'border-ok/40' : 'border-line'}`}>
      <div className="text-[13px] font-semibold text-ink">{r.action.title}</div>
      <ul className="m-0 mt-1 list-none space-y-0.5 p-0 text-[11.5px]">
        {r.checks.map((c) => (
          <li key={c.name} className="flex gap-2">
            <span
              className={
                c.status === 'ok' ? 'text-ok' : c.status === 'pending' ? 'text-warn' : 'text-crit'
              }
            >
              {c.status === 'ok' ? '✓' : c.status === 'pending' ? '◔' : '✗'}
            </span>
            <span>
              <span className="font-medium text-ink">{c.name}:</span>{' '}
              <span className="text-ink-2">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between">
        {r.requiresChecker && !r.checker ? (
          <div className="flex gap-1">
            <button
              type="button"
              disabled={m.isPending}
              onClick={() => {
                m.mutate({ decision: 'approved' });
              }}
              className="rounded border border-accent px-2 py-0.5 text-[11.5px] text-accent hover:bg-accent-soft"
            >
              Checker approve
            </button>
            <button
              type="button"
              disabled={m.isPending}
              onClick={() => {
                m.mutate({ decision: 'rejected', note: 'Checker declined' });
              }}
              className="rounded border border-line px-2 py-0.5 text-[11.5px] text-ink-2"
            >
              Checker reject
            </button>
          </div>
        ) : (
          <span />
        )}
        <Pill tone={r.canProceed ? 'ok' : 'warn'}>
          {r.canProceed ? 'Approve and proceed: cleared' : 'Not yet clear to proceed'}
        </Pill>
      </div>
    </div>
  );
}

function OutreachPanel({
  d,
  clientId,
  clock,
}: {
  d: WorkflowResponse;
  clientId: string;
  clock: string;
}): JSX.Element {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<'email' | 'call-notes' | 'message'>('email');
  const [editing, setEditing] = useState<{ id: string; subject: string; body: string } | null>(
    null,
  );
  const draft = useMutation({
    mutationFn: () =>
      postJson(`/api/v1/clients/${clientId}/outreach/draft?clock=${clock}`, { channel }, (v) =>
        OutreachDraft.parse(v),
      ),
    onSuccess: (o) => {
      setEditing({ id: o.id, subject: o.subject, body: o.body });
      void qc.invalidateQueries({ queryKey: ['workflow', clientId] });
    },
  });
  const send = useMutation({
    mutationFn: (e: { id: string; subject: string; body: string }) =>
      postJson(
        `/api/v1/clients/${clientId}/outreach/${e.id}/send`,
        { subject: e.subject, body: e.body },
        (v) => OutreachDraft.parse(v),
      ),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['workflow', clientId] });
      void qc.invalidateQueries({ queryKey: ['audit', clientId] });
    },
  });
  const latest = d.outreach[0];
  const current =
    editing ??
    (latest?.status === 'draft'
      ? { id: latest.id, subject: latest.subject, body: latest.body }
      : null);
  const meta = d.outreach.find((o) => o.id === current?.id);
  return (
    <Panel
      title="Client outreach preview"
      right={
        <div className="flex items-center gap-1">
          <select
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value as 'email' | 'call-notes' | 'message');
            }}
            className="rounded border border-line bg-surface px-1 py-0.5 text-[11.5px]"
          >
            <option value="email">Email</option>
            <option value="call-notes">Call notes</option>
            <option value="message">Secure message</option>
          </select>
          <button
            type="button"
            disabled={draft.isPending}
            onClick={() => {
              draft.mutate();
            }}
            className="rounded bg-accent px-2 py-0.5 text-[11.5px] text-white disabled:bg-surface-2 disabled:text-muted"
          >
            {draft.isPending ? 'Drafting…' : 'Draft with Claude'}
          </button>
        </div>
      }
    >
      {draft.isError && <div className="mb-2 text-[12px] text-crit">{draft.error.message}</div>}
      {!current && (
        <p className="m-0 text-[12.5px] text-muted">
          No draft yet. Drafts are written in the client's reporting language ({d.reportingLanguage}
          ) from approved actions and the signals behind them; you edit, then send and log.
        </p>
      )}
      {current && (
        <div className="space-y-2 text-[12.5px]">
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
            <span>
              To: <span className="text-ink">{d.clientName}</span>
            </span>
            {meta && (
              <>
                <Pill tone={meta.source === 'claude' ? 'ok' : 'warn'}>
                  {meta.source === 'claude' ? `Claude · ${meta.language}` : 'template · English'}
                </Pill>
                {meta.llmTraceId && (
                  <span className="font-mono">trace {meta.llmTraceId.slice(0, 8)}</span>
                )}
              </>
            )}
          </div>
          <input
            value={current.subject}
            onChange={(e) => {
              setEditing({ ...current, subject: e.target.value });
            }}
            className="w-full rounded border border-line px-2 py-1 text-[12.5px] font-medium"
            aria-label="Subject"
          />
          <textarea
            value={current.body}
            onChange={(e) => {
              setEditing({ ...current, body: e.target.value });
            }}
            className="min-h-[220px] w-full rounded border border-line px-2 py-1 font-sans text-[12.5px] leading-relaxed"
            aria-label="Body"
          />
          {meta && meta.caveats.length > 0 && (
            <ul className="m-0 list-disc pl-4 text-[11px] text-warn">
              {meta.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {meta && meta.factsUsed.length > 0 && (
            <div className="text-[11px] text-muted">Facts used: {meta.factsUsed.join(' · ')}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={send.isPending}
              onClick={() => {
                send.mutate(current);
              }}
              className="rounded bg-ink px-3 py-1 text-[12px] font-medium text-white"
            >
              Send and log
            </button>
            <button
              type="button"
              onClick={() => {
                draft.mutate();
              }}
              className="rounded border border-line px-3 py-1 text-[12px] text-ink-2"
            >
              Redraft
            </button>
          </div>
          {send.isError && <div className="text-[12px] text-crit">{send.error.message}</div>}
        </div>
      )}
      {d.outreach.filter((o) => o.status === 'sent').length > 0 && (
        <div className="mt-3 border-t border-line pt-2 text-[11.5px] text-muted">
          Sent:{' '}
          {d.outreach
            .filter((o) => o.status === 'sent')
            .map((o) => `"${o.subject}" (${fmtDateTime(o.sentAt ?? o.createdAt)})`)
            .join(' · ')}
        </div>
      )}
    </Panel>
  );
}
