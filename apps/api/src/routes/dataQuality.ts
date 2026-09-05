import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { DataQualityCode } from '@jb/contracts';
import { NoLoadRunError, type DataQualityService } from '../services/dataQualityService.js';

const Query = z.object({
  clientId: z
    .string()
    .regex(/^CL-\d{4}$/)
    .optional(),
  code: DataQualityCode.optional(),
});

export const dataQualityRoutes =
  (service: DataQualityService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/data-quality', async (req, reply) => {
      const q = Query.safeParse(req.query);
      if (!q.success) {
        return reply.badRequest(q.error.issues.map((i) => i.message).join('; '));
      }
      try {
        return await service.summary(q.data);
      } catch (err) {
        if (err instanceof NoLoadRunError) {
          return reply.serviceUnavailable(err.message);
        }
        throw err;
      }
    });
    done();
  };
