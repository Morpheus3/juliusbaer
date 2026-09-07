import { z } from 'zod';

/** Snapshot dates are discovered from the data at load time; they are plain ISO dates everywhere. */
export type SnapshotDate = string;
export const SnapshotDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/**
 * Cells arrive as strings from CSV and as JSON scalars from messages; these accept both, coerce, and
 * reject garbage.
 */
export const NumCell = z.union([z.number(), z.string()]).transform((v, ctx) => {
  if (typeof v === 'number') {
    return v;
  }
  const n = Number(v);
  if (v.trim() === '' || Number.isNaN(n)) {
    ctx.addIssue({ code: 'custom', message: `not a number: "${v}"` });
    return z.NEVER;
  }
  return n;
});
export const OptionalNumCell = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) =>
    v === null ? null : typeof v === 'number' ? v : v.trim() === '' ? null : Number(v),
  );
export const OptionalStrCell = z
  .union([z.string(), z.null()])
  .transform((v) => (v === null || v.trim() === '' ? null : v));
export const YesNoCell = z
  .union([z.enum(['Y', 'N']), z.boolean()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'Y'));

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
