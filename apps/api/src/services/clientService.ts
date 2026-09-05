import type { ClientListResponse, ClientSummary } from '@jb/contracts';
import type { ClientRepository, ClientRow } from '../repositories/clientRepository.js';
import type { DatasetContext } from './datasetContext.js';

export function toClientSummary(row: ClientRow): ClientSummary {
  return {
    clientId: row.clientId,
    name: row.clientName,
    age: row.age,
    isEntity: row.gender === 'Entity',
    bookingCentre: row.bookingCentre,
    baseCurrency: row.baseCurrency,
    wealthBand: row.wealthBand,
    totalAumUsd: row.totalAumUsd,
    riskProfile: row.riskProfile,
    riskToleranceScore: row.riskToleranceScore,
    investmentHorizonYears: row.investmentHorizonYears,
    liquidityNeeds: row.liquidityNeeds,
    lifeStage: row.lifeStage,
    kycReviewDue: row.kycReviewDue,
    portfolioCount: row.portfolioCount,
  };
}

export class ClientService {
  constructor(
    private readonly clients: ClientRepository,
    private readonly ctx: DatasetContext,
  ) {}

  async list(): Promise<ClientListResponse> {
    const [rows, today] = await Promise.all([this.clients.listAll(), this.ctx.today()]);
    return { asOf: today, clients: rows.map(toClientSummary) };
  }
}
