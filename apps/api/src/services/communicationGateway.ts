import type { GateCheck, GateResult } from '@jb/contracts';
import { z } from 'zod';
import type { ClientDetailRepository } from '../repositories/clientDetailRepository.js';
import type { CallPlanRepository } from '../repositories/callPlanRepository.js';
import type { PromiseRepository } from '../repositories/promiseRepository.js';
import type { OutreachRow } from '../repositories/workflowRepository.js';
import type { DatasetContext } from './datasetContext.js';
import { ClientNotFoundError } from './vectorService.js';

const CrossBorder = z.looseObject({
  byResidence: z.record(
    z.string(),
    z.object({
      status: z.string(),
      rules: z.array(z.object({ topic: z.string(), allowed: z.boolean(), detail: z.string() })),
      disclosures: z.array(z.string()).default([]),
    }),
  ),
  default: z.object({
    status: z.string(),
    rules: z.array(z.object({ topic: z.string(), allowed: z.boolean(), detail: z.string() })),
    disclosures: z.array(z.string()).default([]),
  }),
  notPermitted: z.array(z.string()).default([]),
});
const Controls = z.looseObject({
  paused: z.boolean().default(false),
  reason: z.string().optional(),
});

const PROMISE_WORDS =
  /\b(guarantee[ds]?|assured return|risk[- ]free|cannot lose|will (definitely )?(rise|go up|return)|no downside)\b/i;
const PRODUCT_WORDS =
  /\b(subscribe|new (note|product|fund|structured)|we recommend you (buy|sell)|place an order|execute)\b/i;

/**
 * The one gate every outgoing message passes, whoever wrote it. Today the RM's send goes through it;
 * an agent's send will go through the same object. Checks are data-driven where they can be (the
 * cross-border file), word-based where they must be (promises), and logged always.
 */
export class CommunicationGateway {
  constructor(
    private readonly detail: ClientDetailRepository,
    private readonly refs: PromiseRepository,
    private readonly audit: CallPlanRepository,
    private readonly ctx: DatasetContext,
  ) {}

  async agentsPaused(): Promise<{ paused: boolean; reason: string | null }> {
    const raw = await this.refs.referenceDoc('agent-controls');
    const c = raw ? Controls.safeParse(raw) : null;
    return c?.success
      ? { paused: c.data.paused, reason: c.data.reason ?? null }
      : { paused: false, reason: null };
  }

  async gate(draft: OutreachRow, body: string, origin: GateResult['origin']): Promise<GateResult> {
    const bundle = await this.detail.bundle(draft.clientId);
    if (!bundle) {
      throw new ClientNotFoundError(draft.clientId);
    }
    const c = bundle.client;
    const checks: GateCheck[] = [];
    const raw = await this.refs.referenceDoc('cross-border-policy');
    const cb = raw ? CrossBorder.safeParse(raw) : null;
    const entry = cb?.success
      ? (cb.data.byResidence[c.countryOfResidence] ?? cb.data.default)
      : null;

    if (origin === 'agent') {
      const controls = await this.agentsPaused();
      checks.push({
        name: 'Agents enabled',
        status: controls.paused ? 'block' : 'pass',
        detail: controls.paused
          ? `All agents are paused${controls.reason ? `: ${controls.reason}` : ''}.`
          : 'Agents may send within their playbook.',
      });
    }

    // Cross-border: a restricted residence may not receive product offers unless the client asked.
    const offers = PRODUCT_WORDS.test(body);
    const ctx = draft.context as { actions?: unknown[]; reverse_enquiry?: boolean };
    if (!entry) {
      checks.push({
        name: 'Cross-border',
        status: 'warn',
        detail: 'No cross-border reference file; confirm permissions with compliance.',
      });
    } else if (entry.status === 'restricted' && offers && !ctx.reverse_enquiry) {
      checks.push({
        name: 'Cross-border',
        status: 'block',
        detail: `${c.countryOfResidence} residents: new product offers only on documented reverse enquiry. ${entry.rules.find((r) => !r.allowed)?.detail ?? ''}`,
      });
    } else {
      checks.push({
        name: 'Cross-border',
        status: entry.status === 'restricted' ? 'warn' : 'pass',
        detail:
          entry.status === 'restricted'
            ? `${c.countryOfResidence} is restricted; this message stays within servicing.`
            : `${c.countryOfResidence} resident, ${c.bookingCentre} booking: within scope.`,
      });
    }

    // Language.
    checks.push({
      name: 'Language',
      status: draft.language === c.reportingLanguage ? 'pass' : 'warn',
      detail:
        draft.language === c.reportingLanguage
          ? `${draft.language} matches the reporting language.`
          : `Drafted in ${draft.language}; the client reports in ${c.reportingLanguage}.`,
    });

    // Promises and guarantees.
    const promise = PROMISE_WORDS.exec(body);
    checks.push({
      name: 'No promises',
      status: promise ? 'block' : 'pass',
      detail: promise
        ? `The text contains "${promise[0]}"; outcomes may not be promised.`
        : 'No guarantee language.',
    });

    // Suitability: a message that proposes action should rest on an approved action.
    const hasActions = Array.isArray(ctx.actions) && ctx.actions.length > 0;
    checks.push({
      name: 'Suitability basis',
      status: offers && !hasActions ? 'warn' : 'pass',
      detail:
        offers && !hasActions
          ? 'The message proposes action but no approved action is attached; discuss rather than propose.'
          : hasActions
            ? 'Rests on approved actions.'
            : 'Informational message.',
    });

    // Data minimisation: what went to the model.
    checks.push({
      name: 'Model exposure',
      status: draft.source === 'claude' ? 'warn' : 'pass',
      detail:
        draft.source === 'claude'
          ? 'Draft was written by the model from facts; names were sent unpseudonymised (pseudonymisation is a plugin P1 item).'
          : 'Template draft; nothing left the platform.',
    });

    // Disclosures.
    const disclosures = entry?.disclosures ?? [];
    let out = body;
    const missingDisclosures = disclosures.filter((d) => !body.includes(d));
    if (missingDisclosures.length) {
      out = `${body.trimEnd()}\n\n${missingDisclosures.map((d) => `— ${d}`).join('\n')}`;
    }
    checks.push({
      name: 'Disclosures',
      status: 'pass',
      detail: missingDisclosures.length
        ? `${missingDisclosures.length} required disclosure${missingDisclosures.length === 1 ? '' : 's'} appended.`
        : disclosures.length
          ? 'Required disclosures present.'
          : 'None required.',
    });

    const allowed = !checks.some((k) => k.status === 'block');
    const meta = await this.ctx.meta();
    await this.audit.record({
      kind: allowed ? 'COMMS_GATE_PASSED' : 'COMMS_GATE_BLOCKED',
      actor: origin === 'agent' ? 'agent' : meta.rm.id,
      clientId: draft.clientId,
      entityType: 'outreach',
      entityId: draft.id,
      summary: `${allowed ? 'Gate passed' : 'Gate blocked'} (${origin}): ${
        checks
          .filter((k) => k.status !== 'pass')
          .map((k) => `${k.name} ${k.status}`)
          .join(', ') || 'all checks passed'
      }`,
      payload: { origin, checks },
    });
    return { allowed, checks, disclosures, body: out, origin };
  }
}
