import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { DecideRequest } from '@jb/contracts';
import { AnalyticsUnavailableError } from '../services/analyticsClient.js';
import { UnknownActionError, type RiskService } from '../services/riskService.js';
import { ClientNotFoundError } from '../services/vectorService.js';

const Params = z.object({ clientId: z.string().min(1).max(64) });
const DecideParams = Params.extend({ actionId: z.string().min(1).max(128) });
const ClockQuery = z.object({
  clock: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const riskRoutes =
  (service: RiskService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/clients/:clientId/risk', async (req, reply) => {
      const p = Params.safeParse(req.params);
      const q = ClockQuery.safeParse(req.query);
      if (!p.success || !q.success) {
        return reply.badRequest('invalid clientId or clock');
      }
      try {
        return await service.combined(p.data.clientId, q.data.clock);
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        if (err instanceof AnalyticsUnavailableError) {
          return reply.badGateway(err.message);
        }
        throw err;
      }
    });

    app.post('/clients/:clientId/actions/:actionId/decide', async (req, reply) => {
      const p = DecideParams.safeParse(req.params);
      const body = DecideRequest.safeParse(req.body);
      if (!p.success) {
        return reply.badRequest('invalid clientId or actionId');
      }
      if (!body.success) {
        return reply.badRequest(
          body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
      const q = ClockQuery.safeParse(req.query);
      try {
        return await service.decide(
          p.data.clientId,
          p.data.actionId,
          body.data,
          q.success ? q.data.clock : undefined,
        );
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        if (err instanceof UnknownActionError) {
          return reply.badRequest(err.message);
        }
        if (err instanceof AnalyticsUnavailableError) {
          return reply.badGateway(err.message);
        }
        throw err;
      }
    });
    done();
  };
