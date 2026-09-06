import { z } from 'zod';
import { AssetClassSchema, SnapshotDateSchema } from '../dataset/common.js';

/** Alerts derivable from data alone (no LLM): shown in the Client 360 banner. */
export const ClientAlert = z.object({
  id: z.string(),
  kind: z.enum([
    'MARGIN_CALL_PROXIMITY',
    'MANDATE_BREACH',
    'CONCENTRATION',
    'LOOKTHROUGH_CONCENTRATION',
    'SUSTAINABILITY_EXCLUSION',
    'KYC_DUE',
    'CASH_NEED_APPROACHING',
    'LIQUIDITY_SHORTFALL',
    'STALE_VALUATION',
    'UNANSWERED_CONTACT',
  ]),
  severity: z.enum(['low', 'medium', 'high']),
  title: z.string(),
  detail: z.string(),
  evidence: z.record(z.string(), z.unknown()),
});
export type ClientAlert = z.infer<typeof ClientAlert>;

export const AllocationSlice = z.object({
  assetClass: AssetClassSchema,
  valueUsd: z.number(),
  weightPct: z.number(),
  /** Mandate band for the primary managed portfolio, when one applies. */
  band: z.object({ minPct: z.number(), targetPct: z.number(), maxPct: z.number() }).nullable(),
});
export type AllocationSlice = z.infer<typeof AllocationSlice>;

export const HoldingRowView = z.object({
  portfolioId: z.string(),
  instrumentId: z.string(),
  name: z.string(),
  assetClass: AssetClassSchema,
  subAssetClass: z.string(),
  sector: z.string().nullable(),
  region: z.string(),
  currency: z.string(),
  quantity: z.number(),
  priceLocal: z.number(),
  marketValueUsd: z.number(),
  marketValueBase: z.number(),
  weightPct: z.number(),
  householdWeightPct: z.number(),
  costBasisBase: z.number().nullable(),
  unrealisedPnlBase: z.number().nullable(),
  unrealisedPnlPct: z.number().nullable(),
  liquidityTier: z.string(),
  valuationDate: z.string(),
  acquiredDate: z.string(),
  concentration: z.object({
    applies: z.boolean(),
    limitPct: z.number().nullable(),
    breached: z.boolean(),
  }),
  sustainabilityExcluded: z.boolean(),
  stale: z.boolean(),
});
export type HoldingRowView = z.infer<typeof HoldingRowView>;

export const SeriesPoint = z.object({
  snapshotDate: SnapshotDateSchema,
  label: z.string(),
  valueUsd: z.number(),
});

export const ClientOverviewResponse = z.object({
  asOf: z.string(),
  client: z.object({
    clientId: z.string(),
    name: z.string(),
    wealthBand: z.string(),
    bookingCentre: z.string(),
    baseCurrency: z.string(),
    riskProfile: z.string(),
    riskToleranceScore: z.number(),
    lifeStage: z.string(),
    kycReviewDue: z.string(),
    lastContactDate: z.string().nullable(),
    lastContactChannel: z.string().nullable(),
    reportingLanguage: z.string(),
  }),
  kpis: z.object({
    aumUsd: z.number(),
    aumBaselineUsd: z.number(),
    ytdChangePct: z.number(),
    cashUsd: z.number(),
    cashPct: z.number(),
    unrealisedPnlUsd: z.number().nullable(),
    incomeYieldPct: z.number(),
    portfolioCount: z.number(),
    managedCount: z.number(),
  }),
  alerts: z.array(ClientAlert),
  allocation: z.array(AllocationSlice),
  topHoldings: z.array(HoldingRowView),
  aumSeries: z.array(SeriesPoint),
  portfolios: z.array(
    z.object({
      portfolioId: z.string(),
      name: z.string(),
      mandateCode: z.string(),
      mandateName: z.string(),
      serviceModel: z.string(),
      baseCurrency: z.string(),
      aumUsd: z.number(),
      series: z.array(SeriesPoint),
    }),
  ),
});
export type ClientOverviewResponse = z.infer<typeof ClientOverviewResponse>;

export const HoldingsResponse = z.object({
  snapshotDate: SnapshotDateSchema,
  snapshots: z.array(SnapshotDateSchema),
  totalUsd: z.number(),
  rows: z.array(HoldingRowView),
});
export type HoldingsResponse = z.infer<typeof HoldingsResponse>;

export const ExposureBucket = z.object({
  key: z.string(),
  directUsd: z.number(),
  lookthroughUsd: z.number(),
  directPct: z.number(),
  lookthroughPct: z.number(),
});
export type ExposureBucket = z.infer<typeof ExposureBucket>;

export const ExposureName = z.object({
  exposureName: z.string(),
  directUsd: z.number(),
  viaNotesUsd: z.number(),
  totalUsd: z.number(),
  totalPct: z.number(),
  limitPct: z.number().nullable(),
  breached: z.boolean(),
  sources: z.array(
    z.object({
      portfolioId: z.string(),
      instrumentId: z.string(),
      name: z.string(),
      usd: z.number(),
      via: z.string(),
    }),
  ),
});
export type ExposureName = z.infer<typeof ExposureName>;

