import {
  PlaybooksDoc,
  type Playbook,
  type PlaybooksResponse,
  type ShadowDraft,
  type ShadowGradeRequest,
  type ShadowRunResponse,
} from '@jb/contracts';
import { cashflows } from '../domain/cashflows.js';
import { snapshotForClock } from '../domain/signals/build.js';
import { buildSignals } from '../domain/signals/build.js';
import type { ClientDetailRepository } from '../repositories/clientDetailRepository.js';
import type { PromiseRepository } from '../repositories/promiseRepository.js';
import type { SignalRepository } from '../repositories/signalRepository.js';
import type { TeamRepository } from '../repositories/teamRepository.js';
import type { DatasetContext } from './datasetContext.js';
import { ClientNotFoundError } from './vectorService.js';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * Playbooks are data; the companion runs them with the RM today and an agent may run them later.
 * Shadow mode fills each step's template from the client's facts, so the RM can grade what an agent
 * would have said without anything reaching the client.
 */
export class PlaybookService {
  constructor(
    private readonly refs: PromiseRepository,
    private readonly detail: ClientDetailRepository,
    private readonly signals: SignalRepository,
    private readonly team: TeamRepository,
    private readonly ctx: DatasetContext,
  ) {}

  async doc(): Promise<PlaybooksResponse> {
    const raw = await this.refs.referenceDoc('playbooks');
    const parsed = raw ? PlaybooksDoc.safeParse(raw) : null;
    if (!parsed?.success) {
      return {
        source: 'none',
        autonomy: { level: 'L1', agreementThresholdForL2: 0.85, minimumGradesForL2: 20 },
        escalationTriggers: [],
        playbooks: [],
      };
    }
    return {
      source: 'reference',
      autonomy: parsed.data.autonomy,
      escalationTriggers: parsed.data.escalationTriggers,
      playbooks: parsed.data.playbooks,
    };
  }

  async shadow(
    clientId: string,
    playbookId: string,
    clock: string | undefined,
  ): Promise<ShadowRunResponse> {
    const doc = await this.doc();
    const playbook = doc.playbooks.find((p) => p.id === playbookId);
    if (!playbook) {
      throw new PlaybookNotFoundError(playbookId);
    }
    const [bundle, meta, inputs] = await Promise.all([
      this.detail.bundle(clientId),
      this.ctx.meta(),
      this.signals.inputs(),
    ]);
    if (!bundle) {
      throw new ClientNotFoundError(clientId);
    }
    const at = clock && clock < meta.today ? clock : meta.today;
    const snapshot = snapshotForClock(inputs.snapshots, at);
    const cf = cashflows(bundle, at, snapshot);
    const nextNeed = cf.needs
      .filter((n) => n.status !== 'running')
      .sort((a, b) => a.daysUntil - b.daysUntil)[0];
    const reaching = buildSignals(inputs, at, bundle)
      .filter((s) => (s.client?.exposedPct ?? 0) > 0)
      .sort((a, b) => (b.client?.exposedPct ?? 0) - (a.client?.exposedPct ?? 0));
    const top = reaching[0];
    const c = bundle.client;
    const facts: Record<string, string | undefined> = {
      name: c.clientName,
      rmName: c.rmName,
      residence: c.countryOfResidence,
      taxDomicile: c.taxDomicile,
      bookingCentre: c.bookingCentre,
      sourceOfWealth: c.sourceOfWealth,
      objectives: c.objectives,
      horizonYears: String(c.investmentHorizonYears),
      riskProfile: c.riskProfile,
      kycReviewDue: c.kycReviewDue,
      nextNeedDescription: nextNeed?.description,
      nextNeedDate: nextNeed?.dueFrom,
      nextNeedAmount: nextNeed
        ? `${nextNeed.currency} ${Math.round(nextNeed.amount).toLocaleString('en-US')} (${usd.format(nextNeed.amountUsd)})`
        : undefined,
      coverageRatio: cf.coverage12m.ratio === null ? undefined : cf.coverage12m.ratio.toFixed(1),
      topSignalTitle: top?.title,
      topSignalDate: top?.date,
      topSignalExposedPct: top?.client ? top.client.exposedPct.toFixed(0) : undefined,
      topSignalVia: top?.client
        ? top.client.affected
            .slice(0, 2)
            .map((a) => a.name)
            .join(' and ')
        : undefined,
    };
    const drafts: ShadowDraft[] = playbook.steps.map((s) =>
      fill(playbook.id, s.id, s.template, facts),
    );
    const escalations = doc.escalationTriggers.filter((t) =>
      bundle.notes.some((n) => n.note.toLowerCase().includes(t.toLowerCase())),
    );
    return { clientId, playbook, drafts, escalations };
  }

  async grade(clientId: string, req: ShadowGradeRequest): Promise<void> {
    const actor = await this.ctx.rmId();
    await this.team.addShadowGrade({
      clientId,
      playbookId: req.playbookId,
      stepId: req.stepId,
      draft: req.draft,
      source: req.source,
      grade: req.grade,
      rmText: req.rmText ?? null,
      actor,
    });
  }
}

export class PlaybookNotFoundError extends Error {
  constructor(id: string) {
    super(`No playbook ${id}`);
    this.name = 'PlaybookNotFoundError';
  }
}

/** Fills {{placeholders}}; reports the ones the facts could not supply instead of guessing. */
export function fill(
  playbookId: string,
  stepId: string,
  template: string,
  facts: Record<string, string | undefined>,
): ShadowDraft {
  const missing: string[] = [];
  const text = template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = facts[key];
    if (v === undefined || v === '') {
      missing.push(key);
      return `[${key}]`;
    }
    return v;
  });
  return { playbookId, stepId, text, source: 'template', missing };
}

export type { Playbook };
