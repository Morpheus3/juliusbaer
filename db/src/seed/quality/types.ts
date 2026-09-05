import type { DataQualityCode, DataQualitySeverity } from '@jb/contracts';
import type { Dataset } from '../dataset.js';

export interface Finding {
  code: DataQualityCode;
  severity: DataQualitySeverity;
  entityType:
    'client' | 'portfolio' | 'holding' | 'instrument' | 'facility' | 'commitment' | 'transaction';
  entityId: string;
  clientId: string | null;
  message: string;
  detail: Record<string, unknown>;
}

export interface CheckContext {
  data: Dataset;
  /** The dataset's "today", used for due-date checks. */
  today: string;
}

export type Check = (ctx: CheckContext) => Finding[];
