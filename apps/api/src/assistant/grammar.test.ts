import { describe, expect, it } from 'vitest';
import { dateFor, instrumentPhrase, resolveClient, resolveSignal } from './entities.js';
import { planFromGrammar, type GrammarContext } from './grammar.js';

const ctx: GrammarContext = {
  clock: '2026-08-26', // Wednesday
  contextClientId: 'CL-0014',
  clients: [
    { clientId: 'CL-0014', name: 'Lau Chi Ming' },
    { clientId: 'CL-0013', name: 'Zhang Meiling' },
    { clientId: 'CL-0003', name: 'Margarethe Voss-Brenner' },
    { clientId: 'CL-0001', name: 'Hartono Wijaya Kusuma' },
  ],
  signals: [
    { id: 's-fed', title: 'Federal Reserve holds again at 3.50-3.75%', date: '2026-07-29' },
    {
      id: 's-tech',
      title: 'Megacap technology complex briefly sheds around USD 2 trillion',
      date: '2026-06-05',
    },
    { id: 's-oil', title: 'Strait of Hormuz blockade reimposed', date: '2026-08-05' },
  ],
  scenarios: [
    { id: 'escalation', name: 'Middle East escalation' },
    { id: 'fed-hike', name: 'Fed hikes 25bp' },
  ],
};

describe('entities', () => {
  it('resolves clients by id, full name and a distinctive token', () => {
    expect(resolveClient('what about CL-0013', ctx.clients)?.clientId).toBe('CL-0013');
    expect(resolveClient('why is lau first', ctx.clients)?.clientId).toBe('CL-0014');
    expect(resolveClient("Voss-Brenner's ltv", ctx.clients)?.clientId).toBe('CL-0003');
    expect(resolveClient('who has excluded holdings', ctx.clients)).toBeNull();
  });
  it('resolves signals through alias families', () => {
    expect(resolveSignal('what did the fed hold do to Lau', ctx.signals)?.id).toBe('s-fed');
    expect(resolveSignal('the oil blockade', ctx.signals)?.id).toBe('s-oil');
  });
  it('reads dates relative to the clock', () => {
    expect(dateFor('defer Lau to Monday', '2026-08-26')).toBe('2026-08-31');
    expect(dateFor('defer to tomorrow', '2026-08-26')).toBe('2026-08-27');
    expect(dateFor('until 2026-09-10', '2026-08-26')).toBe('2026-09-10');
    expect(dateFor('to 3 Sep', '2026-08-26')).toBe('2026-09-03');
  });
  it('reads the instrument being sold', () => {
    expect(instrumentPhrase('does selling the Pacific Rim perpetual clear the limit?')).toBe(
      'Pacific Rim perpetual',
    );
    expect(instrumentPhrase('trim Golden Harbour Properties to 12%')).toBe(
      'Golden Harbour Properties',
    );
  });
});

