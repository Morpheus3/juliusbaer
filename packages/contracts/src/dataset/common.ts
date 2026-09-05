import { z } from 'zod';

/** The five dated snapshots at which positions are supplied. Order matters. */
export const SNAPSHOT_DATES = [
  '2025-12-31',
  '2026-02-27',
  '2026-03-31',
  '2026-06-30',
  '2026-08-26',
] as const;
export type SnapshotDate = (typeof SNAPSHOT_DATES)[number];
export const SnapshotDateSchema = z.enum(SNAPSHOT_DATES);

/** The dataset's notion of "today". */
export const DATASET_TODAY: SnapshotDate = '2026-08-26';
export const CURRENT_SNAPSHOT: SnapshotDate = SNAPSHOT_DATES[4];
export const BASELINE_SNAPSHOT: SnapshotDate = SNAPSHOT_DATES[0];

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** CSV cells arrive as strings; these coerce while rejecting garbage. */
export const NumCell = z.string().transform((v, ctx) => {
  const n = Number(v);
  if (v.trim() === '' || Number.isNaN(n)) {
    ctx.addIssue({ code: 'custom', message: `not a number: "${v}"` });
    return z.NEVER;
  }
  return n;
});
export const OptionalNumCell = z.string().transform((v) => (v.trim() === '' ? null : Number(v)));
export const OptionalStrCell = z.string().transform((v) => (v.trim() === '' ? null : v));
export const YesNoCell = z.enum(['Y', 'N']).transform((v) => v === 'Y');

export const AssetClassSchema = z.enum([
  'Cash and Equivalents',
  'Fixed Income',
  'Equity',
  'Alternatives',
  'Commodities',
  'Structured Products',
]);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const LiquidityTierSchema = z.enum([
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly Gate',
  'Illiquid',
]);
export type LiquidityTier = z.infer<typeof LiquidityTierSchema>;

export const ServiceModelSchema = z.enum(['Discretionary', 'Advisory', 'Custody']);
export type ServiceModel = z.infer<typeof ServiceModelSchema>;

export const SeveritySchema = z.enum(['Low', 'Medium', 'High', 'Severe']);
export type Severity = z.infer<typeof SeveritySchema>;
