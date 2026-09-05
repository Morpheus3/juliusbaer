import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATASET_TODAY } from '@jb/contracts';
import { repoRoot } from '../../env.js';
import { readDataset } from '../dataset.js';
import { runQualityChecks } from './index.js';

/**
 * Runs the register against the real dataset. The expectations are the artefacts the data
 * dictionary tells us to look for, verified by hand before the checks were written.
 */
describe('quality checks on the shipped dataset', async () => {
  const data = await readDataset(path.join(repoRoot(), 'data'));
  const findings = runQualityChecks(data, DATASET_TODAY);
  const byCode = (code: string) => findings.filter((f) => f.code === code);

  it('validates every source file', () => {
    expect(data.clients).toHaveLength(20);
    expect(data.holdings).toHaveLength(1015);
    expect(data.eventLog).toHaveLength(16);
  });

  it('finds the stale Aranya valuation in the founder custody account', () => {
    const stale = byCode('STALE_VALUATION');
    expect(stale.length).toBeGreaterThan(0);
    expect(
      stale.every((f) => f.clientId === 'CL-0002' && f.detail.valuationDate === '2025-09-30'),
    ).toBe(true);
  });

  it('flags the transferred-in portfolio for missing tax lots', () => {
    const missing = byCode('MISSING_COST_BASIS');
    expect(missing.length).toBeGreaterThan(0);
    expect(new Set(missing.map((f) => f.clientId))).toEqual(new Set(['CL-0003']));
  });

  it('registers the family office as an entity', () => {
    expect(byCode('ENTITY_WITHOUT_AGE').map((f) => f.entityId)).toEqual(['CL-0017']);
  });

  it('lists KYC reviews due within 45 days of the dataset today', () => {
    expect(
      byCode('KYC_DUE_SOON')
        .map((f) => f.entityId)
        .sort(),
    ).toEqual(['CL-0004', 'CL-0008', 'CL-0011', 'CL-0012', 'CL-0014']);
    expect(byCode('KYC_OVERDUE')).toHaveLength(0);
  });

  it('finds both excluded instruments inside the Sustainable Balanced mandate', () => {
    const held = byCode('SUSTAINABILITY_EXCLUSION_HELD');
    expect(held).toHaveLength(2);
    expect(held.every((f) => f.clientId === 'CL-0005')).toBe(true);
  });

  it('confirms the arithmetic the dataset gets right', () => {
    expect(byCode('AUM_RECONCILIATION')).toHaveLength(0);
    expect(byCode('WEIGHT_SUM')).toHaveLength(0);
    expect(byCode('LTV_RECOMPUTE')).toHaveLength(0);
    expect(byCode('COMMITMENT_ARITHMETIC')).toHaveLength(0);
    expect(byCode('ORPHAN_REFERENCE')).toHaveLength(0);
  });
});
