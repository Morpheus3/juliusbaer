/**
 * Deterministic fallback draft used when the Claude gateway is unavailable. English only, plainly
 * labelled as a template in the UI, numbers injected from data.
 */
export interface OutreachContext {
  clientName: string;
  rmName: string;
  reportingLanguage: string;
  actions: { title: string; evidence: string }[];
  signals: { title: string; whyItMatters: string }[];
  impactSummary: string | null;
}

export function templateDraft(
  ctx: OutreachContext,
  channel: string,
): { subject: string; body: string; factsUsed: string[]; caveats: string[] } {
  const topic = ctx.actions[0]?.title ?? ctx.signals[0]?.title ?? 'your portfolio';
  const facts: string[] = [];
  const lines: string[] = [`Dear ${ctx.clientName},`, ''];
  if (ctx.signals.length > 0) {
    lines.push(
      `I wanted to reach out regarding ${ctx.signals.length === 1 ? 'a recent development' : 'recent developments'} in the markets that touch your portfolio.`,
    );
    for (const s of ctx.signals.slice(0, 2)) {
      lines.push(`${s.title}. ${s.whyItMatters}`);
      facts.push(s.title);
    }
    lines.push('');
  }
  if (ctx.impactSummary) {
    lines.push(ctx.impactSummary, '');
    facts.push(ctx.impactSummary);
  }
  if (ctx.actions.length > 0) {
    lines.push('I would like to discuss the following with you:');
    for (const a of ctx.actions.slice(0, 3)) {
      lines.push(`- ${a.title}. ${a.evidence}`);
      facts.push(a.title);
    }
    lines.push('');
  }
  lines.push(
    channel === 'call-notes'
      ? 'Points to cover on the call are above; I will confirm a time that suits you.'
      : 'I would welcome a brief call at your convenience to go through the options. Nothing needs to be decided before we speak.',
    '',
    'Kind regards,',
    ctx.rmName,
  );
  const caveats = [
    'Template draft: the language model was unavailable, so this is in English and follows a fixed structure.',
  ];
  if (ctx.reportingLanguage.toLowerCase() !== 'english') {
    caveats.push(
      `The client's reporting language is ${ctx.reportingLanguage}; translate or redraft before sending.`,
    );
  }
  return {
    subject: `Portfolio update: ${topic}`,
    body: lines.join('\n'),
    factsUsed: facts,
    caveats,
  };
}
