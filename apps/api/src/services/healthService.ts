import type { HealthResponse } from '@jb/contracts';
import type { LoadRunRepository } from '../repositories/loadRunRepository.js';
import type { DatasetContext } from './datasetContext.js';

export class HealthService {
  constructor(
    private readonly loadRuns: LoadRunRepository,
    private readonly version: string,
    private readonly ctx: DatasetContext,
  ) {}

  async check(): Promise<HealthResponse> {
    try {
      const run = await this.loadRuns.latestSucceeded();
      const today = run ? await this.ctx.today() : '';
      return {
        status: run ? 'ok' : 'degraded',
        version: this.version,
        datasetToday: today,
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
        datasetToday: '',
        database: { reachable: false, lastLoadRun: null },
      };
    }
  }
}
