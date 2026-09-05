import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { AnalyticsUnavailableError } from '../services/analyticsClient.js';
import {
  ClientNotFoundError,
  NoVectorRunError,
  type VectorService,
} from '../services/vectorService.js';

const Params = z.object({ clientId: z.string().min(1).max(64) });

export const vectorRoutes =
  (service: VectorService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/vectors', async (_req, reply) => {
      try {
        return await service.book();
      } catch (err) {
        if (err instanceof NoVectorRunError) {
          return reply.serviceUnavailable(err.message);
        }
        throw err;
      }
    });

    app.post('/vectors/rebuild', async (_req, reply) => {
      try {
        return await service.rebuild();
      } catch (err) {
        if (err instanceof AnalyticsUnavailableError) {
          return reply.badGateway(err.message);
        }
        throw err;
      }
    });

    app.get('/clients/:clientId/vector', async (req, reply) => {
      const params = Params.safeParse(req.params);
      if (!params.success) {
        return reply.badRequest('clientId is required');
      }
      try {
        return await service.forClient(params.data.clientId);
      } catch (err) {
        if (err instanceof NoVectorRunError) {
          return reply.serviceUnavailable(err.message);
        }
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });
    done();
  };
