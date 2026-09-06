import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { AskRequest, ConfirmRequest } from '@jb/contracts';
import type { AssistantService } from '../services/assistantService.js';
import { ProposalError } from '../services/assistantService.js';
import { UnknownActionError } from '../services/riskService.js';
import { ClientNotFoundError } from '../services/vectorService.js';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ClockQuery = z.object({ clock: IsoDate.optional() });
const LLM_LIMIT = { max: 30, timeWindow: '1 minute' };

export const assistantRoutes =
  (service: AssistantService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.post('/assistant/ask', { config: { rateLimit: LLM_LIMIT } }, async (req, reply) => {
      const q = ClockQuery.safeParse(req.query);
      const body = AskRequest.safeParse(req.body);
      if (!q.success) {
        return reply.badRequest('clock must be YYYY-MM-DD');
      }
      if (!body.success) {
        return reply.badRequest(
          body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
      try {
        return await service.ask(body.data, q.data.clock);
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });
    app.post('/assistant/confirm', async (req, reply) => {
      const body = ConfirmRequest.safeParse(req.body);
      if (!body.success) {
        return reply.badRequest('proposalId is required');
      }
      try {
        return await service.confirm(body.data.proposalId);
      } catch (err) {
        if (err instanceof ProposalError) {
          return reply.badRequest(err.message);
        }
        if (err instanceof UnknownActionError || err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });
    done();
  };
