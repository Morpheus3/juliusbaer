import type { HealthResponse } from '@jb/contracts';
import type { LoadRunRepository } from '../repositories/loadRunRepository.js';

export class HealthService {
  constructor(
    private readonly loadRuns: LoadRunRepository,
    private readonly version: string,
    private readonly datasetToday: string,
  ) {}

  async check(): Promise<HealthResponse> {
    try {
      const run = await this.loadRuns.latestSucceeded();
      return {
        status: run ? 'ok' : 'degraded',
        version: this.version,
        datasetToday: this.datasetToday,
        database: {
          reachable: true,
          lastLoadRun: run
            ? { id: run.id, loadedAt: run.loadedAt.toISOString(), rowCounts: run.rowCounts }
            : null,
        },
      };
    } catch {
      return {
        status: 'degraded',
        version: this.version,
        datasetToday: this.datasetToday,
        database: { reachable: false, lastLoadRun: null },
      };
    }
  }
}
