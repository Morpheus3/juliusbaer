import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { AgentControlsRequest, ShadowGradeRequest } from '@jb/contracts';
import { PlaybookNotFoundError, type PlaybookService } from '../services/playbookService.js';
import { ForbiddenError, type TeamService } from '../services/teamService.js';
import { ClientNotFoundError } from '../services/vectorService.js';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ClockQuery = z.object({ clock: IsoDate.optional() });
const Params = z.object({ clientId: z.string().min(1).max(64) });
const ShadowParams = Params.extend({ playbookId: z.string().min(1).max(64) });

export const teamRoutes =
  (team: TeamService, playbooks: PlaybookService): FastifyPluginCallback =>
  (app, _o, done) => {
    app.get('/team', async (req, reply) => {
      const q = ClockQuery.safeParse(req.query);
      if (!q.success) {
        return reply.badRequest('clock must be YYYY-MM-DD');
      }
      return team.monday(q.data.clock);
    });
    app.post('/team/agents', async (req, reply) => {
      const body = AgentControlsRequest.safeParse(req.body);
      if (!body.success) {
        return reply.badRequest('paused (boolean) is required');
      }
      try {
        return await team.setAgentControls(body.data);
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return reply.forbidden(err.message);
        }
        throw err;
      }
    });
    app.get('/playbooks', () => playbooks.doc());
    app.get('/clients/:clientId/shadow/:playbookId', async (req, reply) => {
      const p = ShadowParams.safeParse(req.params);
      const q = ClockQuery.safeParse(req.query);
      if (!p.success || !q.success) {
        return reply.badRequest('clientId and playbookId are required');
      }
      try {
        return await playbooks.shadow(p.data.clientId, p.data.playbookId, q.data.clock);
      } catch (err) {
        if (err instanceof PlaybookNotFoundError || err instanceof ClientNotFoundError) {
          return reply.notFound(err.message);
        }
        throw err;
      }
    });
    app.post('/clients/:clientId/shadow/grade', async (req, reply) => {
      const p = Params.safeParse(req.params);
      const body = ShadowGradeRequest.safeParse(req.body);
      if (!p.success || !body.success) {
        return reply.badRequest('playbookId, stepId, draft and grade are required');
      }
      await playbooks.grade(p.data.clientId, body.data);
      return reply.code(204).send();
    });
    done();
  };
