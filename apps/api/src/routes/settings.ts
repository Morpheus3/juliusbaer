import type { FastifyPluginCallback } from 'fastify';
import { SetClaudeKeyRequest } from '@jb/contracts';
import { KeyValidationError } from '../llm/gateway.js';
import type { SettingsService } from '../services/settingsService.js';

export const settingsRoutes =
  (service: SettingsService): FastifyPluginCallback =>
  (app, _opts, done) => {
    app.get('/settings/claude', () => service.claude());
    app.post('/settings/claude', async (req, reply) => {
      const body = SetClaudeKeyRequest.safeParse(req.body);
      if (!body.success) {
        return reply.badRequest('apiKey is required');
      }
      try {
        return await service.setClaudeKey(body.data.apiKey, body.data.persist);
      } catch (err) {
        if (err instanceof KeyValidationError) {
          return reply.badRequest(err.message);
        }
        throw err;
      }
    });
    app.delete('/settings/claude', async () => service.clearClaudeKey());
    done();
  };
