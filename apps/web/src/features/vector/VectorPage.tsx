import { useQuery } from '@tanstack/react-query';
import {
  ClientVectorResponse,
  type ClientFactual,
  type FeatureManifestEntry,
  type FeatureValue,
  type PeerRef,
} from '@jb/contracts';
import { useState, type JSX, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClientPicker } from '@/components/ClientPicker';
import { Pill } from '@/components/Pill';
import { getJson } from '@/lib/api';
import { fmtDate, fmtUsdCompact } from '@/lib/format';
import { RUBRIC_LABEL, RUBRIC_TONE, fmtFeature, groupBy } from './format';

/**
 * Customer vector explorer (L3). Left: the factual record as the file states it.
 * Right: the behavioural vector with book percentiles, evidence on demand, and nearest peers.
 */
export function VectorPage(): JSX.Element {
  const { clientId = '' } = useParams();
  const q = useQuery({
    queryKey: ['vector', clientId],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/vector`, ClientVectorResponse),
  });

  return (
    <div className="max-w-[1400px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brass">
            Customer view · L3
          </div>
          <h1 className="font-serif text-[26px] font-semibold text-ink">Customer vector</h1>
        </div>
        <ClientPicker value={clientId} to={(id) => `/clients/${id}/vector`} />
      </div>

      {q.isPending && <p className="text-muted">Computing…</p>}
      {q.isError && (
        <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
          {q.error.message}
        </div>
      )}
      {q.data && <VectorBody data={q.data} />}
    </div>
  );
}

function VectorBody({ data }: { data: ClientVectorResponse }): JSX.Element {
  const byName = new Map(data.manifest.map((m) => [m.name, m]));
  const values = new Map(data.features.map((f) => [f.name, f]));
  const groups = groupBy(data.manifest, (m) => m.group);
  return (
    <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-6">
      <aside className="space-y-4">
        <Factual f={data.factual} />
      </aside>
      <section className="space-y-4">
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>
            {data.features.length} behavioural features · engine {data.run.engineVersion} · computed{' '}
            {new Date(data.run.createdAt).toLocaleString('en-GB')}
          </span>
          <span>Percentile bars rank this client among the 20 in the book.</span>
        </div>
        {groups.map(([group, entries]) => (
          <FeatureGroup key={group} title={group} entries={entries} values={values} />
        ))}
        <Peers peers={data.peers} byName={byName} subject={values} />
      </section>
    </div>
  );
}

function Factual({ f }: { f: ClientFactual }): JSX.Element {
  const kycTone = f.kyc_status === 'overdue' ? 'crit' : f.kyc_status === 'due_soon' ? 'warn' : 'ok';
  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <div className="font-serif text-[18px] font-semibold text-ink">{f.name}</div>
        <div className="font-mono text-[11.5px] text-muted">
          {f.client_id} · {f.is_entity ? 'Entity' : `${f.age ?? '—'} yrs`} · {f.booking_centre}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill tone="brass">{f.wealth_band}</Pill>
          <Pill tone="info">{f.stated_risk_profile}</Pill>
          <Pill tone={kycTone}>KYC {f.kyc_status.replace('_', ' ')}</Pill>
          {f.domicile_differs_from_residence && <Pill tone="warn">Tax domicile ≠ residence</Pill>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 text-[12.5px]">
        <Fact k="AUM (USD)" v={fmtUsdCompact(f.aum_usd_current)} />
        <Fact
          k="Since 31 Dec"
          v={`${((f.aum_usd_current / f.aum_usd_baseline - 1) * 100).toFixed(1)}%`}
        />
        <Fact k="Base currency" v={f.base_currency} />
        <Fact k="Language" v={f.reporting_language} />
        <Fact k="Residence" v={f.country_of_residence} />
        <Fact k="Tax domicile" v={f.tax_domicile} />
        <Fact k="Stated risk" v={`${f.stated_risk_score}/10`} />
        <Fact k="Stated horizon" v={`${f.stated_horizon_years} yrs`} />
        <Fact k="Liquidity needs" v={f.stated_liquidity_needs} />
        <Fact k="Client since" v={`${fmtDate(f.client_since)} (${f.relationship_years} yrs)`} />
        <Fact k="KYC due" v={`${fmtDate(f.kyc_review_due)} (${f.kyc_days_to_due} d)`} />
        <Fact
          k="Last contact"
          v={
            f.last_contact_date
              ? `${fmtDate(f.last_contact_date)} · ${f.last_contact_channel ?? ''}`
              : '—'
          }
        />
      </dl>
      <Section title="Life stage and source of wealth">
        <p className="text-[12.5px] text-ink-2">{f.life_stage}</p>
        <p className="text-[12.5px] text-ink-2">{f.source_of_wealth}</p>
      </Section>
      <Section title="Objectives">
        <ul className="m-0 list-disc pl-4 text-[12.5px] text-ink-2">
          {f.objectives.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </Section>
      <Section title={`Portfolios (${f.portfolios.length})`}>
        {f.portfolios.map((p) => (
          <div
            key={p.portfolio_id}
            className="flex items-baseline justify-between gap-2 text-[12.5px]"
          >
            <span className="text-ink-2">
              {p.name} <span className="font-mono text-[11px] text-muted">{p.mandate_code}</span>
              {!p.managed && <span className="ml-1 text-[11px] text-muted">custody</span>}
            </span>
            <span className="tnum font-mono text-[12px]">{fmtUsdCompact(p.aum_usd_current)}</span>
          </div>
        ))}
      </Section>
      {f.credit_facilities.length > 0 && (
        <Section title="Credit facilities">
          {f.credit_facilities.map((c) => (
            <div key={c.facility_id} className="text-[12.5px] text-ink-2">
              {c.type} · {c.currency} {fmtUsdCompact(c.drawn).replace('$', '')} drawn of{' '}
              {fmtUsdCompact(c.limit).replace('$', '')} · LTV{' '}
              <span
                className={c.margin_call_ltv_pct - c.ltv_pct < 2 ? 'font-semibold text-crit' : ''}
              >
                {c.ltv_pct.toFixed(1)}%
              </span>{' '}
              vs trigger {c.margin_call_ltv_pct}%
            </div>
          ))}
        </Section>
      )}
      <Section title={`Planned cash needs (${f.planned_cash_needs.length})`}>
        {f.planned_cash_needs.length === 0 && (
          <p className="text-[12.5px] text-muted">None recorded.</p>
        )}
        {f.planned_cash_needs.map((n) => (
          <div key={n.need_id} className="text-[12.5px]">
            <div className="flex justify-between gap-2">
              <span className="text-ink-2">{n.description}</span>
              <span className="tnum whitespace-nowrap font-mono text-[12px]">
                {fmtUsdCompact(n.amount_usd)}
              </span>
            </div>
            <div className="text-[11.5px] text-muted">
              {n.currency} {n.amount.toLocaleString('en-US')} · {n.recurrence} · {n.certainty} ·
              from {fmtDate(n.due_from)}
              {n.days_until_due_from > 0 ? ` (in ${n.days_until_due_from} d)` : ' (running)'}
            </div>
          </div>
        ))}
        {f.commitments_uncalled_usd > 0 && (
          <div className="text-[12.5px] text-ink-2">
            Uncalled commitments{' '}
            <span className="tnum font-mono">{fmtUsdCompact(f.commitments_uncalled_usd)}</span>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="space-y-1 border-t border-line px-4 py-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-[0.08em] text-muted">{k}</dt>
      <dd className="m-0 text-ink">{v}</dd>
    </div>
  );
}

function FeatureGroup({
  title,
  entries,
  values,
}: {
  title: string;
  entries: FeatureManifestEntry[];
  values: Map<string, FeatureValue>;
}): JSX.Element {
  const rubric = entries[0]?.rubric ?? 'context';
  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        <Pill tone={RUBRIC_TONE[rubric]}>feeds {RUBRIC_LABEL[rubric]}</Pill>
      </div>
      <div className="divide-y divide-line">
        {entries.map((m) => {
          const v = values.get(m.name);
          return <FeatureRow key={m.name} m={m} v={v} />;
        })}
      </div>
    </div>
  );
}

function FeatureRow({
  m,
  v,
}: {
  m: FeatureManifestEntry;
  v: FeatureValue | undefined;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const value = v?.value ?? null;
  const pct = v?.percentile ?? null;
  return (
    <div className="px-4 py-2">
      <div className="grid grid-cols-[minmax(0,1fr)_110px_180px_24px] items-center gap-3">
        <div>
          <div className="text-[13px] text-ink">{m.label}</div>
          <div className="text-[11.5px] text-muted">{m.description}</div>
        </div>
        <div className="tnum text-right font-mono text-[13px] text-ink">
          {fmtFeature(value, m)}{' '}
          <span className="text-[11px] text-muted">{value === null ? '' : m.unit}</span>
        </div>
        <PercentileBar pct={pct} />
        <button
          type="button"
          aria-label={open ? 'Hide evidence' : 'Show evidence'}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
          className="grid h-6 w-6 place-items-center rounded border border-line text-[11px] text-muted hover:bg-surface-2"
        >
          {open ? '−' : '+'}
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded bg-surface-2 px-3 py-2 text-[11.5px] text-ink-2">
          <div className="mb-1">
            <span className="font-semibold">Higher means:</span> {m.higherMeans || 'context only'}
          </div>
          <div className="font-semibold">Evidence</div>
          <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-ink-2">
            {JSON.stringify(v?.evidence ?? {}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function PercentileBar({ pct }: { pct: number | null }): JSX.Element {
  if (pct === null) {
    return <div className="text-right text-[11px] text-muted">not applicable</div>;
  }
  return (
    <div className="flex items-center gap-2" title={`${pct.toFixed(0)}th percentile in the book`}>
      <div className="relative h-1.5 flex-1 rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent/70"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-ink"
          style={{ left: `calc(${pct}% - 1px)` }}
        />
      </div>
      <span className="tnum w-9 text-right font-mono text-[11px] text-muted">
        p{pct.toFixed(0)}
      </span>
    </div>
  );
}

function Peers({
  peers,
  byName,
  subject,
}: {
  peers: PeerRef[];
  byName: Map<string, FeatureManifestEntry>;
  subject: Map<string, FeatureValue>;
}): JSX.Element {
  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="border-b border-line px-4 py-2 text-[13px] font-semibold text-ink">
        Nearest peers{' '}
        <span className="font-normal text-muted">
          by standardised distance over the behavioural vector
        </span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-line">
        {peers.map((p) => (
          <div key={p.clientId} className="px-4 py-3">
            <Link
              to={`/clients/${p.clientId}/vector`}
              className="font-medium text-ink no-underline hover:text-accent"
            >
              {p.name}
            </Link>
            <div className="font-mono text-[11px] text-muted">
              {p.clientId} · distance {p.distance.toFixed(2)}
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.08em] text-muted">
              Differs most on
            </div>
            <ul className="m-0 mt-1 list-none space-y-1 p-0 text-[12px]">
              {p.differences.map((d) => {
                const m = byName.get(d.feature);
                const s = subject.get(d.feature);
                return (
                  <li key={d.feature} className="flex justify-between gap-2">
                    <span className="text-ink-2">{m?.label ?? d.feature}</span>
                    <span className="tnum whitespace-nowrap font-mono text-[11.5px]">
                      {m ? fmtFeature(s?.value ?? null, m) : '—'} →{' '}
                      {m ? fmtFeature(d.peer, m) : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
