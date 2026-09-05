import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { DatasetMeta } from '@jb/contracts';
import { getJson } from './api';

/** Dataset facts the UI needs before rendering anything: snapshots, today, RM, default client. */
export function useMeta(): UseQueryResult<DatasetMeta> {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => getJson('/api/v1/meta', DatasetMeta),
    staleTime: 60_000,
  });
}
