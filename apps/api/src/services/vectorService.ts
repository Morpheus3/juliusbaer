import {
  ClientFactual,
  type ClientVectorResponse,
  type FeatureValue,
  type PeerRef,
  type VectorBookResponse,
  type VectorRebuildResponse,
} from '@jb/contracts';
import type { PeerRef as StoredPeer } from '@jb/db';
import type { VectorRepository, VectorRun } from '../repositories/vectorRepository.js';
import type { AnalyticsClient } from './analyticsClient.js';

export class NoVectorRunError extends Error {
  constructor() {
    super('Customer vectors have not been built. POST /api/v1/vectors/rebuild first.');
    this.name = 'NoVectorRunError';
  }
}

export class ClientNotFoundError extends Error {
  constructor(clientId: string) {
    super(`Client ${clientId} not found`);
    this.name = 'ClientNotFoundError';
  }
}

/** Joins the stored vector, percentiles and evidence into the ordered feature list the UI renders. */
export function toFeatureValues(
  run: VectorRun,
  features: Record<string, number | null>,
  percentiles: Record<string, number | null>,
  evidence: Record<string, unknown>,
): FeatureValue[] {
  return run.manifest.map((m) => {
    const ev = evidence[m.name];
    return {
      name: m.name,
      value: features[m.name] ?? null,
      percentile: percentiles[m.name] ?? null,
      evidence: typeof ev === 'object' && ev !== null ? (ev as Record<string, unknown>) : {},
    };
  });
}

export function toPeers(stored: StoredPeer[], names: Map<string, string>): PeerRef[] {
  return stored.map((p) => ({ ...p, name: names.get(p.clientId) ?? p.clientId }));
}

export class VectorService {
  constructor(
    private readonly repo: VectorRepository,
    private readonly analytics: AnalyticsClient,
  ) {}

  private async requireRun(): Promise<VectorRun> {
    const run = await this.repo.latestRun();
    if (!run) {
      throw new NoVectorRunError();
    }
    return run;
  }

  async rebuild(): Promise<VectorRebuildResponse> {
    const r = await this.analytics.buildVectors();
    return {
      runId: r.run_id,
      engineVersion: r.engine_version,
      clientCount: r.client_count,
      featureCount: r.feature_count,
    };
  }

  async forClient(clientId: string): Promise<ClientVectorResponse> {
    const run = await this.requireRun();
    const [vector, facts, names] = await Promise.all([
      this.repo.vector(clientId),
      this.repo.factual(clientId),
      this.repo.clientNames(),
    ]);
    if (!vector || !facts) {
      throw new ClientNotFoundError(clientId);
    }
    return {
      run: {
        id: run.id,
        createdAt: run.createdAt.toISOString(),
        engineVersion: run.engineVersion,
        datasetToday: run.datasetToday,
      },
      manifest: run.manifest,
      factual: ClientFactual.parse(facts),
      features: toFeatureValues(run, vector.features, vector.percentiles, vector.evidence),
      peers: toPeers(vector.peers, names),
    };
  }

  async book(): Promise<VectorBookResponse> {
    const run = await this.requireRun();
    const rows = await this.repo.allVectors();
    return {
      run: { id: run.id, createdAt: run.createdAt.toISOString(), engineVersion: run.engineVersion },
      manifest: run.manifest,
      rows: rows.map((r) => ({
        clientId: r.clientId,
        name: r.name,
        features: r.features,
        percentiles: r.percentiles,
      })),
    };
  }
}