describe('planFromGrammar', () => {
  it('routes a priority question to the call plan for the named client', () => {
    const p = planFromGrammar('why is Lau first this morning?', ctx);
    expect(p.intent).toBe('ask');
    expect(p.shape).toBe('why-first');
    expect(p.scopeClientId).toBe('CL-0014');
    expect(p.calls[0]?.tool).toBe('callPlan');
  });
  it('uses the client in context for pronouns', () => {
    const p = planFromGrammar('what is his LTV?', ctx);
    expect(p.shape).toBe('ltv');
    expect(p.scopeClientId).toBe('CL-0014');
  });
  it('recognises a what-if sale against the limit', () => {
    const p = planFromGrammar(
      'does trimming the Pacific Rim perpetual clear the concentration limit?',
      ctx,
    );
    expect(p.shape).toBe('sell-clears-limit');
    expect(p.entities.instrument).toBe('Pacific Rim perpetual');
  });
  it('treats a companion cue about selling as the what-if, even without the word limit', () => {
    const p = planFromGrammar('asking about selling the Pacific Rim perpetual', ctx);
    expect(p.shape).toBe('sell-clears-limit');
    expect(p.entities.instrument).toBe('Pacific Rim perpetual');
  });
  it('finds clients by signal reach and by contact gap without a client', () => {
    expect(planFromGrammar('who should hear about the fed hold?', ctx).calls[0]).toMatchObject({
      tool: 'findClients',
      args: { signalId: 's-fed' },
    });
    const q = planFromGrammar('which clients have not been contacted in 60 days?', ctx);
    expect(q.calls[0]).toMatchObject({ tool: 'findClients', args: { uncontactedDays: 60 } });
    expect(q.scopeClientId).toBeNull();
  });
  it('finds clients by alert kind and by lane', () => {
    expect(planFromGrammar('who has excluded holdings?', ctx).calls[0]?.args).toMatchObject({
      alertKind: 'SUSTAINABILITY_EXCLUSION',
    });
    expect(planFromGrammar('which clients need action now?', ctx).calls[0]?.args).toMatchObject({
      lane: 'now',
    });
  });
  it('compares named clients', () => {
    const p = planFromGrammar('compare Lau and Zhang', ctx);
    expect(p.shape).toBe('compare');
    expect(p.calls[0]?.args).toMatchObject({ clientIds: ['CL-0014', 'CL-0013'] });
  });
  it('turns a deferral sentence into a proposal with date and reason', () => {
    const p = planFromGrammar('defer Lau to Monday because he is travelling', ctx);
    expect(p.intent).toBe('do');
    expect(p.proposals[0]).toMatchObject({
      kind: 'defer',
      clientId: 'CL-0014',
      args: { until: '2026-08-31', reason: 'he is travelling' },
    });
  });
  it('turns "log the call" into done plus a draft when asked', () => {
    const p = planFromGrammar(
      'log the call: agreed to top up collateral by Friday, draft the confirmation email',
      ctx,
    );
    expect(p.proposals.map((x) => x.kind)).toEqual(['done', 'draft']);
  });
  it('navigates to a room for a client and to book rooms', () => {
    expect(planFromGrammar("show me Zhang's cash flows", ctx).navigate).toBe(
      '/clients/CL-0013/portfolio/cashflows',
    );
    expect(planFromGrammar('open the board', ctx).navigate).toBe('/board');
    expect(planFromGrammar('switch to Hartono', ctx).navigate).toBe('/clients/CL-0001');
  });
  it('answers market questions book-wide and scenarios per client', () => {
    expect(planFromGrammar('what are the latest market signals?', ctx).shape).toBe('signals-today');
    const s = planFromGrammar('run the middle east escalation on Zhang, severe', ctx);
    expect(s.shape).toBe('scenario');
    expect(s.calls[0]?.args).toMatchObject({
      clientId: 'CL-0013',
      scenarioId: 'escalation',
      severity: 'severe',
    });
  });
  it('does not mistake a note question for a scenario', () => {
    const p = planFromGrammar('what did he say about the property?', {
      ...ctx,
      scenarios: [...ctx.scenarios, { id: 'hk-property', name: 'Hong Kong property leg down' }],
    });
    expect(p.shape).toBe('notes');
    expect(p.entities.keyword).toBe('property');
  });
  it('routes promise and idea-desk questions', () => {
    expect(planFromGrammar('what did I promise Lau?', ctx).shape).toBe('promises');
    expect(planFromGrammar('what did I promise Lau?', ctx).calls[0]?.args).toMatchObject({
      clientId: 'CL-0014',
    });
    expect(
      planFromGrammar('show all open promises across the book', { ...ctx, contextClientId: null })
        .calls[0]?.args,
    ).toEqual({});
    const i = planFromGrammar('which clients fit short-duration credit after the fed hold?', ctx);
    expect(i.shape).toBe('idea-desk');
    expect(i.calls[0]?.args).toMatchObject({ signalId: 's-fed' });
  });
  it('asks for a client when none can be resolved', () => {
    const p = planFromGrammar('what is the LTV?', { ...ctx, contextClientId: null });
    expect(p.intent).toBe('help');
  });
});
