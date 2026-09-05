/**
 * Recommendation review: the checks an approved action must pass before the RM proceeds. All
 * deterministic; the maker-checker state comes from recorded decisions.
 */
import type { ActionReview, RankedAction, ReviewCheck } from '@jb/contracts';
import type { RubricScores } from '../risk/combined.js';

export interface ReviewContext {
  kycDaysToDue: number;
  pep: boolean;
  rubric: RubricScores | null;
  rubricLocked: boolean;
  rmLevel: number;
  checker: ActionReview['checker'];
}

/** Collateral, rebalance and liquidity actions move money or risk and need a second pair of eyes and level 2. */
export function requiredLevel(a: RankedAction): number {
  return a.category === 'collateral' || a.category === 'rebalance' || a.category === 'liquidity'
    ? 2
    : 1;
}

export function requiresChecker(a: RankedAction): boolean {
  return requiredLevel(a) >= 2;
}

export function reviewAction(a: RankedAction, ctx: ReviewContext): ActionReview {
  const checks: ReviewCheck[] = [];
  checks.push({
    name: 'Suitability check',
    status:
      a.suitability.status === 'ok'
        ? 'ok'
        : a.suitability.status === 'review'
          ? 'pending'
          : 'blocked',
    detail:
      a.suitability.status === 'ok'
        ? 'All suitability rules passed.'
        : `${a.suitability.checks
            .filter((c) => !c.passed)
            .map((c) => c.rule)
            .join(
              ', ',
            )} need${a.suitability.checks.filter((c) => !c.passed).length === 1 ? 's' : ''} attention.`,
  });
  const kycOk = ctx.kycDaysToDue >= 0;
  checks.push({
    name: 'Compliance pre-clearance',
    status: !kycOk ? 'blocked' : ctx.pep ? 'pending' : 'ok',
    detail: !kycOk
      ? `KYC review overdue by ${-ctx.kycDaysToDue} days; clear it before acting.`
      : ctx.pep
        ? 'Client is a politically exposed person; enhanced approval applies.'
        : 'KYC current, no PEP flag, no sanctions hit recorded in the dataset.',
  });
  const hasEvidence =
    a.sources.alertIds.length + a.sources.signalIds.length + a.sources.rubric.length > 0 ||
    a.evidence.length > 0;
  checks.push({
    name: 'Explainability',
    status: hasEvidence ? 'ok' : 'blocked',
    detail: hasEvidence
      ? `Evidence attached: ${[...a.sources.alertIds, ...a.sources.signalIds].join(', ') || 'derived from the client record'}.`
      : 'No evidence attached.',
  });
  const needsChecker = requiresChecker(a);
  checks.push({
    name: 'Maker-checker',
    status: !needsChecker
      ? 'ok'
      : ctx.checker?.decision === 'approved'
        ? 'ok'
        : ctx.checker?.decision === 'rejected'
          ? 'blocked'
          : 'pending',
    detail: !needsChecker
      ? 'Single approval is sufficient for this category.'
      : ctx.checker
        ? `${ctx.checker.decision} by ${ctx.checker.actor}${ctx.checker.note ? `: ${ctx.checker.note}` : ''}.`
        : 'Awaiting a second RM.',
  });
  const level = requiredLevel(a);
  checks.push({
    name: 'Permissions',
    status: ctx.rmLevel >= level ? 'ok' : 'blocked',
    detail: `RM-Level-${level} required. Current user: RM-Level-${ctx.rmLevel}. ${ctx.rmLevel >= level ? 'OK.' : 'Insufficient.'}`,
  });
  checks.push({
    name: 'Suitability record',
    status: ctx.rubric ? (ctx.rubricLocked ? 'ok' : 'pending') : 'blocked',
    detail: ctx.rubric
      ? ctx.rubricLocked
        ? 'Locked rubric attached to the audit trail.'
        : 'Rubric assessed but not locked; lock it to freeze the record.'
      : 'No rubric assessment; run one before acting.',
  });
  const canProceed = a.decision?.decision === 'approved' && checks.every((c) => c.status === 'ok');
  return {
    action: a,
    checks,
    requiresChecker: needsChecker,
    checker: ctx.checker,
    requiredLevel: level,
    canProceed,
  };
}
