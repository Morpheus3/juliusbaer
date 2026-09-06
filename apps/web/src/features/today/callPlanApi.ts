import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { CallPlanResponse, type DeferCallRequest } from '@jb/contracts';
import { ApiError, getJson } from '@/lib/api';
import { useClockDate } from '@/state/clock';

/** The call plan at the clock: one row per conversation, ranked and packed. */
export function useCallPlan(): UseQueryResult<CallPlanResponse> {
  const clock = useClockDate();
  return useQuery({
    queryKey: ['call-plan', clock],
    queryFn: () => getJson(`/api/v1/book/call-plan?clock=${clock}`, CallPlanResponse),
    enabled: clock !== '',
    placeholderData: (p) => p,
    staleTime: 60_000,
  });
}

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
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
}

export function useDeferCall(): UseMutationResult<
  void,
  Error,
  { clientId: string } & DeferCallRequest
> {
  const clock = useClockDate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, ...body }) =>
      post(`/api/v1/book/call-plan/${clientId}/defer?clock=${clock}`, body),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['call-plan'] });
      void qc.invalidateQueries({ queryKey: ['audit', v.clientId] });
    },
  });
}

export function useDoneCall(): UseMutationResult<void, Error, { clientId: string; note?: string }> {
  const clock = useClockDate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, note }) =>
      post(`/api/v1/book/call-plan/${clientId}/done?clock=${clock}`, note ? { note } : {}),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['call-plan'] });
      void qc.invalidateQueries({ queryKey: ['audit', v.clientId] });
    },
  });
}
