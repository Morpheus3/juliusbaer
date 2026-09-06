import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { BookResponse } from '@jb/contracts';
import { getJson } from './api';
import { useClockDate } from '@/state/clock';

/** The ranked book at the clock. Shared by the cockpit, the context strip and the switcher so it loads once. */
export function useBook(): UseQueryResult<BookResponse> {
  const clock = useClockDate();
  return useQuery({
    queryKey: ['book', clock],
    queryFn: () => getJson(`/api/v1/book?clock=${clock}`, BookResponse),
    enabled: clock !== '',
    placeholderData: (p) => p,
    staleTime: 60_000,
  });
}
