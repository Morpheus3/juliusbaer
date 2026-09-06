import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { DeferCallRequest, DoneCallRequest } from '@jb/contracts';
import type { BookService } from '../services/bookService.js';
import { InvalidDeferralError, type CallPlanService } from '../services/callPlanService.js';
import { ClientNotFoundError } from '../services/vectorService.js';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ClockQuery = z.object({ clock: IsoDate.optional() });
const SnapshotQuery = z.object({ snapshot: IsoDate.optional() });
const Params = z.object({ clientId: z.string().min(1).max(64) });

export const bookRoutes =
  (service: BookService, calls: CallPlanService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/book', async (req, reply) => {
      const q = ClockQuery.safeParse(req.query);
      if (!q.success) {
        return reply.badRequest('clock must be YYYY-MM-DD');
      }
      return service.cockpit(q.data.clock);
    });
    app.get('/book/board', async (req, reply) => {
      const q = SnapshotQuery.safeParse(req.query);
      if (!q.success) {
        return reply.badRequest('snapshot must be YYYY-MM-DD');
      }
      return service.board(q.data.snapshot);
    });
    app.get('/book/call-plan', async (req, reply) => {
      const q = ClockQuery.safeParse(req.query);
      if (!q.success) {
        return reply.badRequest('clock must be YYYY-MM-DD');
      }
      return calls.plan(q.data.clock);
    });
    app.post('/book/call-plan/:clientId/defer', async (req, reply) => {
      const p = Params.safeParse(req.params);
      const q = ClockQuery.safeParse(req.query);
      const body = DeferCallRequest.safeParse(req.body);
      if (!p.success || !q.success) {
        return reply.badRequest('clientId is required; clock must be YYYY-MM-DD');
      }
      if (!body.success) {
        return reply.badRequest(
          body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
      try {
        await calls.defer(p.data.clientId, body.data, q.data.clock);
        return await reply.code(204).send();
      } catch (err) {
        if (err instanceof InvalidDeferralError) {
          return reply.badRequest(err.message);
        }
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });
    app.post('/book/call-plan/:clientId/done', async (req, reply) => {
      const p = Params.safeParse(req.params);
      const q = ClockQuery.safeParse(req.query);
      const body = DoneCallRequest.safeParse(req.body ?? {});
      if (!p.success || !q.success || !body.success) {
        return reply.badRequest('clientId is required; clock must be YYYY-MM-DD');
      }
      try {
        await calls.done(p.data.clientId, body.data, q.data.clock);
        return await reply.code(204).send();
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });
    done();
  };
