import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { CombinedRiskResponse, type DecideRequest } from '@jb/contracts';
import { ApiError, getJson } from '@/lib/api';
import { apiFetch } from '@/lib/auth';
import { useClockDate } from '@/state/clock';

export function useCombinedRisk(clientId: string): UseQueryResult<CombinedRiskResponse> {
  const clock = useClockDate();
  return useQuery({
    queryKey: ['risk', clientId, clock],
    queryFn: () => getJson(`/api/v1/clients/${clientId}/risk?clock=${clock}`, CombinedRiskResponse),
    enabled: clientId !== '' && clock !== '',
    staleTime: 30_000,
  });
}

export function useDecide(
  clientId: string,
): UseMutationResult<void, Error, { actionId: string } & DecideRequest> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ actionId, ...body }: { actionId: string } & DecideRequest) => {
      const res = await apiFetch(`/api/v1/clients/${clientId}/actions/${actionId}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json: unknown = await res.json().catch(() => null);
        const message =
          typeof json === 'object' &&
          json !== null &&
          'message' in json &&
          typeof json.message === 'string'
            ? json.message
            : res.statusText;
        throw new ApiError(res.status, message);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['risk', clientId] });
      void qc.invalidateQueries({ queryKey: ['audit', clientId] });
    },
  });
}
