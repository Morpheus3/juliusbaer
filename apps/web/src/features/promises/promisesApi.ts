import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { PromisesResponse, PromiseView, type AddPromiseRequest } from '@jb/contracts';
import { getJson, postJson } from '@/lib/api';
import { useClockDate } from '@/state/clock';

/** The client's ledger; reading it re-extracts from the notes (idempotent). */
export function usePromises(clientId: string | null): UseQueryResult<PromisesResponse> {
  const clock = useClockDate();
  return useQuery({
    queryKey: ['promises', clientId ?? 'all', clock],
    queryFn: () =>
      getJson(
        clientId
          ? `/api/v1/clients/${clientId}/promises?clock=${clock}`
          : `/api/v1/promises?clock=${clock}`,
        PromisesResponse,
      ),
    enabled: clock !== '',
    staleTime: 30_000,
  });
}

export function useResolvePromise(): UseMutationResult<
  PromiseView,
  Error,
  { id: string; status: 'done' | 'dropped' }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) =>
      postJson(`/api/v1/promises/${id}/resolve`, { status }, PromiseView),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['promises'] });
      void qc.invalidateQueries({ queryKey: ['call-plan'] });
    },
  });
}

export function useAddPromise(
  clientId: string,
): UseMutationResult<PromiseView, Error, AddPromiseRequest> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => postJson(`/api/v1/clients/${clientId}/promises`, body, PromiseView),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['promises'] });
      void qc.invalidateQueries({ queryKey: ['call-plan'] });
    },
  });
}
