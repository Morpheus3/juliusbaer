import type { FeatureManifestEntry, RubricDimension } from '@jb/contracts';
import type { Tone } from '@/components/Pill';

export const RUBRIC_LABEL: Record<RubricDimension, string> = {
  capacity: 'Risk capacity',
  appetite: 'Risk appetite',
  horizon: 'Investment horizon',
  context: 'Context',
};

export const RUBRIC_TONE: Record<RubricDimension, Tone> = {
  capacity: 'info',
  appetite: 'warn',
  horizon: 'ok',
  context: 'neutral',
};

export function fmtFeature(value: number | null, m: FeatureManifestEntry): string {
  if (value === null) {
    return '—';
  }
  switch (m.unit) {
    case 'count':
    case 'days':
      return value.toFixed(0);
    case 'years':
      return m.name === 'age' ? value.toFixed(0) : value.toFixed(1);
    case '-1..+1':
      return (value > 0 ? '+' : '') + value.toFixed(2);
    case 'pts':
      return (value > 0 ? '+' : '') + value.toFixed(1);
    case '1-10':
      return `${value.toFixed(0)}/10`;
    case 'months':
      return value >= 120 ? '120+' : value.toFixed(1);
    default:
      return value.toFixed(1);
  }
}

/** Groups manifest entries preserving first-seen order. */
export function groupBy<T>(items: readonly T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = map.get(k);
    if (list) {
      list.push(it);
    } else {
      map.set(k, [it]);
    }
  }
  return [...map.entries()];
}
