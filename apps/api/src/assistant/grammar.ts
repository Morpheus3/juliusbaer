/**
 * The grammar planner: deterministic intent and entity resolution that works without a language
 * model. It produces the same Plan shape the Claude planner does, so the executor and composer are
 * shared. Every pattern here is a question the RM actually asks; unknown questions fall back to a
 * client summary (when a client is in scope) or to help.
 */
import {
  alertKindFor,
  dateFor,
  daysFor,
  instrumentPhrase,
  keywordPhrase,
  laneFor,
  resolveClient,
  resolveClients,
  resolveScenario,
  resolveSignal,
  type ClientRef,
  type ScenarioRef,
  type SignalRef,
} from './entities.js';
import type { Plan } from './plan.js';

export interface GrammarContext {
  clock: string;
  contextClientId: string | null;
  clients: ClientRef[];
  signals: SignalRef[];
  scenarios: ScenarioRef[];
}

const ROOMS: [RegExp, string][] = [
  [/cash ?flows?|liquidity tab/i, '/portfolio/cashflows'],
  [/exposure|look-?through/i, '/portfolio/exposure'],
  [/holdings/i, '/portfolio/holdings'],
  [/transactions/i, '/portfolio/transactions'],
  [/portfolio/i, '/portfolio'],
  [/impact|scenario/i, '/impact'],
  [/rubric/i, '/rubric'],
  [/trade ideas?|ideas/i, '/trade-ideas'],
  [/actions|risk|matrix/i, '/actions'],
  [/workflow|approvals?|outreach/i, '/workflow'],
  [/vector/i, '/vector'],
  [/journey|360|overview/i, ''],
];
const BOOK_ROOMS: [RegExp, string][] = [
  [/\b(board|mandates?|collateral board)\b/i, '/board'],
  [/\bsignals?\b/i, '/signals'],
  [/\baudit\b/i, '/audit'],
  [/\b(today|book|cockpit|home)\b/i, '/book'],
];

const pronoun = (text: string): boolean =>
  /\b(he|she|him|her|his|hers|they|them|their|this client|the client)\b/i.test(text);

