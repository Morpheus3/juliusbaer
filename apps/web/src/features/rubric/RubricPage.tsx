import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AuditResponse,
  RubricAssessmentResponse,
  type Dimension,
  type DimensionResult,
  type RubricDefinition,
  type RubricScore,
} from '@jb/contracts';
import { useState, type JSX, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { ApiError, getJson } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useClockDate } from '@/state/clock';

async function post<T>(url: string, body: unknown, parse: (v: unknown) => T): Promise<T> {
  // Only declare a JSON body when there is one: Fastify rejects an empty body with a JSON content-type.
  const headers: Record<string, string> = { accept: 'application/json' };
  const init: RequestInit = { method: 'POST', headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
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

/** Customer risk rubric (L2/L3). Wireframe slide 06. */
export function RubricPage(): JSX.Element {
  const { clientId = '' } = useParams();
  const clock = useClockDate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['rubric', clientId],
    queryFn: async () => {
      try {
        return await getJson(`/api/v1/clients/${clientId}/rubric`, RubricAssessmentResponse);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return null;
        }
        throw e;
      }
    },
  });
  const assess = useMutation({
    mutationFn: () =>
      post(`/api/v1/clients/${clientId}/rubric/assess?clock=${clock}`, undefined, (v) =>
        RubricAssessmentResponse.parse(v),
      ),
    onSuccess: (d) => {
      qc.setQueryData(['rubric', clientId], d);
      void qc.invalidateQueries({ queryKey: ['audit', clientId] });
    },
  });
  const lock = useMutation({
    mutationFn: () =>
      post(`/api/v1/clients/${clientId}/rubric/lock`, undefined, (v) =>
        RubricAssessmentResponse.parse(v),
      ),
    onSuccess: (d) => {
      qc.setQueryData(['rubric', clientId], d);
      void qc.invalidateQueries({ queryKey: ['audit', clientId] });
    },
  });
  const [auditOpen, setAuditOpen] = useState(false);
  const d = q.data ?? null;

  return (
    <div className="max-w-[1500px]">
      <PageHeader
        eyebrow="Customer view · L2"
        title={
          <>
            Customer risk rubric
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
        right={
          <>
            <button
              type="button"
              onClick={() => {
                setAuditOpen((o) => !o);
              }}
              className="rounded border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-2 hover:bg-surface-2"
            >
              Audit history
            </button>
            <button
              type="button"
              disabled={assess.isPending}
              onClick={() => {
                assess.mutate();
              }}
              className="rounded bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white disabled:bg-surface-2 disabled:text-muted"
            >
              {assess.isPending ? 'Assessing…' : d ? 'Re-assess' : 'Run assessment'}
            </button>
          </>
        }
      >
        {d && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <span>
              Last scored {fmtDateTime(d.createdAt)} at clock {d.clock}
            </span>
            <Pill tone={d.status === 'locked' ? 'ok' : 'neutral'}>
              {d.status === 'locked' ? `Locked by ${d.lockedBy ?? ''}` : 'Draft'}
            </Pill>
            <Pill tone={d.llmMode === 'live' ? 'ok' : d.llmMode === 'recorded' ? 'info' : 'warn'}>
              LLM assessor {d.llmMode}
            </Pill>
            <span className="font-mono text-[11px]">
              {Object.entries(d.engineVersions)
                .map(([k, v]) => `${k} ${v}`)
                .join(' · ')}
            </span>
          </div>
        )}
      </PageHeader>

      {assess.isError && (
        <div className="mb-4 rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {assess.error.message}
        </div>
      )}
      {q.isPending && <p className="text-muted">Loading…</p>}
      {q.isError && (
        <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {q.error.message}
        </div>
      )}
      {q.data === null && !assess.isPending && (
        <div className="rounded-md border border-dashed border-line-2 px-4 py-10 text-center text-muted">
          No assessment yet for {clientId}. Run one to score Capacity, Appetite and Horizon from the
          customer vector.
        </div>
      )}

      {auditOpen && <AuditDrawer clientId={clientId} />}

      {d && (
        <div className="space-y-4">
          {d.dimensions.map((dim, i) => (
            <DimensionCard
              key={dim.dimension}
              index={i + 1}
              dim={dim}
              def={d.definitions.find((x) => x.dimension === dim.dimension)}
              clientId={clientId}
              locked={d.status === 'locked'}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="font-semibold text-ink">Overall risk profile:</span>
              {d.dimensions.map((dim) => (
                <span key={dim.dimension} className="text-ink-2">
                  {label(dim.dimension)}:{' '}
                  <span className="tnum font-mono font-semibold text-ink">
                    {dim.effectiveScore}/3
                  </span>
                  {dim.overrideScore !== null && (
                    <span className="ml-1 text-[11px] text-brass">
                      (RM override from {dim.systemScore})
                    </span>
                  )}
                </span>
              ))}
              <span className="text-muted">
                · file says {d.stated.riskProfile} {d.stated.riskScore}/10, {d.stated.horizonYears}
                -year horizon
              </span>
            </div>
            <div className="flex items-center gap-2">
              {d.mismatches.map((m) => (
                <Pill
                  key={m.kind}
                  tone={
                    m.severity === 'critical' ? 'crit' : m.severity === 'warning' ? 'warn' : 'info'
                  }
                >
                  {m.kind === 'PORTFOLIO_RISK_EXCEEDS_APPETITE'
                    ? 'Mismatch: portfolio risk exceeds Appetite'
                    : m.kind === 'STATED_VS_OBSERVED_APPETITE'
                      ? 'Mismatch: stated vs observed'
                      : m.kind === 'HORIZON_VS_CASH_NEEDS'
                        ? 'Horizon vs cash needs'
                        : 'Capacity vs leverage'}
                </Pill>
              ))}
              <button
                type="button"
                disabled={d.status === 'locked' || lock.isPending}
                onClick={() => {
                  lock.mutate();
                }}
                className="rounded bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white disabled:bg-surface-2 disabled:text-muted"
              >
                {d.status === 'locked' ? 'Locked' : 'Save and lock rubric'}
              </button>
            </div>
          </div>
          {d.mismatches.length > 0 && (
            <ul className="m-0 list-disc pl-5 text-[12.5px] text-ink-2">
              {d.mismatches.map((m) => (
                <li key={m.kind}>{m.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const label = (d: Dimension): string =>
  ({ capacity: 'Capacity', appetite: 'Appetite', horizon: 'Horizon' })[d];

function DimensionCard({
  index,
  dim,
  def,
  clientId,
  locked,
}: {
  index: number;
  dim: DimensionResult;
  def: RubricDefinition | undefined;
  clientId: string;
  locked: boolean;
}): JSX.Element {
  const [overriding, setOverriding] = useState(false);
  const [detail, setDetail] = useState(false);
  const conf = Math.round(dim.confidence.overall * 100);
  return (
    <section className="rounded-md border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-ink font-mono text-[12px] text-white">
            {index}
          </span>
          <div>
            <div className="text-[14px] font-semibold text-ink">
              {def?.title ?? label(dim.dimension)}
            </div>
            <div className="text-[11.5px] text-muted">{def?.subtitle}</div>
          </div>
          <span className="ml-3 tnum font-serif text-[28px] font-semibold text-ink">
            {dim.effectiveScore}
          </span>
          {dim.overrideScore !== null && (
            <Pill tone="brass">RM override · system said {dim.systemScore}</Pill>
          )}
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-muted">System confidence</span>
          <ConfidenceBar value={conf} />
          <button
            type="button"
            onClick={() => {
              setDetail((o) => !o);
            }}
            className="rounded border border-line px-2 py-1 text-ink-2 hover:bg-surface-2"
          >
            {detail ? 'Hide' : 'Show'} assessors
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              setOverriding(true);
            }}
            className="rounded border border-brass px-2 py-1 text-brass hover:bg-brass-soft disabled:border-line disabled:text-muted"
          >
            RM Override
          </button>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          {def?.levels.map((l) => {
            const selected = l.score === dim.effectiveScore;
            const systemPick = l.score === dim.systemScore && dim.overrideScore !== null;
            return (
              <div
                key={l.score}
                className={`rounded-md border px-3 py-2 text-[12.5px] ${selected ? 'border-accent bg-accent-soft' : 'border-line'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">
                    {l.score} — {l.label}
                  </span>
                  {selected && <Pill tone="info">Selected</Pill>}
                  {systemPick && <Pill tone="neutral">System</Pill>}
                </div>
                <p className="mb-0 mt-1 text-[11.5px] leading-snug text-ink-2">{l.description}</p>
              </div>
            );
          })}
        </div>
        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
            Observed evidence
          </div>
          <ul className="m-0 list-disc pl-4 text-[12.5px] text-ink-2">
            {dim.observedEvidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <div className="mt-2 text-[11.5px] text-muted">
            <Link to={`/clients/${clientId}/vector`}>Feature values and evidence rows →</Link>
          </div>
        </div>
      </div>

      {detail && <Assessors dim={dim} />}
      {overriding && (
        <OverrideForm
          dim={dim}
          clientId={clientId}
          def={def}
          onClose={() => {
            setOverriding(false);
          }}
        />
      )}
    </section>
  );
}

function ConfidenceBar({ value }: { value: number }): JSX.Element {
  const tone = value >= 75 ? 'bg-ok' : value >= 55 ? 'bg-warn' : 'bg-crit';
  return (
    <span className="flex items-center gap-1.5" title={`${value}% confidence`}>
      <span className="h-1.5 w-24 rounded-full bg-surface-2">
        <span className={`block h-1.5 rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </span>
      <span className="tnum font-mono text-[12px] text-ink">{value}%</span>
    </span>
  );
}

function Assessors({ dim }: { dim: DimensionResult }): JSX.Element {
  const c = dim.confidence;
  return (
    <div className="grid grid-cols-4 gap-3 border-t border-line bg-surface-2/50 px-4 py-3 text-[12px]">
      <Box title="Rules assessor" score={dim.rules.score}>
        <div className="text-muted">raw {dim.rules.raw}</div>
        <ul className="m-0 mt-1 list-none space-y-1 p-0">
          {dim.rules.contributions.map((x) => (
            <li key={x.rule} className="flex justify-between gap-2">
              <span className="text-ink-2" title={x.note}>
                {x.rule}{' '}
                <span className="font-mono text-[10.5px] text-muted">
                  {x.feature}={x.value ?? 'n/a'}
                </span>
              </span>
              <span
                className={`tnum font-mono ${x.effect < 0 ? 'text-crit' : x.effect > 0 ? 'text-ok' : 'text-muted'}`}
              >
                {x.effect > 0 ? '+' : ''}
                {x.effect}
              </span>
            </li>
          ))}
        </ul>
      </Box>
      <Box title="Statistical assessor" score={dim.statistical.score}>
        <div className="text-muted">{dim.statistical.model}</div>
        <div className="mt-1 flex gap-2">
          {Object.entries(dim.statistical.probabilities).map(([k, p]) => (
            <span key={k} className="tnum font-mono">
              P({k})={(p * 100).toFixed(0)}%
            </span>
          ))}
        </div>
        <div className="mt-1 text-muted">
          trained on {dim.statistical.training.archetype_samples} archetype samples, seed{' '}
          {dim.statistical.training.seed}, hold-out accuracy{' '}
          {(dim.statistical.training.holdout_accuracy * 100).toFixed(1)}%. Knows only what the
          archetypes encode.
        </div>
        <div className="mt-1 text-ink-2">
          Top features:{' '}
          {dim.statistical.top_features
            .map((t) => `${t.feature} (${(t.importance * 100).toFixed(0)}%)`)
            .join(', ')}
        </div>
      </Box>
      <Box title="LLM assessor" score={dim.llm.score} status={dim.llm.status}>
        {dim.llm.status === 'ok' ? (
          <>
            <p className="m-0 text-ink-2">{dim.llm.rationale}</p>
            <ul className="m-0 mt-1 list-disc pl-4 text-ink-2">
              {dim.llm.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            {dim.llm.caveats.length > 0 && (
              <div className="mt-1 text-muted">Caveats: {dim.llm.caveats.join(' ')}</div>
            )}
            <div className="mt-1 font-mono text-[10.5px] text-muted">
              {dim.llm.model} · trace {dim.llm.traceId}
            </div>
          </>
        ) : (
          <p className="m-0 text-warn">{dim.llm.note}</p>
        )}
      </Box>
      <Box title="Confidence breakdown" score={null}>
        <Row k="Agreement (45%)" v={c.agreement} />
        <Row k="Statistical (25%)" v={c.statistical} />
        <Row k="Data quality (15%)" v={c.dataQuality} />
        <Row k="Freshness (15%)" v={c.freshness} />
        <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink">
          <span>Overall</span>
          <span className="tnum font-mono">{Math.round(c.overall * 100)}%</span>
        </div>
        <ul className="m-0 mt-1 list-disc pl-4 text-[11px] text-muted">
          {c.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Box>
    </div>
  );
}

function Box({
  title,
  score,
  status,
  children,
}: {
  title: string;
  score: RubricScore | null;
  status?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
          {title}
        </span>
        {score !== null ? (
          <span className="tnum font-serif text-[18px] font-semibold text-ink">{score}</span>
        ) : status ? (
          <Pill tone="warn">{status}</Pill>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }): JSX.Element {
  return (
    <div className="flex justify-between text-ink-2">
      <span>{k}</span>
      <span className="tnum font-mono">{Math.round(v * 100)}%</span>
    </div>
  );
}

function OverrideForm({
  dim,
  clientId,
  def,
  onClose,
}: {
  dim: DimensionResult;
  clientId: string;
  def: RubricDefinition | undefined;
  onClose: () => void;
}): JSX.Element {
  const qc = useQueryClient();
  const [score, setScore] = useState<RubricScore>(dim.effectiveScore);
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () =>
      post(
        `/api/v1/clients/${clientId}/rubric/override`,
        { dimension: dim.dimension, score, reason },
        (v) => RubricAssessmentResponse.parse(v),
      ),
    onSuccess: (d) => {
      qc.setQueryData(['rubric', clientId], d);
      void qc.invalidateQueries({ queryKey: ['audit', clientId] });
      onClose();
    },
  });
  return (
    <div className="border-t border-brass/40 bg-brass-soft/60 px-4 py-3 text-[12.5px]">
      <div className="mb-2 font-semibold text-ink">
        RM override for {label(dim.dimension)} — system score {dim.systemScore}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex rounded border border-line bg-surface">
          {([1, 2, 3] as RubricScore[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setScore(s);
              }}
              className={`px-3 py-1.5 ${score === s ? 'bg-ink text-white' : 'text-ink-2'}`}
            >
              {s} · {def?.levels.find((l) => l.score === s)?.label ?? ''}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
          placeholder="Reason (at least 10 characters). This is written to the audit log with your RM id."
          className="min-h-[60px] flex-1 rounded border border-line bg-surface px-2 py-1 text-[12.5px]"
        />
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={reason.trim().length < 10 || m.isPending}
            onClick={() => {
              m.mutate();
            }}
            className="rounded bg-brass px-3 py-1.5 font-medium text-white disabled:bg-surface-2 disabled:text-muted"
          >
            Record override
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-line bg-surface px-3 py-1.5 text-ink-2"
          >
            Cancel
          </button>
        </div>
      </div>
      {m.isError && <div className="mt-2 text-crit">{m.error.message}</div>}
    </div>
  );
}

function AuditDrawer({ clientId }: { clientId: string }): JSX.Element {
  const q = useQuery({
    queryKey: ['audit', clientId],
    queryFn: () => getJson(`/api/v1/audit?clientId=${clientId}`, AuditResponse),
  });
  return (
    <Panel title="Audit history" className="mb-4">
      {q.data?.events.length === 0 && (
        <p className="m-0 text-[12.5px] text-muted">No events yet for this client.</p>
      )}
      <ul className="m-0 list-none divide-y divide-line p-0 text-[12.5px]">
        {q.data?.events.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 py-1.5">
            <span>
              <Pill
                tone={
                  e.kind === 'RUBRIC_OVERRIDE'
                    ? 'brass'
                    : e.kind === 'RUBRIC_LOCKED'
                      ? 'ok'
                      : 'info'
                }
              >
                {e.kind.replace(/_/g, ' ').toLowerCase()}
              </Pill>
              <span className="ml-2 text-ink-2">{e.summary}</span>
            </span>
            <span className="whitespace-nowrap font-mono text-[11px] text-muted">
              {e.actor} · {fmtDateTime(e.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
