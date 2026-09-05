import type { Dataset } from '../dataset.js';
import { ALL_CHECKS } from './checks.js';
import type { Finding } from './types.js';

export type { Finding } from './types.js';

export function runQualityChecks(data: Dataset, today: string): Finding[] {
  return ALL_CHECKS.flatMap((check) => check({ data, today }));
}
