/**
 * Authentication and per-request database scope.
 *
 * 1. Verify the bearer token (HS256 with AUTH_SECRET in development; RS256 against the identity
 *    provider's JWKS in production) and resolve the caller in access.users.
 * 2. Lease one connection from the pool, set app.scope / app.rm_id / app.team_id on it, and run the
 *    rest of the request inside AsyncLocalStorage so every repository query is row-secured.
 * 3. Release the connection with RESET ALL when the response is sent.
 */
import fp from 'fastify-plugin';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { drizzleFor } from '@jb/db';
import type { AccessRepository } from '../repositories/accessRepository.js';
import { levelFor, requestStore, scopeFor, type Actor } from '../services/actor.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

export interface AuthPluginOptions {
  mode: 'dev' | 'oidc';
  secret: string;
  issuer: string | undefined;
  audience: string | undefined;
  jwksUrl: string | undefined;
  access: AccessRepository;
  /** Paths that need no token. */
  publicPrefixes: string[];
}

export default fp<AuthPluginOptions>(
  (app, opts, done) => {
    const jwks = opts.jwksUrl ? createRemoteJWKSet(new URL(opts.jwksUrl)) : null;
    const secret = new TextEncoder().encode(opts.secret);

    async function verify(token: string): Promise<JWTPayload> {
      if (opts.mode === 'oidc' && jwks) {
        const { payload } = await jwtVerify(token, jwks, {
          ...(opts.issuer ? { issuer: opts.issuer } : {}),
          ...(opts.audience ? { audience: opts.audience } : {}),
        });
        return payload;
      }
      const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
      return payload;
    }

    app.decorateRequest('actor', null);

    app.addHook('onRequest', (req, reply, next) => {
      const url = req.url.split('?')[0] ?? req.url;
      if (
        opts.publicPrefixes.some((p) => url === p || url.startsWith(`${p}/`)) ||
        req.method === 'OPTIONS'
      ) {
        next();
        return;
      }
      const header = req.headers.authorization;
      const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) {
        void reply
          .code(401)
          .send({ statusCode: 401, error: 'Unauthorized', message: 'Sign in to continue.' });
        return;
      }
      void (async () => {
        let payload: JWTPayload;
        try {
          payload = await verify(token);
        } catch {
          void reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Your session has expired. Sign in again.',
          });
          return;
        }
        const subject = typeof payload.sub === 'string' ? payload.sub : null;
        const user = subject ? await opts.access.bySubject(subject) : null;
        if (user?.status !== 'active') {
          void reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'This identity has no access to the workbench.',
          });
          return;
        }
        const actor: Actor = {
          userId: user.userId,
          subject: user.subject,
          displayName: user.displayName,
          roles: user.roles,
          rmId: user.rmId,
          teamId: user.teamId,
          scope: scopeFor(user.roles),
          level: levelFor(user.roles),
        };
        req.actor = actor;
        const client = await app.pool.connect();
        try {
          await client.query(
            'select set_config($1, $2, false), set_config($3, $4, false), set_config($5, $6, false)',
            [
              'app.scope',
              actor.scope,
              'app.rm_id',
              actor.rmId ?? '',
              'app.team_id',
              actor.teamId ?? '',
            ],
          );
        } catch (err) {
          client.release(err instanceof Error ? err : undefined);
          throw err;
        }
        const release = async (): Promise<void> => {
          try {
            await client.query('RESET ALL');
          } finally {
            client.release();
          }
        };
        reply.raw.once('finish', () => {
          void release();
        });
        reply.raw.once('close', () => {
          if (!reply.raw.writableFinished) {
            void release();
          }
        });
        requestStore.run({ actor, db: drizzleFor(client) }, () => {
          next();
        });
      })().catch((err: unknown) => {
        next(err instanceof Error ? err : new Error(String(err)));
      });
    });
    done();
  },
  { name: 'auth', dependencies: ['db'] },
);
