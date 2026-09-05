import { desc, eq } from 'drizzle-orm';
import {
  clientFactual,
  clientVectors,
  clients,
  vectorRuns,
  type Db,
  type FeatureManifestEntry,
  type PeerRef,
} from '@jb/db';

export interface VectorRun {
  id: string;
  createdAt: Date;
  engineVersion: string;
  datasetToday: string;
  manifest: FeatureManifestEntry[];
}

export interface ClientVectorRow {
  clientId: string;
  name: string;
  features: Record<string, number | null>;
  percentiles: Record<string, number | null>;
  evidence: Record<string, unknown>;
  peers: PeerRef[];
}

export class VectorRepository {
  constructor(private readonly db: Db) {}

  async latestRun(): Promise<VectorRun | null> {
    const [row] = await this.db
      .select()
      .from(vectorRuns)
      .orderBy(desc(vectorRuns.createdAt))
      .limit(1);
    return row ?? null;
  }

  async factual(clientId: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.db
      .select({ facts: clientFactual.facts })
      .from(clientFactual)
      .where(eq(clientFactual.clientId, clientId));
    return row?.facts ?? null;
  }

  async vector(clientId: string): Promise<ClientVectorRow | null> {
    const [row] = await this.db
      .select({
        clientId: clientVectors.clientId,
        name: clients.clientName,
        features: clientVectors.features,
        percentiles: clientVectors.percentiles,
        evidence: clientVectors.evidence,
        peers: clientVectors.peers,
      })
      .from(clientVectors)
      .innerJoin(clients, eq(clients.clientId, clientVectors.clientId))
      .where(eq(clientVectors.clientId, clientId));
    return row ?? null;
  }

  async allVectors(): Promise<ClientVectorRow[]> {
    return this.db
      .select({
        clientId: clientVectors.clientId,
        name: clients.clientName,
        features: clientVectors.features,
        percentiles: clientVectors.percentiles,
        evidence: clientVectors.evidence,
        peers: clientVectors.peers,
      })
      .from(clientVectors)
      .innerJoin(clients, eq(clients.clientId, clientVectors.clientId))
      .orderBy(clientVectors.clientId);
  }

  async clientNames(): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ id: clients.clientId, name: clients.clientName })
      .from(clients);
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
