import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { OverrideRequest } from '@jb/contracts';
import { AnalyticsUnavailableError } from '../services/analyticsClient.js';
import { LockedError, NoAssessmentError, type RubricService } from '../services/rubricService.js';
import { ClientNotFoundError, NoVectorRunError } from '../services/vectorService.js';

const Params = z.object({ clientId: z.string().min(1).max(64) });
const ClockQuery = z.object({
  clock: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
const AuditQuery = z.object({
  clientId: z.string().min(1).max(64).optional(),
});

export const rubricRoutes =
  (service: RubricService): FastifyPluginCallback =>
  (app, _opts, done) => {
    const withClient = async <T>(
      params: unknown,
      reply: {
        badRequest: (m: string) => unknown;
        notFound: (m: string) => unknown;
        serviceUnavailable: (m: string) => unknown;
        badGateway: (m: string) => unknown;
        conflict: (m: string) => unknown;
      },
      run: (clientId: string) => Promise<T>,
    ) => {
      const p = Params.safeParse(params);
      if (!p.success) {
        return reply.badRequest('clientId is required');
      }
      try {
        return await run(p.data.clientId);
      } catch (err) {
        if (err instanceof ClientNotFoundError || err instanceof NoAssessmentError) {
          return reply.notFound(err.message);
        }
        if (err instanceof NoVectorRunError) {
          return reply.serviceUnavailable(err.message);
        }
        if (err instanceof AnalyticsUnavailableError) {
          return reply.badGateway(err.message);
        }
        if (err instanceof LockedError) {
          return reply.conflict(err.message);
        }
        throw err;
      }
    };

    app.get('/rubric', async () => service.book());
    app.get('/audit', async (req, reply) => {
      const q = AuditQuery.safeParse(req.query);
      if (!q.success) {
        return reply.badRequest('clientId is required');
      }
      return service.audit(q.data.clientId);
    });
    app.get('/clients/:clientId/rubric', (req, reply) =>
      withClient(req.params, reply, async (id) => {
        const r = await service.latest(id);
        return (
          r ?? reply.notFound(`No rubric assessment exists for ${id}; run an assessment first.`)
        );
      }),
    );
    app.post('/clients/:clientId/rubric/assess', (req, reply) =>
      withClient(req.params, reply, (id) => {
        const q = ClockQuery.safeParse(req.query);
        return service.assess(id, q.success ? q.data.clock : undefined);
      }),
    );
    app.post('/clients/:clientId/rubric/override', (req, reply) =>
      withClient(req.params, reply, (id) => {
        const body = OverrideRequest.safeParse(req.body);
        if (!body.success) {
          throw Object.assign(
            new Error(body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')),
            { statusCode: 400 },
          );
        }
        return service.override(id, body.data);
      }),
    );
    app.post('/clients/:clientId/rubric/lock', (req, reply) =>
      withClient(req.params, reply, (id) => service.lock(id)),
    );
    done();
  };
