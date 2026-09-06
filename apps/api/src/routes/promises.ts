import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { AddPromiseRequest, PreviewPromisesRequest, ResolvePromiseRequest } from '@jb/contracts';
import type { PromiseService } from '../services/promiseService.js';
import { ClientNotFoundError } from '../services/vectorService.js';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ClockQuery = z.object({ clock: IsoDate.optional() });
const Params = z.object({ clientId: z.string().min(1).max(64) });
const IdParams = z.object({ promiseId: z.uuid() });

export const promiseRoutes =
  (service: PromiseService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/promises', async (req, reply) => {
      const q = ClockQuery.safeParse(req.query);
      if (!q.success) {
        return reply.badRequest('clock must be YYYY-MM-DD');
      }
      return service.openAll(q.data.clock);
    });
    app.get('/clients/:clientId/promises', async (req, reply) => {
      const p = Params.safeParse(req.params);
      const q = ClockQuery.safeParse(req.query);
      if (!p.success || !q.success) {
        return reply.badRequest('clientId is required; clock must be YYYY-MM-DD');
      }
      try {
        return await service.list(p.data.clientId, q.data.clock);
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });
    app.post('/clients/:clientId/promises', async (req, reply) => {
      const p = Params.safeParse(req.params);
      const body = AddPromiseRequest.safeParse(req.body);
      if (!p.success || !body.success) {
        return reply.badRequest('clientId, party and text are required');
      }
      try {
        return await service.add(p.data.clientId, body.data, 'manual', null);
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });
    app.post('/clients/:clientId/promises/preview', async (req, reply) => {
      const p = Params.safeParse(req.params);
      const q = ClockQuery.safeParse(req.query);
      const body = PreviewPromisesRequest.safeParse(req.body);
      if (!p.success || !q.success || !body.success) {
        return reply.badRequest('text is required');
      }
      return {
        candidates: service.preview(
          body.data.text,
          q.data.clock ?? new Date().toISOString().slice(0, 10),
        ),
      };
    });
    app.post('/promises/:promiseId/resolve', async (req, reply) => {
      const p = IdParams.safeParse(req.params);
      const body = ResolvePromiseRequest.safeParse(req.body);
      if (!p.success || !body.success) {
        return reply.badRequest('promiseId and status (done|dropped) are required');
      }
      const r = await service.resolve(p.data.promiseId, body.data.status);
      return r ?? reply.notFound('Promise not found or already resolved');
    });
    done();
  };
