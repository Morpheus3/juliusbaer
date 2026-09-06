import type { Theme } from '@jb/contracts';

export type ChapterAnchor = 'stand' | 'happened' | 'could' | 'do';

/** Which journey chapter a lane item opens: signals are history, valuation is standing, collateral and liquidity are what could happen, the rest is action. */
const BY_THEME: Record<Theme, ChapterAnchor> = {
  signal: 'happened',
  valuation: 'stand',
  collateral: 'could',
  liquidity: 'could',
  concentration: 'do',
  mandate: 'do',
  compliance: 'do',
  contact: 'do',
};

export function chapterFor(theme: Theme): ChapterAnchor {
  return BY_THEME[theme];
}
