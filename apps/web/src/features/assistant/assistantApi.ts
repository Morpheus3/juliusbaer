import { AssistantResponse, ConfirmResponse, type AskRequest } from '@jb/contracts';
import { postJson } from '@/lib/api';

export function ask(req: AskRequest, clock: string): Promise<AssistantResponse> {
  return postJson(`/api/v1/assistant/ask?clock=${clock}`, req, AssistantResponse);
}

export function confirm(proposalId: string): Promise<ConfirmResponse> {
  return postJson('/api/v1/assistant/confirm', { proposalId }, ConfirmResponse);
}
