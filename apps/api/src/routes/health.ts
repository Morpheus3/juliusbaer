import type { FastifyPluginCallback } from 'fastify';
import type { HealthService } from '../services/healthService.js';

export const healthRoutes =
  (service: HealthService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/health', async () => service.check());
    done();
  };
