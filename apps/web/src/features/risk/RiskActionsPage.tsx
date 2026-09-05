import type { CombinedRiskResponse, Level, RankedAction } from '@jb/contracts';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClientPicker } from '@/components/ClientPicker';
import { CHART, EChart } from '@/components/EChart';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { Pill } from '@/components/Pill';
import { fmtDate } from '@/lib/format';
import { DecisionButtons } from './DecisionButtons';
import { useCombinedRisk } from './riskApi';
import { SuitabilityBadge } from './SuitabilityBadge';

const LEVEL_LABEL: Record<Level, string> = { low: 'Low', medium: 'Med', high: 'High' };
const URGENCY_LABEL = { now: 'Now', week: 'Next 7 days', month: 'Next 30 days' } as const;

/** Combined risk: rubric × market signal impact, ranked actions. Wireframe slide 07. */
export function RiskActionsPage(): JSX.Element {
  const { clientId = '' } = useParams();
  const q = useCombinedRisk(clientId);
  const d = q.data;
  return (
    <div className="max-w-[1500px]">
      <PageHeader
        eyebrow="Customer view · L1 / L2"
        title={
          <>
            Combined risk
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
            <ClientPicker value={clientId} to={(id) => `/clients/${id}/actions`} />
            <Link
              to={`/clients/${clientId}/trade-ideas`}
              className="rounded border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-2 no-underline hover:bg-surface-2"
            >
              Trade ideas{d ? ` (${d.tradeIdeas.length})` : ''}
            </Link>
          </>
        }
      >
        {d && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <span>Rubric:</span>
            {d.rubric ? (
              <>
                <Pill tone="info">Capacity {d.rubric.capacity}</Pill>
                <Pill tone="info">Appetite {d.rubric.appetite}</Pill>
                <Pill tone="info">Horizon {d.rubric.horizon}</Pill>
              </>
            ) : (
              <Link to={`/clients/${clientId}/rubric`}>not assessed → run the rubric</Link>
            )}
            <span className="mx-1 text-line-2">|</span>
            <span>Signal risk:</span>
            <Pill
              tone={
                d.signalRisk.level === 'high'
                  ? 'crit'
                  : d.signalRisk.level === 'medium'
                    ? 'warn'
                    : 'ok'
              }
            >
              {d.signalRisk.level.toUpperCase()}
            </Pill>
            {d.mismatches.length > 0 && <Pill tone="crit">MISMATCH</Pill>}
            <span className="ml-auto">
              clock {fmtDate(d.clock)} · positions {fmtDate(d.snapshotDate)}
            </span>
          </div>
        )}
      </PageHeader>

      {q.isPending && <p className="text-muted">Computing…</p>}
      {q.isError && (
        <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {q.error.message}
        </div>
      )}
      {d && <Body d={d} clientId={clientId} />}
    </div>
  );
}

