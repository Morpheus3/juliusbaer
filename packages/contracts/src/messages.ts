/**
 * Ingest message contracts. One envelope, typed payloads per entity. A message arrives from Kafka or
 * from a batch file and is applied the same way. The idempotency key is the source system's own
 * identity for the change; the same key twice is a no-op.
 */
import { z } from 'zod';
import {
  ClientRow,
  CommitmentRow,
  CreditFacilityRow,
  EventLogRow,
  HoldingRow,
  InstrumentRow,
  MandateRow,
  MarketContextRow,
  PlannedCashNeedRow,
  PortfolioRow,
  RmNoteRow,
  TransactionRow,
} from './dataset/rows.js';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MessageType = z.enum([
  'client.upsert.v1',
  'client.offboard.v1',
  'rm.upsert.v1',
  'team.upsert.v1',
  'rm.assignment.v1',
  'portfolio.upsert.v1',
  'mandate.upsert.v1',
  'instrument.upsert.v1',
  'holdings.snapshot.v1',
  'prices.snapshot.v1',
  'facility_snapshot.v1',
  'transaction.v1',
  'credit_facility.upsert.v1',
  'commitment.upsert.v1',
  'cash_need.upsert.v1',
  'cash_need.delete.v1',
  'note.v1',
  'market_context.snapshot.v1',
  'event.v1',
]);
export type MessageType = z.infer<typeof MessageType>;

export const Envelope = z.object({
  type: MessageType,
  /** Source system + its sequence or change id, e.g. "core:assign:88213". */
  key: z.string().min(3).max(200),
  eventTime: z.iso.datetime({ offset: true }),
  source: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()),
});
export type Envelope = z.infer<typeof Envelope>;

/* ---- payloads. Row shapes reuse the dataset contracts so a message is one CSV row, typed. */

export const RmPayload = z.object({
  rmId: z.string().min(1),
  name: z.string().min(1),
  desk: z.string().default(''),
  teamId: z.string().optional(),
  email: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});
export type RmPayload = z.infer<typeof RmPayload>;

export const TeamPayload = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  desk: z.string().default(''),
  headRmId: z.string().optional(),
});
export type TeamPayload = z.infer<typeof TeamPayload>;

export const AssignmentPayload = z.object({
  clientId: z.string().min(1),
  rmId: z.string().min(1),
  role: z.enum(['primary', 'secondary', 'checker', 'cover']).default('primary'),
  validFrom: IsoDate,
  validTo: IsoDate.optional(),
  reason: z.string().max(300).optional(),
});
export type AssignmentPayload = z.infer<typeof AssignmentPayload>;

export const OffboardPayload = z.object({
  clientId: z.string().min(1),
  reason: z.string().max(300).optional(),
});
export type OffboardPayload = z.infer<typeof OffboardPayload>;

export const HoldingsSnapshotPayload = z.object({
  snapshotDate: IsoDate,
  label: z.string().optional(),
  /** Whole-household snapshot for one client: replaces that client's rows at that date. */
  clientId: z.string().min(1),
  holdings: z.array(HoldingRow),
  portfolioAum: z.array(z.object({ portfolioId: z.string(), aumBase: z.number() })).default([]),
});
export type HoldingsSnapshotPayload = z.infer<typeof HoldingsSnapshotPayload>;

export const PricesSnapshotPayload = z.object({
  snapshotDate: IsoDate,
  prices: z.array(z.object({ instrumentId: z.string(), priceLocal: z.number() })),
});
export type PricesSnapshotPayload = z.infer<typeof PricesSnapshotPayload>;

export const FacilitySnapshotPayload = z.object({
  facilityId: z.string(),
  snapshotDate: IsoDate,
  drawn: z.number(),
  collateralMarketValue: z.number(),
  lendingValue: z.number(),
  ltvPct: z.number(),
  headroom: z.number(),
});
export type FacilitySnapshotPayload = z.infer<typeof FacilitySnapshotPayload>;

export const MarketContextSnapshotPayload = z.object({
  snapshotDate: IsoDate,
  label: z.string().optional(),
  series: z.array(MarketContextRow),
});
export type MarketContextSnapshotPayload = z.infer<typeof MarketContextSnapshotPayload>;

export const CashNeedDeletePayload = z.object({
  needId: z.string().min(1),
  clientId: z.string().min(1),
});
export type CashNeedDeletePayload = z.infer<typeof CashNeedDeletePayload>;

export const PAYLOAD_SCHEMAS: Record<MessageType, z.ZodType> = {
  'client.upsert.v1': ClientRow,
  'client.offboard.v1': OffboardPayload,
  'rm.upsert.v1': RmPayload,
  'team.upsert.v1': TeamPayload,
  'rm.assignment.v1': AssignmentPayload,
  'portfolio.upsert.v1': PortfolioRow,
  'mandate.upsert.v1': MandateRow,
  'instrument.upsert.v1': InstrumentRow,
  'holdings.snapshot.v1': HoldingsSnapshotPayload,
  'prices.snapshot.v1': PricesSnapshotPayload,
  'facility_snapshot.v1': FacilitySnapshotPayload,
  'transaction.v1': TransactionRow,
  'credit_facility.upsert.v1': CreditFacilityRow,
  'commitment.upsert.v1': CommitmentRow,
  'cash_need.upsert.v1': PlannedCashNeedRow,
  'cash_need.delete.v1': CashNeedDeletePayload,
  'note.v1': RmNoteRow,
  'market_context.snapshot.v1': MarketContextSnapshotPayload,
  'event.v1': EventLogRow,
};

/** Validates envelope and payload together; the payload comes back typed by its schema. */
export function parseMessage(raw: unknown): Envelope {
  const env = Envelope.parse(raw);
  const payload = PAYLOAD_SCHEMAS[env.type].parse(env.payload) as Record<string, unknown>;
  return { ...env, payload };
}
