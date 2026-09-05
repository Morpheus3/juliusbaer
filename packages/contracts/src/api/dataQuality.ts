import { z } from 'zod';

/** Stable machine codes for detected artefacts. The UI maps these to copy. */
export const DataQualityCode = z.enum([
  'STALE_VALUATION',
  'MISSING_COST_BASIS',
  'ENTITY_WITHOUT_AGE',
  'CUSTODY_OUTSIDE_MANDATE',
  'KYC_OVERDUE',
  'KYC_DUE_SOON',
  'MISSING_SECTOR',
  'PRIVATE_MARKET_MARK_LAG',
  'AUM_RECONCILIATION',
  'WEIGHT_SUM',
  'LTV_RECOMPUTE',
  'COMMITMENT_ARITHMETIC',
  'ORPHAN_REFERENCE',
  'SUSTAINABILITY_EXCLUSION_HELD',
]);
export type DataQualityCode = z.infer<typeof DataQualityCode>;

export const DataQualitySeverity = z.enum(['info', 'warning', 'error']);
export type DataQualitySeverity = z.infer<typeof DataQualitySeverity>;

export const DataQualityIssue = z.object({
  id: z.string(),
  code: DataQualityCode,
  severity: DataQualitySeverity,
  entityType: z.string(),
  entityId: z.string(),
  clientId: z.string().nullable(),
  message: z.string(),
  detail: z.record(z.string(), z.unknown()),
  detectedAt: z.string(),
});
export type DataQualityIssue = z.infer<typeof DataQualityIssue>;

export const DataQualitySummary = z.object({
  total: z.number(),
  bySeverity: z.record(DataQualitySeverity, z.number()),
  byCode: z.record(DataQualityCode, z.number()),
  issues: z.array(DataQualityIssue),
});
export type DataQualitySummary = z.infer<typeof DataQualitySummary>;
