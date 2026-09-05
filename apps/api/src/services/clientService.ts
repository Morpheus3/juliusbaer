import type { ClientListResponse, ClientSummary } from '@jb/contracts';
import type { ClientRepository, ClientRow } from '../repositories/clientRepository.js';

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
    private readonly datasetToday: string,
  ) {}

  async list(): Promise<ClientListResponse> {
    const rows = await this.clients.listAll();
    return { asOf: this.datasetToday, clients: rows.map(toClientSummary) };
  }
}
