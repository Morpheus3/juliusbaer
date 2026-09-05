import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { ImpactRequest } from '@jb/contracts';
import { AnalyticsUnavailableError } from '../services/analyticsClient.js';
import { UnknownSignalError, type SignalService } from '../services/signalService.js';
import { ClientNotFoundError } from '../services/vectorService.js';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const FeedQuery = z.object({
  clock: IsoDate.optional(),
  clientId: z.string().min(1).max(64).optional(),
});
const ClockQuery = z.object({ clock: IsoDate.optional() });
const Params = z.object({ clientId: z.string().min(1).max(64) });

export const signalRoutes =
  (service: SignalService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/signals', async (req, reply) => {
      const q = FeedQuery.safeParse(req.query);
      if (!q.success) {
        return reply.badRequest(q.error.issues.map((i) => i.message).join('; '));
      }
      try {
        return await service.feed(q.data.clock, q.data.clientId);
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });

    app.get('/scenarios', async (_req, reply) => {
      try {
        return await service.scenarios();
      } catch (err) {
        if (err instanceof AnalyticsUnavailableError) {
          return reply.badGateway(err.message);
        }
        throw err;
      }
    });

    app.post('/clients/:clientId/impact', async (req, reply) => {
      const p = Params.safeParse(req.params);
      const q = ClockQuery.safeParse(req.query);
      const body = ImpactRequest.safeParse(req.body ?? {});
      if (!p.success || !q.success) {
        return reply.badRequest('clientId is required; clock must be YYYY-MM-DD');
      }
      if (!body.success) {
        return reply.badRequest(
          body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
      try {
        return await service.impact(p.data.clientId, body.data, q.data.clock);
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        if (err instanceof UnknownSignalError) {
          return reply.badRequest(err.message);
        }
        if (err instanceof AnalyticsUnavailableError) {
          return reply.badGateway(err.message);
        }
        throw err;
      }
    });

    app.get('/clients/:clientId/impact/runs', async (req, reply) => {
      const p = Params.safeParse(req.params);
      if (!p.success) {
        return reply.badRequest('clientId is required');
      }
      return service.savedRuns(p.data.clientId);
    });
    done();
  };
