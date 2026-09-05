import { describe, expect, it } from 'vitest';
import type { VectorRun } from '../repositories/vectorRepository.js';
import { toFeatureValues, toPeers } from './vectorService.js';

const run: VectorRun = {
  id: 'run',
  createdAt: new Date('2026-09-05T00:00:00Z'),
  engineVersion: 'vector-engine/0.1.0',
  datasetToday: '2026-08-26',
  manifest: [
    {
      name: 'cash_pct',
      label: 'Cash share',
      unit: '%',
      description: '',
      rubric: 'capacity',
      higherMeans: '',
      group: 'Liquidity',
    },
    {
      name: 'ltv_pct',
      label: 'LTV',
      unit: '%',
      description: '',
      rubric: 'capacity',
      higherMeans: '',
      group: 'Leverage',
    },
  ],
};

describe('toFeatureValues', () => {
  it('follows manifest order and fills gaps with null', () => {
    const out = toFeatureValues(
      run,
      { cash_pct: 12.5 },
      { cash_pct: 40 },
      { cash_pct: { sources: ['raw.holdings'] } },
    );
    expect(out.map((f) => f.name)).toEqual(['cash_pct', 'ltv_pct']);
    expect(out[0]).toEqual({
      name: 'cash_pct',
      value: 12.5,
      percentile: 40,
      evidence: { sources: ['raw.holdings'] },
    });
    expect(out[1]).toEqual({ name: 'ltv_pct', value: null, percentile: null, evidence: {} });
  });
});

describe('toPeers', () => {
  it('resolves names and falls back to the id', () => {
    const peers = toPeers(
      [
        { clientId: 'CL-0002', distance: 1.2, differences: [] },
        { clientId: 'CL-9999', distance: 2, differences: [] },
      ],
      new Map([['CL-0002', 'Ravi Chandrasekaran']]),
    );
    expect(peers[0]?.name).toBe('Ravi Chandrasekaran');
    expect(peers[1]?.name).toBe('CL-9999');
  });
});