function Body({ d, clientId }: { d: CombinedRiskResponse; clientId: string }): JSX.Element {
  const levels: Level[] = ['low', 'medium', 'high'];
  const gaugeOpt = {
    series: [
      {
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 10,
        splitNumber: 5,
        radius: '95%',
        center: ['50%', '62%'],
        axisLine: {
          lineStyle: {
            width: 14,
            color: [
              [0.4, CHART.ok],
              [0.7, CHART.warn],
              [1, CHART.crit],
            ],
          },
        },
        pointer: { length: '60%', width: 4, itemStyle: { color: CHART.ink } },
        axisTick: { show: false },
        splitLine: { length: 8, lineStyle: { color: '#fff', width: 2 } },
        axisLabel: { color: CHART.muted, fontFamily: CHART.mono, fontSize: 10, distance: 18 },
        detail: {
          valueAnimation: false,
          formatter: (v: number) => v.toFixed(1),
          color: CHART.ink,
          fontFamily: CHART.font,
          fontSize: 30,
          fontWeight: 600,
          offsetCenter: [0, '20%'],
        },
        title: {
          show: true,
          offsetCenter: [0, '55%'],
          color: CHART.muted,
          fontSize: 11,
          fontFamily: CHART.font,
        },
        data: [{ value: d.gauge.composite, name: '/10 composite risk' }],
      },
    ],
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-4">
        <Panel
          title="Decision matrix: vulnerability × severity"
          right={`current: ${d.matrix.cell}`}
        >
          <div className="grid grid-cols-[90px_repeat(3,1fr)] gap-1 text-[12px]">
            <div />
            {levels.map((c) => (
              <div
                key={c}
                className={`text-center text-[10.5px] font-semibold uppercase tracking-[0.08em] ${c === d.matrix.column ? 'text-ink' : 'text-muted'}`}
              >
                {LEVEL_LABEL[c]} signal
              </div>
            ))}
            {levels.map((r, ri) => (
              <RowCells key={r} r={r} ri={ri} d={d} />
            ))}
          </div>
          <div className="mt-3 text-[12px] text-ink-2">
            <span className="font-semibold text-ink">Current position:</span>{' '}
            {LEVEL_LABEL[d.matrix.row]} vulnerability × {LEVEL_LABEL[d.matrix.column]} signal ={' '}
            <span className="font-semibold text-crit">{d.matrix.cell}</span>
          </div>
          <details className="mt-2 text-[11.5px] text-muted">
            <summary className="cursor-pointer">Why</summary>
            <ul className="m-0 mt-1 list-disc pl-4">
              {d.vulnerability.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {d.signalRisk.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {d.notes.map((n) => (
                <li key={n} className="text-warn">
                  {n}
                </li>
              ))}
            </ul>
          </details>
        </Panel>

        <Panel title="Key facts">
          <div className="grid grid-cols-2 gap-2">
            {d.facts.map((f) => (
              <div key={f.label} className="rounded border border-line px-3 py-2" title={f.detail}>
                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                  {f.label}
                </div>
                <div
                  className={`tnum font-serif text-[18px] font-semibold ${f.tone === 'crit' ? 'text-crit' : f.tone === 'warn' ? 'text-warn' : f.tone === 'ok' ? 'text-ok' : 'text-ink'}`}
                >
                  {f.value}
                </div>
                <div className="text-[10.5px] leading-snug text-muted">{f.detail}</div>
              </div>
            ))}
          </div>
          {d.mismatches.length > 0 && (
            <ul className="m-0 mt-3 list-disc pl-4 text-[12px] text-ink-2">
              {d.mismatches.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Composite risk gauge">
          <EChart option={gaugeOpt} height={170} />
          <ul className="m-0 list-none space-y-1 p-0 text-[12px]">
            <GaugeRow label="Signal severity" v={d.gauge.parts.signalSeverity} max={4} />
            <GaugeRow label="Rubric mismatch" v={d.gauge.parts.rubricMismatch} max={3.5} />
            <GaugeRow label="Concentration" v={d.gauge.parts.concentration} max={2.5} />
          </ul>
          <details className="mt-2 text-[11px] text-muted">
            <summary className="cursor-pointer">How it is built</summary>
            <ul className="m-0 mt-1 list-disc pl-4">
              {d.gauge.explanation.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        </Panel>
      </div>

      <Panel
        title="Recommended actions: ranked by urgency"
        right={`${d.actions.length} candidates · approve or reject each; nothing executes automatically`}
      >
        {d.actions.length === 0 && (
          <p className="m-0 text-[12.5px] text-muted">
            No actions generated: no alerts, mismatches or exposed signals at this clock.
          </p>
        )}
        <ol className="m-0 list-none divide-y divide-line p-0">
          {d.actions.map((a) => (
            <ActionRow key={a.id} a={a} clientId={clientId} />
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function RowCells({ r, ri, d }: { r: Level; ri: number; d: CombinedRiskResponse }): JSX.Element {
  const levels: Level[] = ['low', 'medium', 'high'];
  const tone = (cell: string): string =>
    cell === 'URGENT'
      ? 'bg-crit text-white'
      : cell === 'Act Now'
        ? 'bg-crit-soft text-crit'
        : cell === 'Discuss'
          ? 'bg-warn-soft text-warn'
          : cell === 'Review'
            ? 'bg-info-soft text-info'
            : 'bg-ok-soft text-ok';
  return (
    <>
      <div
        className={`flex items-center text-[10.5px] font-semibold uppercase tracking-[0.08em] ${r === d.matrix.row ? 'text-ink' : 'text-muted'}`}
      >
        {LEVEL_LABEL[r]} vuln.
      </div>
      {levels.map((c, ci) => {
        const cell = d.matrix.grid[ri]?.[ci] ?? 'Review';
        const active = r === d.matrix.row && c === d.matrix.column;
        return (
          <div
            key={c}
            className={`rounded px-2 py-3 text-center text-[12px] font-medium ${tone(cell)} ${active ? 'ring-2 ring-ink ring-offset-1' : 'opacity-80'}`}
          >
            {cell}
          </div>
        );
      })}
    </>
  );
}

function GaugeRow({ label, v, max }: { label: string; v: number; max: number }): JSX.Element {
  return (
    <li className="grid grid-cols-[120px_1fr_44px] items-center gap-2">
      <span className="text-ink-2">{label}</span>
      <span className="h-1.5 rounded-full bg-surface-2">
        <span
          className="block h-1.5 rounded-full bg-accent"
          style={{ width: `${(v / max) * 100}%` }}
        />
      </span>
      <span className="tnum text-right font-mono text-[11.5px]">{v.toFixed(1)}</span>
    </li>
  );
}

function ActionRow({ a, clientId }: { a: RankedAction; clientId: string }): JSX.Element {
  const urgencyTone = a.urgency === 'now' ? 'crit' : a.urgency === 'week' ? 'warn' : 'neutral';
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)_170px] gap-4 py-3">
      <div className="grid h-8 w-8 place-items-center rounded-full bg-ink font-mono text-[13px] text-white">
        {a.rank}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-ink">{a.title}</span>
          <Pill tone={urgencyTone}>{URGENCY_LABEL[a.urgency]}</Pill>
          <Pill tone="neutral">{a.category}</Pill>
          <SuitabilityBadge s={a.suitability} />
        </div>
        <div className="mt-1 text-[12.5px] text-ink-2">
          <span className="font-medium text-ink">Evidence:</span> {a.evidence}{' '}
          <span className="font-medium text-ink">Benefit:</span> {a.benefit}{' '}
          <span className="font-medium text-ink">Trade-off:</span> {a.tradeOff}
        </div>
        <div className="mt-1 font-mono text-[10.5px] text-muted">
          score {a.score} ·{' '}
          {Object.entries(a.scoreParts)
            .map(([k, v]) => `${k} ${v.toFixed(1)}`)
            .join(' · ')}
          {a.sources.alertIds.length > 0 && ` · alerts ${a.sources.alertIds.join(', ')}`}
          {a.sources.signalIds.length > 0 && ` · signals ${a.sources.signalIds.join(', ')}`}
        </div>
      </div>
      <DecisionButtons
        clientId={clientId}
        id={a.id}
        entityType="action"
        decision={a.decision}
        blocked={a.suitability.status === 'blocked'}
      />
    </li>
  );
}
