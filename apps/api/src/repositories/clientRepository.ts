import { asc, count, eq } from 'drizzle-orm';
import { clients, portfolios, type Db } from '@jb/db';

export interface ClientRow {
  clientId: string;
  clientName: string;
  age: number | null;
  gender: string;
  bookingCentre: string;
  baseCurrency: string;
  wealthBand: string;
  totalAumUsd: number;
  riskProfile: string;
  riskToleranceScore: number;
  investmentHorizonYears: number;
  liquidityNeeds: string;
  lifeStage: string;
  kycReviewDue: string;
  portfolioCount: number;
}

export class ClientRepository {
  constructor(private readonly db: Db) {}

  async listAll(): Promise<ClientRow[]> {
    return this.db
      .select({
        clientId: clients.clientId,
        clientName: clients.clientName,
        age: clients.age,
        gender: clients.gender,
        bookingCentre: clients.bookingCentre,
        baseCurrency: clients.baseCurrency,
        wealthBand: clients.wealthBand,
        totalAumUsd: clients.totalAumUsd,
        riskProfile: clients.riskProfile,
        riskToleranceScore: clients.riskToleranceScore,
        investmentHorizonYears: clients.investmentHorizonYears,
        liquidityNeeds: clients.liquidityNeeds,
        lifeStage: clients.lifeStage,
        kycReviewDue: clients.kycReviewDue,
        portfolioCount: count(portfolios.portfolioId),
      })
      .from(clients)
      .leftJoin(portfolios, eq(portfolios.clientId, clients.clientId))
      .groupBy(clients.clientId)
      .orderBy(asc(clients.clientId));
  }
}
