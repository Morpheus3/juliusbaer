import { describe, expect, it } from 'vitest';
import type { FeatureManifestEntry } from '@jb/contracts';
import { fmtFeature, groupBy } from './format';

const m = (unit: string, name = 'x'): FeatureManifestEntry => ({
  name,
  label: '',
  unit,
  description: '',
  rubric: 'context',
  higherMeans: '',
  group: '',
});

describe('fmtFeature', () => {
  it('formats by unit', () => {
    expect(fmtFeature(null, m('%'))).toBe('—');
    expect(fmtFeature(12.345, m('%'))).toBe('12.3');
    expect(fmtFeature(3, m('count'))).toBe('3');
    expect(fmtFeature(0.5, m('-1..+1'))).toBe('+0.50');
    expect(fmtFeature(-2.25, m('pts'))).toBe('-2.3');
    expect(fmtFeature(120, m('months'))).toBe('120+');
    expect(fmtFeature(66, m('years', 'age'))).toBe('66');
  });
});

describe('groupBy', () => {
  it('keeps first-seen order', () => {
    expect(groupBy(['b1', 'a1', 'b2'], (s) => s[0] ?? '')).toEqual([
      ['b', ['b1', 'b2']],
      ['a', ['a1']],
    ]);
  });
});
