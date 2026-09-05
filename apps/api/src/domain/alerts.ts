import type { ClientAlert, ExposureResponse, MandateStatusResponse } from '@jb/contracts';
import type { ClientBundle } from '../repositories/clientDetailRepository.js';
import type { cashflows } from './cashflows.js';
import { daysBetween } from './dates.js';

type Cashflows = ReturnType<typeof cashflows>;

const fmtUsd = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

/**
 * Alerts computable from data alone. They feed the Client 360 banner today and become the
 * evidence layer for signal-driven insights in iteration 3.
 */
export function deriveAlerts(
  bundle: ClientBundle,
  mandate: MandateStatusResponse,
  exposure: ExposureResponse,
  cf: Cashflows,
  today: string,
): ClientAlert[] {
  const out: ClientAlert[] = [];

  for (const f of cf.facilities) {
    const headroom = f.marginCallLtvPct - f.ltvPct;
    if (headroom < 5) {
      const prev = f.ltvSeries.at(-2);
      out.push({
        id: `mc-${f.facilityId}`,
        kind: 'MARGIN_CALL_PROXIMITY',
        severity: headroom < 2 ? 'high' : 'medium',
        title: `LTV ${f.ltvPct.toFixed(1)}% against a ${f.marginCallLtvPct}% margin-call trigger`,
        detail: `${f.type} ${f.facilityId}: ${headroom.toFixed(1)} points of headroom${prev ? `, ${f.ltvPct - prev.ltvPct >= 0 ? 'up' : 'down'} ${Math.abs(f.ltvPct - prev.ltvPct).toFixed(1)} points since ${prev.snapshotDate}` : ''}.`,
        evidence: { facilityId: f.facilityId, ltvSeries: f.ltvSeries, trigger: f.marginCallLtvPct },
      });
    }
  }

  for (const p of mandate.portfolios) {
    const breaches = p.rows.filter((r) => r.status !== 'within');
    if (breaches.length > 0) {
      const worst = [...breaches].sort(
        (a, b) => Math.abs(b.deviationPts) - Math.abs(a.deviationPts),
      )[0];
      out.push({
        id: `mb-${p.portfolioId}`,
        kind: 'MANDATE_BREACH',
        severity: worst && Math.abs(worst.deviationPts) >= 20 ? 'high' : 'medium',
        title: `${p.name}: ${breaches.length} asset class${breaches.length > 1 ? 'es' : ''} outside the ${p.mandateName} bands`,
        detail: breaches
          .map((b) => `${b.assetClass} ${b.weightPct.toFixed(1)}% (band ${b.minPct}–${b.maxPct}%)`)
          .join('; '),
        evidence: { portfolioId: p.portfolioId, rows: breaches },
      });
    }
    for (const s of p.singleLineBreaches) {
      out.push({
        id: `sl-${p.portfolioId}-${s.instrumentId}`,
        kind: 'CONCENTRATION',
        severity: s.weightPct - (p.maxSinglePositionPct ?? 0) > 5 ? 'high' : 'medium',
        title: `${s.name} at ${s.weightPct.toFixed(1)}% of ${p.name}`,
        detail: `Above the ${p.maxSinglePositionPct ?? 0}% single-position limit for the ${p.mandateName} mandate.`,
        evidence: {
          portfolioId: p.portfolioId,
          instrumentId: s.instrumentId,
          limitPct: p.maxSinglePositionPct,
        },
      });
    }
    for (const e of p.exclusionBreaches) {
      out.push({
        id: `ex-${p.portfolioId}-${e.instrumentId}`,
        kind: 'SUSTAINABILITY_EXCLUSION',
        severity: 'high',
        title: `${e.name} is excluded under the ${p.mandateName} mandate`,
        detail: `${e.weightPct.toFixed(1)}% of ${p.name} sits in an instrument the mandate's binding exclusions rule out.`,
        evidence: { portfolioId: p.portfolioId, instrumentId: e.instrumentId },
      });
    }
  }

  for (const n of exposure.names) {
    if (n.breached && n.viaNotesUsd > 0) {
      out.push({
        id: `lt-${n.exposureName}`,
        kind: 'LOOKTHROUGH_CONCENTRATION',
        severity: 'high',
        title: `${n.exposureName}: ${n.totalPct.toFixed(1)}% of the household once structured notes are looked through`,
        detail: `${fmtUsd(n.directUsd)} held directly plus ${fmtUsd(n.viaNotesUsd)} via notes, against a ${n.limitPct ?? 0}% limit.`,
        evidence: { exposureName: n.exposureName, sources: n.sources },
      });
    }
  }

  const kycDays = daysBetween(today, bundle.client.kycReviewDue);
  if (kycDays <= 45) {
    out.push({
      id: 'kyc',
      kind: 'KYC_DUE',
      severity: kycDays < 0 ? 'high' : kycDays <= 14 ? 'medium' : 'low',
      title:
        kycDays < 0
          ? `KYC review overdue by ${-kycDays} days`
          : `KYC review due in ${kycDays} days`,
      detail: `Review date ${bundle.client.kycReviewDue}.`,
      evidence: { kycReviewDue: bundle.client.kycReviewDue },
    });
  }

  for (const n of cf.needs) {
    if (n.status === 'upcoming' && n.certainty !== 'Aspirational' && n.daysUntil <= 120) {
      out.push({
        id: `cn-${n.needId}`,
        kind: 'CASH_NEED_APPROACHING',
        severity: n.daysUntil <= 45 ? 'medium' : 'low',
        title: `${n.description}: ${fmtUsd(n.amountUsd)} from ${n.dueFrom}`,
        detail: `${n.certainty}, ${n.recurrence.toLowerCase()}, in ${n.daysUntil} days.`,
        evidence: { needId: n.needId },
      });
    }
  }

  if (cf.coverage12m.ratio !== null && cf.coverage12m.ratio < 1.5) {
    out.push({
      id: 'liq',
      kind: 'LIQUIDITY_SHORTFALL',
      severity: cf.coverage12m.ratio < 1 ? 'high' : 'medium',
      title: `Daily-liquid assets cover ${cf.coverage12m.ratio.toFixed(1)}x of the next 12 months' cash needs`,
      detail: `${fmtUsd(cf.coverage12m.dailyLiquidUsd)} sellable daily against ${fmtUsd(cf.coverage12m.needsUsd)} of confirmed and likely needs.`,
      evidence: cf.coverage12m,
    });
  }

  const lastNote = bundle.notes.at(-1);
  if (
    lastNote?.channel === 'Email' &&
    /have not yet replied|not yet replied/i.test(lastNote.note)
  ) {
    out.push({
      id: 'contact',
      kind: 'UNANSWERED_CONTACT',
      severity: 'high',
      title: `Client email from ${lastNote.noteDate} is unanswered`,
      detail: lastNote.note.slice(0, 160),
      evidence: { noteId: lastNote.noteId },
    });
  }

  const stale = bundle.holdings.filter(
    (h) => h.snapshotDate === today && h.valuationDate !== h.snapshotDate,
  );
  for (const h of stale) {
    out.push({
      id: `stale-${h.instrumentId}`,
      kind: 'STALE_VALUATION',
      severity: 'low',
      title: `${h.instrumentName} valued as of ${h.valuationDate}`,
      detail: `${fmtUsd(h.marketValueUsd)} carried at a mark ${daysBetween(h.valuationDate, today)} days old.`,
      evidence: { portfolioId: h.portfolioId, instrumentId: h.instrumentId },
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
