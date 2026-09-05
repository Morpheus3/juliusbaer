import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import type { BookService } from '../services/bookService.js';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ClockQuery = z.object({ clock: IsoDate.optional() });
const SnapshotQuery = z.object({ snapshot: IsoDate.optional() });

export const bookRoutes =
  (service: BookService): FastifyPluginCallback =>
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
    done();
  };
