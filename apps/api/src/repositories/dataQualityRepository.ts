import { and, eq, type SQL } from 'drizzle-orm';
import { dataQualityIssues, type Db } from '@jb/db';

export interface DataQualityRow {
  id: string;
  code: string;
  severity: string;
  entityType: string;
  entityId: string;
  clientId: string | null;
  message: string;
  detail: Record<string, unknown>;
  detectedAt: Date;
}

export interface DataQualityFilter {
  loadRunId: string;
  clientId?: string | undefined;
  code?: string | undefined;
}

export class DataQualityRepository {
  constructor(private readonly db: Db) {}

  async list(filter: DataQualityFilter): Promise<DataQualityRow[]> {
    const conditions: SQL[] = [eq(dataQualityIssues.loadRunId, filter.loadRunId)];
    if (filter.clientId !== undefined) {
      conditions.push(eq(dataQualityIssues.clientId, filter.clientId));
    }
    if (filter.code !== undefined) {
      conditions.push(eq(dataQualityIssues.code, filter.code));
    }
    return this.db
      .select({
        id: dataQualityIssues.id,
        code: dataQualityIssues.code,
        severity: dataQualityIssues.severity,
        entityType: dataQualityIssues.entityType,
        entityId: dataQualityIssues.entityId,
        clientId: dataQualityIssues.clientId,
        message: dataQualityIssues.message,
        detail: dataQualityIssues.detail,
        detectedAt: dataQualityIssues.detectedAt,
      })
      .from(dataQualityIssues)
      .where(and(...conditions))
      .orderBy(dataQualityIssues.severity, dataQualityIssues.code, dataQualityIssues.entityId);
  }
}
