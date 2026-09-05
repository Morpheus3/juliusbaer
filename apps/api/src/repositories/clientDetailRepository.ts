import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  clients,
  commitments,
  creditFacilities,
  creditFacilitySnapshots,
  holdings,
  instruments,
  issuerGroups,
  lookthroughLegs,
  mandates,
  marketContext,
  plannedCashNeeds,
  portfolioAum,
  portfolios,
  rmNotes,
  transactions,
  type Db,
} from '@jb/db';

export type ClientRecord = typeof clients.$inferSelect;
export type PortfolioRecord = typeof portfolios.$inferSelect;
export type HoldingRecord = typeof holdings.$inferSelect;
export type InstrumentRecord = typeof instruments.$inferSelect;
export type MandateRecord = typeof mandates.$inferSelect;
export type TransactionRecord = typeof transactions.$inferSelect;
export type CashNeedRecord = typeof plannedCashNeeds.$inferSelect;
export type CommitmentRecord = typeof commitments.$inferSelect;
export type FacilityRecord = typeof creditFacilities.$inferSelect;
export type FacilitySnapshotRecord = typeof creditFacilitySnapshots.$inferSelect;
export type LookthroughLegRecord = typeof lookthroughLegs.$inferSelect;
export type PortfolioAumRecord = typeof portfolioAum.$inferSelect;
export type NoteRecord = typeof rmNotes.$inferSelect;

/** Everything the client-detail services need for one client, fetched in parallel. */
export interface ClientBundle {
  client: ClientRecord;
  portfolios: PortfolioRecord[];
  portfolioAum: PortfolioAumRecord[];
  holdings: HoldingRecord[];
  instruments: Map<string, InstrumentRecord>;
  mandates: MandateRecord[];
  transactions: TransactionRecord[];
  cashNeeds: CashNeedRecord[];
  commitments: CommitmentRecord[];
  facilities: FacilityRecord[];
  facilitySnapshots: FacilitySnapshotRecord[];
  notes: NoteRecord[];
  lookthrough: LookthroughLegRecord[];
  issuers: Map<string, string>;
  /** (snapshotDate, seriesId) → value */
  fx: Map<string, number>;
}

export class ClientDetailRepository {
  constructor(private readonly db: Db) {}

  async bundle(clientId: string): Promise<ClientBundle | null> {
    const [client] = await this.db.select().from(clients).where(eq(clients.clientId, clientId));
    if (!client) {
      return null;
    }
    const pf = await this.db
      .select()
      .from(portfolios)
      .where(eq(portfolios.clientId, clientId))
      .orderBy(asc(portfolios.portfolioId));
    const pids = pf.map((p) => p.portfolioId);
    const mandateCodes = [...new Set(pf.map((p) => p.mandateCode))];

    const [aum, h, inst, m, tx, needs, com, fac, notes, lt, iss, fx] = await Promise.all([
      pids.length
        ? this.db.select().from(portfolioAum).where(inArray(portfolioAum.portfolioId, pids))
        : [],
      this.db.select().from(holdings).where(eq(holdings.clientId, clientId)),
      this.db.select().from(instruments),
      mandateCodes.length
        ? this.db.select().from(mandates).where(inArray(mandates.mandateCode, mandateCodes))
        : [],
      this.db
        .select()
        .from(transactions)
        .where(eq(transactions.clientId, clientId))
        .orderBy(asc(transactions.tradeDate), asc(transactions.transactionId)),
      this.db.select().from(plannedCashNeeds).where(eq(plannedCashNeeds.clientId, clientId)),
      this.db.select().from(commitments).where(eq(commitments.clientId, clientId)),
      this.db.select().from(creditFacilities).where(eq(creditFacilities.clientId, clientId)),
      this.db
        .select()
        .from(rmNotes)
        .where(eq(rmNotes.clientId, clientId))
        .orderBy(asc(rmNotes.noteDate)),
      this.db.select().from(lookthroughLegs),
      this.db.select().from(issuerGroups),
      this.db.select().from(marketContext).where(eq(marketContext.category, 'FX')),
    ]);
    const facIds = fac.map((f) => f.facilityId);
    const facSnaps = facIds.length
      ? await this.db
          .select()
          .from(creditFacilitySnapshots)
          .where(and(inArray(creditFacilitySnapshots.facilityId, facIds)))
      : [];

    return {
      client,
      portfolios: pf,
      portfolioAum: aum,
      holdings: h,
      instruments: new Map(inst.map((i) => [i.instrumentId, i])),
      mandates: m,
      transactions: tx,
      cashNeeds: needs,
      commitments: com,
      facilities: fac,
      facilitySnapshots: facSnaps,
      notes,
      lookthrough: lt,
      issuers: new Map(iss.map((i) => [i.instrumentId, i.exposureName])),
      fx: new Map(fx.map((r) => [`${r.snapshotDate}|${r.seriesId}`, r.value])),
    };
  }
}
