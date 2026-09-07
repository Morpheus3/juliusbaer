import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { CheckRequest, DraftRequest, SendRequest, TriageRequest } from '@jb/contracts';
import { AnalyticsUnavailableError } from '../services/analyticsClient.js';
import { ClientNotFoundError } from '../services/vectorService.js';
import {
  AlreadySentError,
  GateBlockedError,
  type WorkflowService,
} from '../services/workflowService.js';

const Params = z.object({ clientId: z.string().min(1).max(64) });
const ClockQuery = z.object({
  clock: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Per-route ceiling for routes that spend the model key or heavy compute. */
const LLM_LIMIT = { max: 20, timeWindow: '1 minute' };

export const workflowRoutes =
  (service: WorkflowService): FastifyPluginCallback =>
  (app, _opts, done) => {
    const guard = async <T>(
      params: unknown,
      reply: {
        badRequest: (m: string) => unknown;
        notFound: (m: string) => unknown;
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
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        if (err instanceof AnalyticsUnavailableError) {
          return reply.badGateway(err.message);
        }
        if (err instanceof AlreadySentError || err instanceof GateBlockedError) {
          return reply.conflict(err.message);
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
    app.post(
      '/clients/:clientId/outreach/draft',
      { config: { rateLimit: LLM_LIMIT } },
      (req, reply) =>
        guard(req.params, reply, (id) => {
          const b = body(DraftRequest, req.body, reply);
          const q = ClockQuery.safeParse(req.query);
          return b
            ? service.draft(id, b, q.success ? q.data.clock : undefined)
            : Promise.resolve(undefined);
        }),
    );
    app.post('/clients/:clientId/outreach/:outreachId/gate', (req, reply) =>
      guard(req.params, reply, (id) => {
        const p = z.object({ outreachId: z.string().min(1) }).safeParse(req.params);
        const b = z.object({ body: z.string().min(1).max(6000) }).safeParse(req.body);
        if (!p.success || !b.success) {
          reply.badRequest('outreachId and body are required');
          return Promise.resolve(undefined);
        }
        return service.gatePreview(id, p.data.outreachId, b.data.body);
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