export const ExposureResponse = z.object({
  snapshotDate: SnapshotDateSchema,
  totalUsd: z.number(),
  byAssetClass: z.array(ExposureBucket),
  bySector: z.array(ExposureBucket),
  byRegion: z.array(ExposureBucket),
  byCurrency: z.array(ExposureBucket),
  names: z.array(ExposureName),
  legs: z.array(
    z.object({
      instrumentId: z.string(),
      instrumentName: z.string(),
      noteUsd: z.number(),
      leg: z.string(),
      weight: z.number(),
      exposureName: z.string(),
      sector: z.string(),
      region: z.string(),
      exposureUsd: z.number(),
      note: z.string(),
    }),
  ),
  assumptions: z.array(z.string()),
});
export type ExposureResponse = z.infer<typeof ExposureResponse>;

export const TransactionView = z.object({
  transactionId: z.string(),
  tradeDate: z.string(),
  portfolioId: z.string(),
  type: z.string(),
  instrumentId: z.string().nullable(),
  instrumentName: z.string().nullable(),
  quantity: z.number().nullable(),
  priceLocal: z.number().nullable(),
  currency: z.string(),
  amount: z.number(),
  amountUsd: z.number(),
  narrative: z.string(),
});
export type TransactionView = z.infer<typeof TransactionView>;
export const TransactionsResponse = z.object({
  rows: z.array(TransactionView),
  types: z.array(z.string()),
  totalsUsdByType: z.record(z.string(), z.number()),
});
export type TransactionsResponse = z.infer<typeof TransactionsResponse>;

export const CashflowsResponse = z.object({
  asOf: z.string(),
  monthly: z.array(
    z.object({
      month: z.string(),
      incomeUsd: z.number(),
      feesUsd: z.number(),
      withdrawalsUsd: z.number(),
      otherUsd: z.number(),
    }),
  ),
  liquidity: z.object({
    dailyUsd: z.number(),
    weeklyMonthlyUsd: z.number(),
    gatedUsd: z.number(),
    illiquidUsd: z.number(),
  }),
  needs: z.array(
    z.object({
      needId: z.string(),
      description: z.string(),
      currency: z.string(),
      amount: z.number(),
      amountUsd: z.number(),
      dueFrom: z.string(),
      dueTo: z.string(),
      recurrence: z.string(),
      certainty: z.string(),
      status: z.enum(['running', 'upcoming', 'planned']),
      daysUntil: z.number(),
    }),
  ),
  commitments: z.array(
    z.object({
      commitmentId: z.string(),
      fundName: z.string(),
      uncalledUsd: z.number(),
      window: z.string(),
    }),
  ),
  facilities: z.array(
    z.object({
      facilityId: z.string(),
      type: z.string(),
      currency: z.string(),
      drawn: z.number(),
      limit: z.number(),
      ltvPct: z.number(),
      marginCallLtvPct: z.number(),
      ltvSeries: z.array(
        z.object({ snapshotDate: SnapshotDateSchema, ltvPct: z.number(), headroom: z.number() }),
      ),
    }),
  ),
  coverage12m: z.object({
    needsUsd: z.number(),
    dailyLiquidUsd: z.number(),
    ratio: z.number().nullable(),
  }),
});
export type CashflowsResponse = z.infer<typeof CashflowsResponse>;

/** Change between two snapshots decomposed into price, FX and flow effects. */
export const ChangeResponse = z.object({
  from: SnapshotDateSchema,
  to: SnapshotDateSchema,
  startUsd: z.number(),
  endUsd: z.number(),
  priceEffectUsd: z.number(),
  fxEffectUsd: z.number(),
  flowEffectUsd: z.number(),
  byAssetClass: z.array(
    z.object({
      assetClass: AssetClassSchema,
      startUsd: z.number(),
      endUsd: z.number(),
      priceEffectUsd: z.number(),
      fxEffectUsd: z.number(),
      flowEffectUsd: z.number(),
    }),
  ),
  movers: z.array(
    z.object({
      instrumentId: z.string(),
      name: z.string(),
      assetClass: AssetClassSchema,
      startUsd: z.number(),
      endUsd: z.number(),
      priceEffectUsd: z.number(),
      fxEffectUsd: z.number(),
      flowEffectUsd: z.number(),
      pricePct: z.number().nullable(),
    }),
  ),
  method: z.array(z.string()),
});
export type ChangeResponse = z.infer<typeof ChangeResponse>;

export const MandateStatusResponse = z.object({
  snapshotDate: SnapshotDateSchema,
  portfolios: z.array(
    z.object({
      portfolioId: z.string(),
      name: z.string(),
      mandateCode: z.string(),
      mandateName: z.string(),
      serviceModel: z.string(),
      managed: z.boolean(),
      maxSinglePositionPct: z.number().nullable(),
      rows: z.array(
        z.object({
          assetClass: AssetClassSchema,
          weightPct: z.number(),
          minPct: z.number(),
          targetPct: z.number(),
          maxPct: z.number(),
          status: z.enum(['within', 'below', 'above']),
          deviationPts: z.number(),
        }),
      ),
      singleLineBreaches: z.array(
        z.object({ instrumentId: z.string(), name: z.string(), weightPct: z.number() }),
      ),
      exclusionBreaches: z.array(
        z.object({ instrumentId: z.string(), name: z.string(), weightPct: z.number() }),
      ),
    }),
  ),
});
export type MandateStatusResponse = z.infer<typeof MandateStatusResponse>;

/** RM notes for a client, newest first. Text is quoted, never paraphrased, by the UI. */
export const NoteView = z.object({
  noteId: z.string(),
  date: z.string(),
  channel: z.string(),
  rmName: z.string(),
  text: z.string(),
});
export type NoteView = z.infer<typeof NoteView>;

export const NotesResponse = z.object({
  clientId: z.string(),
  notes: z.array(NoteView),
});
export type NotesResponse = z.infer<typeof NotesResponse>;
