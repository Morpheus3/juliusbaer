import type { FastifyPluginCallback } from 'fastify';
import type { ClientService } from '../services/clientService.js';

export const clientRoutes =
  (service: ClientService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/clients', async () => service.list());
    done();
  };
