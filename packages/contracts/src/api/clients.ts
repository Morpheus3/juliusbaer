import { z } from 'zod';

export const ClientSummary = z.object({
  clientId: z.string(),
  name: z.string(),
  age: z.number().nullable(),
  isEntity: z.boolean(),
  bookingCentre: z.string(),
  baseCurrency: z.string(),
  wealthBand: z.string(),
  totalAumUsd: z.number(),
  riskProfile: z.string(),
  riskToleranceScore: z.number(),
  investmentHorizonYears: z.number(),
  liquidityNeeds: z.string(),
  lifeStage: z.string(),
  kycReviewDue: z.string(),
  portfolioCount: z.number(),
});
export type ClientSummary = z.infer<typeof ClientSummary>;

export const ClientListResponse = z.object({
  asOf: z.string(),
  clients: z.array(ClientSummary),
});
export type ClientListResponse = z.infer<typeof ClientListResponse>;