export function planFromGrammar(text: string, ctx: GrammarContext): Plan {
  const t = text.trim();
  const named = resolveClient(t, ctx.clients);
  const client =
    named ??
    (pronoun(t) || !/\b(who|which|list|how many|clients|book|compare|market|signals?)\b/i.test(t)
      ? (ctx.clients.find((c) => c.clientId === ctx.contextClientId) ?? null)
      : null);
  const cid = client?.clientId ?? null;
  const base = (over: Partial<Plan>): Plan => ({
    intent: 'ask',
    scopeClientId: cid,
    calls: [],
    navigate: null,
    proposals: [],
    shape: null,
    entities: {},
    rationale: '',
    ...over,
  });

  /* ---- help */
  if (/^(help|\?|what can (you|i) (do|ask)|how do i use)/i.test(t)) {
    return base({
      intent: 'help',
      shape: 'help',
      scopeClientId: null,
      rationale: 'help requested',
    });
  }

  /* ---- promises and the idea desk: before navigation, since “show all open promises” is a question */
  if (
    /\bpromis|\bowe\b|\bfollow[- ]?ups?\b|\boutstanding (items|commitments)\b|\bdecision debt\b|\bwhat did (i|we) (say (i|we) would|agree to)\b/i.test(
      t,
    )
  ) {
    return base({
      intent: named || pronoun(t) || ctx.contextClientId ? 'ask' : 'find',
      shape: 'promises',
      scopeClientId: named
        ? named.clientId
        : /\b(all|book|across|every|my clients)\b/i.test(t)
          ? null
          : cid,
      calls: [
        {
          tool: 'promises',
          args: named
            ? { clientId: named.clientId }
            : /\b(all|book|across|every|my clients)\b/i.test(t) || !cid
              ? {}
              : { clientId: cid },
        },
      ],
      rationale: 'promise ledger',
    });
  }
  if (
    /\b(which|who|what) clients? (fit|suit|should hear about|would benefit)|\bidea desk\b|\bideas? (for|about|on)\b|\bopportunit/i.test(
      t,
    ) &&
    !named
  ) {
    const sig = resolveSignal(t, ctx.signals);
    return base({
      intent: 'find',
      shape: 'idea-desk',
      scopeClientId: null,
      calls: [{ tool: 'ideas', args: { ...(sig ? { signalId: sig.id } : {}), q: t } }],
      entities: sig ? { signalId: sig.id, signalTitle: sig.title } : {},
      rationale: 'idea desk',
    });
  }
  /* ---- go */
  if (/^(show|open|go to|take me to|switch to|bring up|navigate to)\b/i.test(t)) {
    if (/switch to/i.test(t) && client) {
      return base({
        intent: 'go',
        shape: 'go',
        navigate: `/clients/${client.clientId}`,
        rationale: 'switch client',
      });
    }
    for (const [re, path] of BOOK_ROOMS) {
      if (re.test(t) && !named && !/\b(his|her|their|my client)\b/i.test(t)) {
        return base({
          intent: 'go',
          shape: 'go',
          scopeClientId: null,
          navigate: path,
          rationale: 'book room',
        });
      }
    }
    if (client) {
      const room = ROOMS.find(([re]) => re.test(t))?.[1] ?? '';
      return base({
        intent: 'go',
        shape: 'go',
        navigate: `/clients/${client.clientId}${room}`,
        rationale: 'client room',
      });
    }
    return base({
      intent: 'help',
      shape: 'help',
      scopeClientId: null,
      rationale: 'go without a client',
      entities: { note: 'Name the client to open.' },
    });
  }

  /* ---- do */
  if (/\bdefer\b/i.test(t) && client) {
    const until = dateFor(t, ctx.clock);
    const reason =
      /\b(?:because|as|since|reason:?)\s+(.+)$/i.exec(t)?.[1] ?? /,\s*(.+)$/.exec(t)?.[1] ?? null;
    return base({
      intent: 'do',
      shape: 'do',
      proposals: [
        { kind: 'defer', clientId: client.clientId, args: { until, reason }, match: null },
      ],
      rationale: 'defer the call',
    });
  }
  if (
    /\b(mark|log)\b.*\b(done|called|spoke|call)\b|\bdone with\b|^log (the )?call/i.test(t) &&
    client
  ) {
    const note = /:\s*(.+)$/.exec(t)?.[1] ?? null;
    const proposals: Plan['proposals'] = [
      { kind: 'done', clientId: client.clientId, args: { note }, match: null },
    ];
    if (/\bdraft\b|\bemail\b|\bsummary\b|\bconfirmation\b/i.test(t)) {
      proposals.push({
        kind: 'draft',
        clientId: client.clientId,
        args: { channel: 'email' },
        match: null,
      });
    }
    return base({
      intent: 'do',
      shape: 'do',
      proposals,
      calls: [{ tool: 'workflow', args: { clientId: cid } }],
      rationale: 'log the call',
    });
  }
  if (/\b(triage|dismiss)\b/i.test(t) && client) {
    return base({
      intent: 'do',
      shape: 'do',
      calls: [{ tool: 'workflow', args: { clientId: cid } }],
      proposals: [
        {
          kind: 'triage',
          clientId: client.clientId,
          args: {
            decision: /dismiss/i.test(t) ? 'dismissed' : 'triaged',
            reason: /\b(?:because|as)\s+(.+)$/i.exec(t)?.[1] ?? null,
          },
          match: t,
        },
      ],
      rationale: 'triage an alert',
    });
  }
  if (/\b(approve|reject)\b/i.test(t) && client) {
    return base({
      intent: 'do',
      shape: 'do',
      calls: [{ tool: 'risk', args: { clientId: cid } }],
      proposals: [
        {
          kind: 'decision',
          clientId: client.clientId,
          args: {
            decision: /reject/i.test(t) ? 'rejected' : 'approved',
            entityType: /\bidea\b/i.test(t) ? 'trade_idea' : 'action',
            note: /\b(?:because|as)\s+(.+)$/i.exec(t)?.[1] ?? null,
          },
          match: t,
        },
      ],
      rationale: 'decide an action',
    });
  }
  if (/\boverride\b/i.test(t) && client) {
    const dim = /\b(capacity|appetite|horizon)\b/i.exec(t)?.[1]?.toLowerCase() ?? null;
    const score = /\b(?:to|=|at)\s*([123])\b/i.exec(t)?.[1] ?? null;
    const reason = /\b(?:because|as|since)\s+(.+)$/i.exec(t)?.[1] ?? null;
    return base({
      intent: 'do',
      shape: 'do',
      calls: [{ tool: 'rubric', args: { clientId: cid } }],
      proposals: [
        {
          kind: 'override',
          clientId: client.clientId,
          args: { dimension: dim, score: score ? Number(score) : null, reason },
          match: null,
        },
      ],
      rationale: 'override a rubric dimension',
    });
  }
  if (/\bdraft\b/i.test(t) && client) {
    return base({
      intent: 'do',
      shape: 'do',
      calls: [{ tool: 'risk', args: { clientId: cid } }],
      proposals: [
        {
          kind: 'draft',
          clientId: client.clientId,
          args: {
            channel: /\bcall notes?\b/i.test(t)
              ? 'call-notes'
              : /\bmessage\b|\bwhatsapp\b/i.test(t)
                ? 'message'
                : 'email',
            tone: /\bwarm\b/i.test(t) ? 'warm' : 'formal',
          },
          match: null,
        },
      ],
      rationale: 'draft outreach',
    });
  }

  /* ---- find (book-wide) */
  const compare = resolveClients(t, ctx.clients);
  if (/\bcompare\b|\bversus\b|\bvs\.?\b/i.test(t) && compare.length >= 2) {
    return base({
      intent: 'find',
      shape: 'compare',
      scopeClientId: null,
      calls: [
        { tool: 'compareClients', args: { clientIds: compare.slice(0, 4).map((c) => c.clientId) } },
      ],
      rationale: 'compare clients',
    });
  }
  const bookWide =
    /\b(who|which clients?|list|how many|any clients?|all clients|across the book|in the book|my clients|clients)\b/i.test(
      t,
    ) && !named;
  if (bookWide) {
    if (/\bcall\b.*\b(first|today|now)\b|\bcall sheet\b|\bwho.*\bcall\b/i.test(t)) {
      return base({
        intent: 'find',
        shape: 'call-sheet',
        scopeClientId: null,
        calls: [{ tool: 'callPlan', args: {} }],
        rationale: 'the call sheet',
      });
    }
    if (
      /\bnot (been )?contacted|no contact|havent? (spoken|called|met)|last (spoken|contact|call)|quiet|uncontacted/i.test(
        t,
      )
    ) {
      return base({
        intent: 'find',
        shape: 'find',
        scopeClientId: null,
        calls: [{ tool: 'findClients', args: { uncontactedDays: daysFor(t) ?? 60 } }],
        entities: { filter: 'uncontacted' },
        rationale: 'contact gap',
      });
    }
    const sig = resolveSignal(t, ctx.signals);
    if (sig && /\bhear|exposed|affected|touch|reach|impact|care|matter\b/i.test(t)) {
      return base({
        intent: 'find',
        shape: 'find',
        scopeClientId: null,
        calls: [{ tool: 'findClients', args: { signalId: sig.id, minExposedPct: 5 } }],
        entities: { signalId: sig.id, signalTitle: sig.title },
        rationale: 'signal reach',
      });
    }
    if (/\bkyc\b/i.test(t)) {
      return base({
        intent: 'find',
        shape: 'find',
        scopeClientId: null,
        calls: [{ tool: 'findClients', args: { kycDueWithinDays: daysFor(t) ?? 90 } }],
        rationale: 'KYC due',
      });
    }
    if (/\bcash needs?\b|\bneed(s)? (cash|money|funds)\b|\bdrawdown/i.test(t)) {
      return base({
        intent: 'find',
        shape: 'find',
        scopeClientId: null,
        calls: [{ tool: 'findClients', args: { cashNeedWithinDays: daysFor(t) ?? 180 } }],
        rationale: 'cash needs',
      });
    }
    const kind = alertKindFor(t);
    const lane = laneFor(t);
    if (kind || lane) {
      return base({
        intent: 'find',
        shape: 'find',
        scopeClientId: null,
        calls: [
          {
            tool: 'findClients',
            args: { ...(kind ? { alertKind: kind } : {}), ...(lane ? { lane } : {}) },
          },
        ],
        rationale: 'alert filter',
      });
    }
    if (
      /\b(uhnw|hnw)\b/i.test(t) ||
      /\bin (singapore|hong kong|thailand|malaysia|dubai|the uae|uae)\b/i.test(t) ||
      /\b(chinese|german|japanese|italian|english)[- ]speaking\b/i.test(t)
    ) {
      const band = /\b(uhnw|hnw)\b/i.exec(t)?.[1]?.toUpperCase();
      const place = /\bin ([a-z ]+?)(\?|$|\s+(who|with|and))/i.exec(t)?.[1]?.trim();
      const lang = /\b(chinese|german|japanese|italian|english)[- ]speaking\b/i.exec(t)?.[1];
      return base({
        intent: 'find',
        shape: 'find',
        scopeClientId: null,
        calls: [
          {
            tool: 'findClients',
            args: {
              ...(band ? { wealthBand: band } : {}),
              ...(place ? { place } : {}),
              ...(lang ? { language: lang } : {}),
            },
          },
        ],
        rationale: 'segment',
      });
    }
    if (
      /\bhow (is|are)\b.*\bbook\b|\bbook (summary|overview)\b|\baum\b|\bhow many clients\b/i.test(t)
    ) {
      return base({
        intent: 'find',
        shape: 'book-summary',
        scopeClientId: null,
        calls: [{ tool: 'book', args: {} }],
        rationale: 'book summary',
      });
    }
    return base({
      intent: 'find',
      shape: 'find',
      scopeClientId: null,
      calls: [{ tool: 'findClients', args: { lane: 'now' } }],
      rationale: 'default: what needs action now',
    });
  }

  /* ---- market signals, no client */
  if (
    !client &&
    /\bsignals?\b|\bmarkets?\b|\bwhat('s| is) happening\b|\bnews\b|\bevents?\b/i.test(t)
  ) {
    const sig = resolveSignal(t, ctx.signals);
    return base({
      intent: 'ask',
      shape: 'signals-today',
      scopeClientId: null,
      calls: [{ tool: 'signals', args: {} }],
      entities: sig ? { signalId: sig.id } : {},
      rationale: 'signals at the clock',
    });
  }
  if (!client && /\bscenarios?\b|\bstress\b/i.test(t)) {
    return base({
      intent: 'ask',
      shape: 'scenario',
      scopeClientId: null,
      calls: [{ tool: 'scenarios', args: {} }],
      rationale: 'scenario library',
    });
  }
  if (!client && /\bbook\b|\baum\b|\bhow (is|are) (we|things)\b/i.test(t)) {
    return base({
      intent: 'ask',
      shape: 'book-summary',
      scopeClientId: null,
      calls: [{ tool: 'book', args: {} }],
      rationale: 'book summary',
    });
  }

  /* ---- client-scoped asks */
  if (!client) {
    return base({
      intent: 'help',
      shape: 'help',
      scopeClientId: null,
      rationale: 'no client resolved',
      entities: {
        note: 'I could not tell which client you mean. Name one, or open a client first.',
      },
    });
  }
  const c = { clientId: cid };
  const sig = resolveSignal(t, ctx.signals);
  const scen = resolveScenario(t, ctx.scenarios);
  if (
    /\bwhy\b.*\b(first|top|priority|call|today)\b|\bpriority\b|\bwhen (should|do) i call\b/i.test(t)
  ) {
    return base({
      shape: 'why-first',
      calls: [{ tool: 'callPlan', args: {} }],
      rationale: 'call priority',
    });
  }
  const sell = instrumentPhrase(t);
  if (sell) {
    return base({
      shape: 'sell-clears-limit',
      calls: [
        { tool: 'clientExposure', args: c },
        { tool: 'clientOverview', args: c },
      ],
      entities: { instrument: sell },
      rationale: 'what-if sale against the limit',
    });
  }
  if (scen && /\b(run|scenario|stress|what if|happens? if|leg down|shock)\b/i.test(t)) {
    const severity = /\bsevere\b/i.test(t) ? 'severe' : /\bmild\b/i.test(t) ? 'mild' : 'base';
    return base({
      shape: 'scenario',
      calls: [{ tool: 'impact', args: { ...c, scenarioId: scen.id, severity } }],
      entities: { scenarioId: scen.id, scenarioName: scen.name, severity },
      rationale: 'named scenario',
    });
  }
  if (sig && /\bdo|did|impact|affect|mean|exposed|touch|reach|hit\b/i.test(t)) {
    return base({
      shape: 'signal-impact',
      calls: [
        { tool: 'signals', args: c },
        { tool: 'risk', args: c },
      ],
      entities: { signalId: sig.id, signalTitle: sig.title },
      rationale: 'signal on a client',
    });
  }
  if (/\bltv\b|\bcollateral\b|\bmargin\b|\bheadroom\b|\blombard\b|\bfacility\b|\bloan\b/i.test(t)) {
    return base({
      shape: 'ltv',
      calls: [{ tool: 'clientCashflows', args: c }],
      rationale: 'collateral',
    });
  }
  if (
    /\bcash need|\bliquidity\b|\bcover(age)?\b|\bfunding\b|\bneeds? (cash|money|funds)\b|\bcommitments?\b|\bcapital calls?\b/i.test(
      t,
    )
  ) {
    return base({
      shape: 'cash',
      calls: [{ tool: 'clientCashflows', args: c }],
      rationale: 'liquidity',
    });
  }
  if (
    /\brubric\b|\bcapacity\b|\bappetite\b|\bhorizon\b|\brisk (profile|tolerance|score)\b|\bmismatch/i.test(
      t,
    )
  ) {
    return base({
      shape: 'rubric',
      calls: [
        { tool: 'rubric', args: c },
        { tool: 'clientOverview', args: c },
      ],
      rationale: 'rubric',
    });
  }
  if (/\btrade ideas?\b|\bideas?\b|\bwhat (could|can) (i|we) (offer|propose|pitch)\b/i.test(t)) {
    return base({ shape: 'ideas', calls: [{ tool: 'risk', args: c }], rationale: 'trade ideas' });
  }
  if (
    /\bnotes?\b|\bsaid\b|\bsay\b|\bmention|\btold\b|\bwants?\b|\bprefer|\bsensitiv|\bavoid\b|\blast (meeting|call)\b/i.test(
      t,
    )
  ) {
    return base({
      shape: 'notes',
      calls: [{ tool: 'clientNotes', args: c }],
      entities: { keyword: keywordPhrase(t) },
      rationale: 'notes',
    });
  }
  if (
    /\bwhat happened\b|\bperformance\b|\bsince\b|\bchange[sd]?\b|\bmove[ds]?\b|\b(down|up|fell|fall|drop|lost|gain)\b|\battribution\b|\bytd\b/i.test(
      t,
    )
  ) {
    return base({
      shape: 'what-happened',
      calls: [
        { tool: 'clientChange', args: c },
        { tool: 'signals', args: c },
      ],
      rationale: 'attribution and signals',
    });
  }
  if (
    /\bexposure\b|\bconcentrat|\blook-?through\b|\bbiggest (position|holding)\b|\btop holdings?\b|\bsector\b|\bregion\b/i.test(
      t,
    )
  ) {
    return base({
      shape: 'exposure',
      calls: [{ tool: 'clientExposure', args: c }],
      rationale: 'exposure',
    });
  }
  if (/\bkyc\b|\breview due\b|\bnext review\b/i.test(t)) {
    return base({ shape: 'kyc', calls: [{ tool: 'clientOverview', args: c }], rationale: 'KYC' });
  }
  if (
    /\brisk\b|\bmatrix\b|\bactions?\b|\bwhat should (i|we) do\b|\brecommend|\bnext step|\burgent\b|\bworr(y|ied)\b|\bproblem/i.test(
      t,
    )
  ) {
    return base({
      shape: 'risk',
      calls: [{ tool: 'risk', args: c }],
      rationale: 'combined risk and actions',
    });
  }
  if (/\bsignals?\b|\bmarket\b/i.test(t)) {
    return base({
      shape: 'signal-impact',
      calls: [
        { tool: 'signals', args: c },
        { tool: 'risk', args: c },
      ],
      rationale: 'signals reaching the client',
    });
  }
  return base({
    shape: 'client-summary',
    calls: [
      { tool: 'clientOverview', args: c },
      { tool: 'risk', args: c },
      { tool: 'clientCashflows', args: c },
    ],
    rationale: 'default client summary',
  });
}
