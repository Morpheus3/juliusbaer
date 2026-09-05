import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { CheckRequest, DraftRequest, SendRequest, TriageRequest } from '@jb/contracts';
import { AnalyticsUnavailableError } from '../services/analyticsClient.js';
import { ClientNotFoundError } from '../services/vectorService.js';
import type { WorkflowService } from '../services/workflowService.js';

const Params = z.object({ clientId: z.string().min(1).max(64) });
const ClockQuery = z.object({
  clock: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const workflowRoutes =
  (service: WorkflowService): FastifyPluginCallback =>
  (app, _opts, done) => {
    const guard = async <T>(
      params: unknown,
      reply: {
        badRequest: (m: string) => unknown;
        notFound: (m: string) => unknown;
        badGateway: (m: string) => unknown;
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
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        if (err instanceof AnalyticsUnavailableError) {
          return reply.badGateway(err.message);
        }
        throw err;
      }
    };
    const body = <T>(
      schema: z.ZodType<T>,
      raw: unknown,
      reply: { badRequest: (m: string) => unknown },
    ): T | null => {
      const b = schema.safeParse(raw ?? {});
      if (!b.success) {
        reply.badRequest(b.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
        return null;
      }
      return b.data;
    };

    app.get('/clients/:clientId/workflow', (req, reply) =>
      guard(req.params, reply, (id) => {
        const q = ClockQuery.safeParse(req.query);
        return service.state(id, q.success ? q.data.clock : undefined);
      }),
    );
    app.post('/clients/:clientId/alerts/:alertId/triage', (req, reply) =>
      guard(req.params, reply, async (id) => {
        const { alertId } = z.object({ alertId: z.string().min(1) }).parse(req.params);
        const b = body(TriageRequest, req.body, reply);
        if (!b) {
          return undefined;
        }
        await service.triage(id, alertId, b);
        return { ok: true };
      }),
    );
    app.post('/clients/:clientId/actions/:actionId/check', (req, reply) =>
      guard(req.params, reply, async (id) => {
        const { actionId } = z.object({ actionId: z.string().min(1) }).parse(req.params);
        const b = body(CheckRequest, req.body, reply);
        if (!b) {
          return undefined;
        }
        await service.check(id, actionId, b);
        return { ok: true };
      }),
    );
    app.post('/clients/:clientId/outreach/draft', (req, reply) =>
      guard(req.params, reply, (id) => {
        const b = body(DraftRequest, req.body, reply);
        const q = ClockQuery.safeParse(req.query);
        return b
          ? service.draft(id, b, q.success ? q.data.clock : undefined)
          : Promise.resolve(undefined);
      }),
    );
    app.post('/clients/:clientId/outreach/:outreachId/send', (req, reply) =>
      guard(req.params, reply, (id) => {
        const { outreachId } = z.object({ outreachId: z.uuid() }).parse(req.params);
        const b = body(SendRequest, req.body, reply);
        return b ? service.send(id, outreachId, b) : Promise.resolve(undefined);
      }),
    );
    done();
  };
