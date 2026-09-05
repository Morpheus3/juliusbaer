import type { FastifyPluginCallback } from 'fastify';
import { DatasetNotLoadedError, type DatasetContext } from '../services/datasetContext.js';

export const metaRoutes =
  (ctx: DatasetContext): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/meta', async (_req, reply) => {
      try {
        return await ctx.meta();
      } catch (err) {
        if (err instanceof DatasetNotLoadedError) {
          return reply.serviceUnavailable(err.message);
        }
        throw err;
      }
    });
    done();
  };
