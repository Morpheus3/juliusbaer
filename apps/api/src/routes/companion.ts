import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { EndCallRequest } from '@jb/contracts';
import type { CompanionService } from '../services/companionService.js';
import type { IdeasService } from '../services/ideasService.js';
import { ClientNotFoundError } from '../services/vectorService.js';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ClockQuery = z.object({ clock: IsoDate.optional() });
const Params = z.object({ clientId: z.string().min(1).max(64) });
const IdeasQuery = z.object({
  q: z.string().max(300).optional(),
  signalId: z.string().max(64).optional(),
  clock: IsoDate.optional(),
});
const HEAVY_LIMIT = { max: 60, timeWindow: '1 minute' };

export const companionRoutes =
  (service: CompanionService, ideas: IdeasService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/clients/:clientId/guardrails', async (req, reply) => {
      const p = Params.safeParse(req.params);
      if (!p.success) {
        return reply.badRequest('clientId is required');
      }
      try {
        return await service.guardrails(p.data.clientId);
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });
    app.post('/clients/:clientId/calls/end', async (req, reply) => {
      const p = Params.safeParse(req.params);
      const q = ClockQuery.safeParse(req.query);
      const body = EndCallRequest.safeParse(req.body);
      if (!p.success || !q.success) {
        return reply.badRequest('clientId is required; clock must be YYYY-MM-DD');
      }
      if (!body.success) {
        return reply.badRequest(
          body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
      try {
        return await service.endCall(p.data.clientId, body.data, q.data.clock);
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });
    app.get('/ideas', { config: { rateLimit: HEAVY_LIMIT } }, async (req, reply) => {
      const q = IdeasQuery.safeParse(req.query);
      if (!q.success) {
        return reply.badRequest('q, signalId and clock must be valid');
      }
      return ideas.search(q.data.q, q.data.signalId, q.data.clock);
    });
    done();
  };
