import type { EndCallRequest, EndCallResponse, GuardrailsResponse } from '@jb/contracts';
import { z } from 'zod';
import type { CallPlanRepository } from '../repositories/callPlanRepository.js';
import type { ClientDetailRepository } from '../repositories/clientDetailRepository.js';
import type { PromiseRepository } from '../repositories/promiseRepository.js';
import type { RubricRepository } from '../repositories/rubricRepository.js';
import type { CallPlanService } from './callPlanService.js';
import type { DatasetContext } from './datasetContext.js';
import type { PromiseService } from './promiseService.js';
import { toScores, type StoredRubric } from './riskService.js';
import { ClientNotFoundError } from './vectorService.js';
import type { WorkflowService } from './workflowService.js';

const CrossBorderDoc = z.looseObject({
  version: z.number(),
  byResidence: z.record(
    z.string(),
    z.object({
      status: z.enum(['none', 'restricted', 'unknown']),
      rules: z.array(z.object({ topic: z.string(), allowed: z.boolean(), detail: z.string() })),
      disclosures: z.array(z.string()).default([]),
    }),
  ),
  default: z.object({
    status: z.enum(['none', 'restricted', 'unknown']),
    rules: z.array(z.object({ topic: z.string(), allowed: z.boolean(), detail: z.string() })),
    disclosures: z.array(z.string()).default([]),
  }),
  notPermitted: z.array(z.string()).default([]),
  sensitivityPatterns: z.array(z.string()).default([]),
});

const FALLBACK_SENSITIVITY = [
  'did not want',
  'does not want',
  'asked that we not',
  'not to discuss',
  'reluctan',
  'not sell',
];
const FALLBACK_NOT_PERMITTED = [
  'No performance promises.',
  'No order is placed through this channel.',
];

/** The companion: what the RM may say on this call, and the record when it ends. */
export class CompanionService {
  constructor(
    private readonly ctx: DatasetContext,
    private readonly detail: ClientDetailRepository,
    private readonly rubric: RubricRepository,
    private readonly promiseRepo: PromiseRepository,
    private readonly promiseService: PromiseService,
    private readonly calls: CallPlanService,
    private readonly workflow: WorkflowService,
    private readonly audit: CallPlanRepository,
  ) {}

  async guardrails(clientId: string): Promise<GuardrailsResponse> {
    const [bundle, rubricRow, doc] = await Promise.all([
      this.detail.bundle(clientId),
      this.rubric.latest(clientId),
      this.promiseRepo.referenceDoc('cross-border-policy'),
    ]);
    if (!bundle) {
      throw new ClientNotFoundError(clientId);
    }
    const c = bundle.client;
    const parsed = doc ? CrossBorderDoc.safeParse(doc) : null;
    const cb = parsed?.success ? parsed.data : null;
    const entry = cb ? (cb.byResidence[c.countryOfResidence] ?? cb.default) : null;
    const patterns = cb?.sensitivityPatterns.length ? cb.sensitivityPatterns : FALLBACK_SENSITIVITY;
    const sensitivities = bundle.notes
      .flatMap((n) =>
        n.note
          .split(/(?<=[.!?])\s+/)
          .filter((s) => patterns.some((p) => s.toLowerCase().includes(p.toLowerCase())))
          .map((s) => ({ date: n.noteDate, channel: n.channel, quote: s.trim() })),
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 6);
    const stored = rubricRow ? (rubricRow.result as unknown as StoredRubric) : null;
    const scores = stored ? toScores(stored) : null;
    const notes: string[] = [];
    if (!scores) {
      notes.push('No rubric assessment yet: suitability rests on the stated profile alone.');
    } else if (scores.horizon <= 1) {
      notes.push(
        'Short effective horizon: long-dated or illiquid products need a specific reason.',
      );
    }
    if (c.riskToleranceScore <= 4) {
      notes.push(
        'Conservative stated profile: structured products need the horizon and appetite checks.',
      );
    }
    return {
      clientId,
      clientName: c.clientName,
      residence: c.countryOfResidence,
      bookingCentre: c.bookingCentre,
      language: c.reportingLanguage,
      crossBorder: {
        status: entry?.status ?? 'unknown',
        rules: entry?.rules ?? [],
        disclosures: entry?.disclosures ?? [
          'No cross-border reference file loaded; confirm permissions with compliance.',
        ],
        source: entry ? 'reference' : 'none',
      },
      suitability: {
        profile: c.riskProfile,
        score: c.riskToleranceScore,
        horizonYears: c.investmentHorizonYears,
        rubric: scores && rubricRow ? { ...scores, status: rubricRow.status } : null,
        notes,
      },
      notPermitted: cb?.notPermitted.length ? cb.notPermitted : FALLBACK_NOT_PERMITTED,
      sensitivities,
    };
  }

  /** Ends a call: logs the note and cues, records the promises heard, marks the call done, optionally drafts. */
  async endCall(
    clientId: string,
    req: EndCallRequest,
    clock: string | undefined,
  ): Promise<EndCallResponse> {
    const meta = await this.ctx.meta();
    const at = clock && clock < meta.today ? clock : meta.today;
    const bundle = await this.detail.bundle(clientId);
    if (!bundle) {
      throw new ClientNotFoundError(clientId);
    }
    const callRef = `call-${at}-${Date.now().toString(36)}`;
    let created = 0;
    for (const p of req.promises) {
      await this.promiseService.add(
        clientId,
        {
          party: p.party,
          text: p.text,
          kind: 'promise',
          ...(p.dueDate ? { dueDate: p.dueDate } : {}),
          ...(p.quote ? { quote: p.quote } : {}),
        },
        'call',
        callRef,
      );
      created += 1;
    }
    await this.audit.record({
      kind: 'CALL_LOGGED',
      actor: meta.rm.id,
      clientId,
      entityType: 'call',
      entityId: callRef,
      summary: `Call logged (${Math.round(req.durationSeconds / 60)} min): ${req.note.slice(0, 140)}${req.note.length > 140 ? '…' : ''}`,
      payload: {
        clock: at,
        note: req.note,
        cues: req.cues,
        promises: req.promises,
        durationSeconds: req.durationSeconds,
      },
    });
    let callDone = false;
    if (req.markDone) {
      await this.calls.done(clientId, { note: 'Logged from the companion' }, at);
      callDone = true;
    }
    let draft: EndCallResponse['draft'] = null;
    if (req.draft) {
      const d = await this.workflow.draft(
        clientId,
        { channel: 'email', actionIds: [], signalIds: [], tone: 'formal' },
        at,
      );
      draft = { id: d.id, subject: d.subject, language: d.language };
    }
    return { auditEventId: callRef, promisesCreated: created, callDone, draft };
  }
}
