import {
  DataQualityCode,
  DataQualitySeverity,
  type DataQualityIssue,
  type DataQualitySummary,
} from '@jb/contracts';
import type {
  DataQualityRepository,
  DataQualityRow,
} from '../repositories/dataQualityRepository.js';
import type { LoadRunRepository } from '../repositories/loadRunRepository.js';

export class NoLoadRunError extends Error {
  constructor() {
    super('No successful dataset load found. Run `npm run db:seed`.');
    this.name = 'NoLoadRunError';
  }
}

/** Pure aggregation so it can be unit-tested without a database. */
export function summarise(rows: readonly DataQualityIssue[]): DataQualitySummary {
  const bySeverity = Object.fromEntries(DataQualitySeverity.options.map((s) => [s, 0])) as Record<
    DataQualitySeverity,
    number
  >;
  const byCode = Object.fromEntries(DataQualityCode.options.map((c) => [c, 0])) as Record<
    DataQualityCode,
    number
  >;
  for (const r of rows) {
    bySeverity[r.severity] += 1;
    byCode[r.code] += 1;
  }
  return { total: rows.length, bySeverity, byCode, issues: [...rows] };
}

function toIssue(row: DataQualityRow): DataQualityIssue {
  return {
    id: row.id,
    code: DataQualityCode.parse(row.code),
    severity: DataQualitySeverity.parse(row.severity),
    entityType: row.entityType,
    entityId: row.entityId,
    clientId: row.clientId,
    message: row.message,
    detail: row.detail,
    detectedAt: row.detectedAt.toISOString(),
  };
}

export class DataQualityService {
  constructor(
    private readonly loadRuns: LoadRunRepository,
    private readonly issues: DataQualityRepository,
  ) {}

  async summary(
    filter: { clientId?: string | undefined; code?: string | undefined } = {},
  ): Promise<DataQualitySummary> {
    const run = await this.loadRuns.latestSucceeded();
    if (!run) {
      throw new NoLoadRunError();
    }
    const rows = await this.issues.list({ loadRunId: run.id, ...filter });
    return summarise(rows.map(toIssue));
  }
}
