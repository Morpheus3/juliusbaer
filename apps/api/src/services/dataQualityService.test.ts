import { describe, expect, it } from 'vitest';
import type { DataQualityIssue } from '@jb/contracts';
import { summarise } from './dataQualityService.js';

const issue = (over: Partial<DataQualityIssue>): DataQualityIssue => ({
  id: 'x',
  code: 'STALE_VALUATION',
  severity: 'warning',
  entityType: 'holding',
  entityId: 'PF-0004/2026-08-26/SYN-AL-0308',
  clientId: 'CL-0002',
  message: '',
  detail: {},
  detectedAt: '2026-09-05T00:00:00.000Z',
  ...over,
});

describe('summarise', () => {
  it('counts by severity and by code with every key present', () => {
    const s = summarise([
      issue({}),
      issue({ code: 'KYC_DUE_SOON', severity: 'warning' }),
      issue({ code: 'SUSTAINABILITY_EXCLUSION_HELD', severity: 'error' }),
    ]);
    expect(s.total).toBe(3);
    expect(s.bySeverity).toEqual({ info: 0, warning: 2, error: 1 });
    expect(s.byCode.STALE_VALUATION).toBe(1);
    expect(s.byCode.KYC_OVERDUE).toBe(0);
  });

  it('handles an empty register', () => {
    const s = summarise([]);
    expect(s.total).toBe(0);
    expect(s.issues).toEqual([]);
  });
});
