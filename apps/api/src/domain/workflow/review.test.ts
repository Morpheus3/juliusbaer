import { describe, expect, it } from 'vitest';
import type { RankedAction } from '@jb/contracts';
import { requiredLevel, reviewAction } from './review.js';

const action = (over: Partial<RankedAction>): RankedAction => ({
  id: 'a',
  rank: 1,
  urgency: 'now',
  category: 'conversation',
  title: 't',
  evidence: 'e',
  benefit: 'b',
  tradeOff: 'x',
  score: 1,
  scoreParts: {},
  suitability: { status: 'ok', checks: [] },
  sources: { alertIds: ['al'], signalIds: [], rubric: [] },
  decision: { decision: 'approved', note: null, actor: 'RM', at: '2026-09-05T00:00:00Z' },
  ...over,
});
const ctx = {
  kycDaysToDue: 20,
  pep: false,
  rubric: { capacity: 2 as const, appetite: 2 as const, horizon: 2 as const },
  rubricLocked: true,
  rmLevel: 2,
  checker: null,
};

describe('reviewAction', () => {
  it('lets a single-approval conversation proceed when every check passes', () => {
    const r = reviewAction(action({}), ctx);
    expect(r.requiresChecker).toBe(false);
    expect(r.canProceed).toBe(true);
  });
  it('holds collateral actions for a checker and level 2', () => {
    const a = action({ category: 'collateral' });
    expect(requiredLevel(a)).toBe(2);
    const pending = reviewAction(a, ctx);
    expect(pending.checks.find((c) => c.name === 'Maker-checker')?.status).toBe('pending');
    expect(pending.canProceed).toBe(false);
    const checked = reviewAction(a, {
      ...ctx,
      checker: { decision: 'approved', actor: 'RM-2', at: 'x', note: null },
    });
    expect(checked.canProceed).toBe(true);
    expect(
      reviewAction(a, { ...ctx, rmLevel: 1 }).checks.find((c) => c.name === 'Permissions')?.status,
    ).toBe('blocked');
  });
  it('blocks on overdue KYC and a missing rubric', () => {
    expect(
      reviewAction(action({}), { ...ctx, kycDaysToDue: -3 }).checks.find(
        (c) => c.name === 'Compliance pre-clearance',
      )?.status,
    ).toBe('blocked');
    expect(reviewAction(action({}), { ...ctx, rubric: null }).canProceed).toBe(false);
  });
});
