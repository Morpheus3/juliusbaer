import type { FastifyPluginCallback } from 'fastify';
import { SignJWT } from 'jose';
import { z } from 'zod';
import type { AccessRepository } from '../repositories/accessRepository.js';
import { levelFor, scopeFor } from '../services/actor.js';

const DevLogin = z.object({ subject: z.string().min(1).max(120) });

export interface AuthRouteOptions {
  mode: 'dev' | 'oidc';
  secret: string;
  ttlSeconds: number;
}

/**
 * Development identity provider: lists the identities the dataset and reference/access.json
 * define and issues a short-lived HS256 token for one of them. Disabled when AUTH_MODE=oidc; the
 * bank's provider issues tokens then and /auth/me is the only route left.
 */
export const authRoutes =
  (access: AccessRepository, opts: AuthRouteOptions): FastifyPluginCallback =>
  (app, _o, done) => {
    app.get('/auth/mode', () => ({ mode: opts.mode }));
    if (opts.mode === 'dev') {
      app.get('/auth/dev/users', async () => {
        const users = await access.listUsers();
        return {
          users: users
            .filter((u) => u.status === 'active')
            .map((u) => ({
              subject: u.subject,
              displayName: u.displayName,
              roles: u.roles,
              rmId: u.rmId,
              teamId: u.teamId,
              scope: scopeFor(u.roles),
            })),
        };
      });
      app.post('/auth/dev/login', async (req, reply) => {
        const body = DevLogin.safeParse(req.body);
        if (!body.success) {
          return reply.badRequest('subject is required');
        }
        const user = await access.bySubject(body.data.subject);
        if (user?.status !== 'active') {
          return reply.notFound('No such identity');
        }
        const token = await new SignJWT({ name: user.displayName, roles: user.roles })
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject(user.subject)
          .setIssuedAt()
          .setExpirationTime(`${opts.ttlSeconds}s`)
          .sign(new TextEncoder().encode(opts.secret));
        return {
          token,
          expiresIn: opts.ttlSeconds,
          user: {
            subject: user.subject,
            displayName: user.displayName,
            roles: user.roles,
            rmId: user.rmId,
            teamId: user.teamId,
            scope: scopeFor(user.roles),
            level: levelFor(user.roles),
          },
        };
      });
    }
    app.get('/auth/me', (req, reply) => {
      if (!req.actor) {
        return reply.unauthorized('Sign in to continue.');
      }
      const a = req.actor;
      return {
        subject: a.subject,
        displayName: a.displayName,
        roles: a.roles,
        rmId: a.rmId,
        teamId: a.teamId,
        scope: a.scope,
        level: a.level,
      };
    });
    done();
  };
