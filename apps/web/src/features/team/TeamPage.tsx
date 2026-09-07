import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TeamResponse, type TeamRmRow } from '@jb/contracts';
import { useState, type JSX, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Kpi } from '@/components/Kpi';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { getJson, postJson } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtUsdCompact } from '@/lib/format';
import { useClockDate } from '@/state/clock';
import { z } from 'zod';

const Controls = z.object({ paused: z.boolean(), reason: z.string().nullable() });

/**
 * The team head's Monday: five panels that each lead to an action (a call, a conversation with an
 * RM, a reassignment, a signature, help), plus ideas landing and the machine. Everything is
 * aggregated by RM under the caller's scope; an RM sees only their own row.
 */
export function TeamPage(): JSX.Element {
  const clock = useClockDate();
  const user = useAuth((s) => s.user);
  const q = useQuery({
    queryKey: ['team', clock],
    queryFn: () => getJson(`/api/v1/team?clock=${clock}`, TeamResponse),
    enabled: clock !== '',
    placeholderData: (p) => p,
  });
  const [showMethod, setShowMethod] = useState(false);
  const d = q.data;
  const totals = (d?.rms ?? []).reduce(
    (t, r) => ({
      clients: t.clients + r.clients,
      aum: t.aum + r.aumUsd,
      now: t.now + r.items.now,
      esc: t.esc + r.escalated,
    }),
    { clients: 0, aum: 0, now: 0, esc: 0 },
  );

  return (
    <div className="max-w-[1600px]">
      <PageHeader
        eyebrow={`Manager view · ${user?.scope === 'all' ? 'the bank' : user?.scope === 'team' ? 'the team' : 'own book'}`}
        title="Monday"
        right={
          d && (
            <span className="flex items-center gap-3 text-[12.5px] text-muted">
              clock {fmtDate(d.clock)} · {d.rms.length} RM{d.rms.length === 1 ? '' : 's'}
              <button
                type="button"
                onClick={() => {
                  setShowMethod((v) => !v);
                }}
                className="text-accent"
              >
                {showMethod ? 'Hide method' : 'How this is counted'}
              </button>
            </span>
          )
        }
      >
        <p className="mb-0 mt-1 text-[12.5px] text-muted">
          Where is the risk, where is the conduct risk, is the book covered, what needs my
          signature, who is drowning, and is the machine behaving.
        </p>
      </PageHeader>
      {showMethod && d && (
        <ol className="m-0 mb-4 space-y-1 rounded border border-line bg-surface-2 px-4 py-2 pl-8 text-[12px] text-ink-2">
          {d.method.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ol>
      )}
      {q.isPending && <p className="text-muted">Aggregating the team…</p>}
      {q.isError && (
        <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {q.error.message}
        </div>
      )}
      {d && (
        <div className="space-y-4">
          <div className="grid grid-cols-6 gap-3">
            <Kpi
              label="Clients in scope"
              value={String(totals.clients)}
              sub={`${d.rms.length} RM${d.rms.length === 1 ? '' : 's'}`}
            />
            <Kpi label="AUM" value={fmtUsdCompact(totals.aum)} sub="at the snapshot" />
            <Kpi
              label="Act now"
              value={String(totals.now)}
              tone={totals.now > 0 ? 'crit' : 'ok'}
              sub="items across the team"
            />
            <Kpi
              label="Escalated"
              value={String(totals.esc)}
              tone={totals.esc > 0 ? 'warn' : 'ok'}
              sub="since the previous snapshot"
            />
            <Kpi
              label="Needs my signature"
              value={String(d.approvals.length)}
              tone={d.approvals.length > 0 ? 'warn' : 'ok'}
              sub="approved, no checker yet"
            />
            <Kpi
              label="Agents"
              value={d.machine.agentsPaused ? 'Paused' : d.machine.autonomyLevel}
              tone={d.machine.agentsPaused ? 'crit' : 'ok'}
              sub={`${d.machine.llmCallsToday} model calls today`}
            />
          </div>

          <Panel title="Risk this morning" right="by RM · the ten worst households on the right">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
              <RmTable
                rows={d.rms}
                cols={[
                  ['Clients', (r) => String(r.clients)],
                  ['AUM', (r) => fmtUsdCompact(r.aumUsd)],
                  ['Urgency', (r) => String(r.urgencySum)],
                  ['Now / 7d / 30d', (r) => `${r.items.now} / ${r.items.week} / ${r.items.month}`],
                  ['Escalated', (r) => String(r.escalated)],
                  [
                    'Themes',
                    (r) =>
                      r.themes
                        .slice(0, 3)
                        .map((t) => `${t.theme} ${t.count}`)
                        .join(' · '),
                  ],
                ]}
              />
              <ol className="m-0 list-none divide-y divide-line p-0 text-[12.5px]">
                {d.worst.map((w, i) => (
                  <li key={w.clientId} className="flex items-start gap-2 py-1.5">
                    <span className="w-4 font-mono text-[11px] text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={w.link}
                        className="font-medium text-ink no-underline hover:text-accent"
                      >
                        {w.clientName}
                      </Link>
                      <span className="text-muted"> · {w.rmId}</span>
                      <div className="truncate text-[12px] text-ink-2">{w.topItem ?? '—'}</div>
                    </div>
                    <Pill
                      tone={
                        w.urgencyScore >= 20 ? 'crit' : w.urgencyScore >= 10 ? 'warn' : 'neutral'
                      }
                    >
                      {w.urgencyScore}
                    </Pill>
                  </li>
                ))}
              </ol>
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-4">
            <Panel title="Conduct" right="overrides this month · breaches · KYC · ageing messages">
              <RmTable
                rows={d.rms}
                cols={[
                  [
                    'Overrides / assessments',
                    (r) =>
                      `${r.overrides} / ${r.assessments}${r.assessments ? ` (${Math.round((r.overrides / r.assessments) * 100)}%)` : ''}`,
                  ],
                  ['Client-directed breaches', (r) => String(r.clientDirectedBreaches)],
                  ['Exclusions breached', (r) => String(r.exclusionsBreached)],
                  ['KYC overdue', (r) => String(r.kycOverdue)],
                  ['Unanswered > 2d', (r) => String(r.unansweredOver2d)],
                ]}
              />
              {d.overrides.length > 0 && (
                <ul className="m-0 mt-3 list-none space-y-1 border-t border-line p-0 pt-2 text-[12px]">
                  {d.overrides.slice(0, 5).map((o) => (
                    <li key={`${o.clientId}-${o.dimension}-${o.at}`}>
                      <Link
                        to={`/clients/${o.clientId}/rubric`}
                        className="font-medium text-ink no-underline hover:text-accent"
                      >
                        {o.clientName}
                      </Link>
                      <span className="text-ink-2">
                        {' '}
                        · {o.dimension} {o.systemScore} → {o.overrideScore} · “{o.reason}”
                      </span>
                      <span className="text-muted"> · {o.rmId}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 border-t border-line pt-2 text-[12px]">
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-2">
                  Explainability sample · three at random
                </div>
                {d.explainabilitySample.map((s) => (
                  <div key={`${s.clientId}-${s.at}`} className="truncate">
                    <Link to={s.link} className="text-ink no-underline hover:text-accent">
                      {s.clientName}
                    </Link>
                    <span className="font-mono text-[10.5px] text-brass"> {s.kind}</span>{' '}
                    <span className="text-ink-2">{s.summary}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Coverage" right="cadence from the call policy">
              <RmTable
                rows={d.rms}
                cols={[
                  ['Within cadence', (r) => `${r.withinCadence} / ${r.clients}`],
                  ['Silent 90 days', (r) => String(r.uncontacted90)],
                  ['Reviews last 12m', (r) => `${r.reviewsLast12m} / ${r.clients}`],
                  ['Promises past due', (r) => String(r.promisesOverdue)],
                ]}
              />
            </Panel>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Panel title="Needs my signature" right="oldest first">
              <ul className="m-0 list-none divide-y divide-line p-0 text-[12.5px]">
                {d.approvals.map((a) => (
                  <li
                    key={`${a.clientId}-${a.actionId}`}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <div className="min-w-0">
                      <Link
                        to={a.link}
                        className="font-medium text-ink no-underline hover:text-accent"
                      >
                        {a.clientName}
                      </Link>
                      <span className="text-muted">
                        {' '}
                        · {a.rmId} · approved {fmtDateTime(a.approvedAt)}
                      </span>
                    </div>
                    <Pill tone={a.ageingDays > 2 ? 'crit' : a.ageingDays > 0 ? 'warn' : 'ok'}>
                      {a.ageingDays} d
                    </Pill>
                  </li>
                ))}
                {d.approvals.length === 0 && (
                  <li className="py-2 text-muted">Nothing waiting for a checker.</li>
                )}
              </ul>
            </Panel>
            <Panel title="Capacity" right="from the call plan">
              <RmTable
                rows={d.rms}
                cols={[
                  ['Calls today', (r) => String(r.callsToday)],
                  ['Calls later', (r) => String(r.callsLater)],
                  ['Deferrals', (r) => String(r.deferrals)],
                  ['Fee transactions YTD', (r) => Math.round(r.feesYtdUsd).toLocaleString('en-US')],
                ]}
              />
              <p className="m-0 mt-2 text-[11.5px] text-muted">
                Fee transactions are summed in their local currencies as a proxy. Needs a feed:{' '}
                {d.needsFeed.join('; ')}.
              </p>
            </Panel>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Panel title="Ideas landing" right="last 60 days">
              <table className="w-full text-[12px]">
                <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                  <tr>
                    <th className="py-1 text-left font-semibold">Signal</th>
                    <th className="py-1 text-right font-semibold">Reached</th>
                    <th className="py-1 text-right font-semibold">Drafted</th>
                    <th className="py-1 text-right font-semibold">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {d.uptake.map((u) => (
                    <tr key={u.signalId} className="border-t border-line">
                      <td className="py-1 pr-2 text-ink-2">{u.title.slice(0, 70)}</td>
                      <td className="tnum py-1 text-right font-mono">{u.reached}</td>
                      <td className="tnum py-1 text-right font-mono">{u.drafted}</td>
                      <td className="tnum py-1 text-right font-mono">{u.sent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <MachinePanel d={d} />
          </div>
        </div>
      )}
    </div>
  );
}

function RmTable({
  rows,
  cols,
}: {
  rows: TeamRmRow[];
  cols: [string, (r: TeamRmRow) => string][];
}): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
          <tr>
            <th className="py-1 text-left font-semibold">RM</th>
            {cols.map(([h]) => (
              <th key={h} className="py-1 pl-3 text-right font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rmId} className="border-t border-line">
              <td className="py-1.5 pr-2">
                <span className="font-medium text-ink">{r.name}</span>{' '}
                <span className="font-mono text-[10.5px] text-muted">{r.rmId}</span>
              </td>
              {cols.map(([h, f]) => (
                <td key={h} className="tnum py-1.5 pl-3 text-right font-mono text-ink-2">
                  {f(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MachinePanel({ d }: { d: TeamResponse }): JSX.Element {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const canPause = user?.roles.some((r) => r === 'team_head' || r === 'admin') ?? false;
  const m = d.machine;
  const toggle = useMutation({
    mutationFn: (paused: boolean) =>
      postJson(
        '/api/v1/team/agents',
        { paused, reason: paused ? 'Paused from the team page' : undefined },
        Controls,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
  return (
    <Panel
      title="The machine"
      right={
        canPause ? (
          <button
            type="button"
            disabled={toggle.isPending}
            onClick={() => {
              toggle.mutate(!m.agentsPaused);
            }}
            className={`rounded px-2.5 py-1 text-[12px] font-semibold text-white ${m.agentsPaused ? 'bg-ok' : 'bg-crit'}`}
          >
            {m.agentsPaused ? 'Resume agents' : 'Pause all agents'}
          </button>
        ) : (
          <span>{m.agentsPaused ? 'agents paused' : `agents at ${m.autonomyLevel}`}</span>
        )
      }
    >
      <div className="grid grid-cols-3 gap-2 text-[12.5px]">
        <Stat label="Gateway" value={m.gatewayMode} />
        <Stat
          label="Model calls today"
          value={`${m.llmCallsToday}`}
          sub={`${m.llmErrorsToday} errors`}
        />
        <Stat
          label="Tasks from language"
          value={`${m.assistantConfirmations}`}
          sub={`${m.gateBlocks} gate blocks`}
        />
      </div>
      <div className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-2">
        Shadow mode · agreement per playbook · L2 needs{' '}
        {Math.round(m.agreementThresholdForL2 * 100)}% over {m.minimumGradesForL2} grades
      </div>
      <ul className="m-0 mt-1 list-none divide-y divide-line p-0 text-[12.5px]">
        {m.shadow.map((s) => (
          <li key={s.playbookId} className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-ink">{s.name}</span>
            <span className="flex items-center gap-2">
              <span className="tnum font-mono text-[12px] text-ink-2">
                {s.grades} grade{s.grades === 1 ? '' : 's'}
                {s.agreement !== null ? ` · ${Math.round(s.agreement * 100)}% agree` : ''}
              </span>
              <Pill tone={s.readyForL2 ? 'ok' : 'neutral'}>
                {s.readyForL2 ? 'ready for L2' : 'L1'}
              </Pill>
            </span>
          </li>
        ))}
      </ul>
      {m.tracesByPrompt.length > 0 && (
        <div className="mt-2 text-[11.5px] text-muted">
          Prompts today: {m.tracesByPrompt.map((p) => `${p.promptId} ${p.count}`).join(' · ')}
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }): JSX.Element {
  return (
    <div className="rounded border border-line px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="font-serif text-[18px] font-semibold text-ink">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export type { ReactNode };
