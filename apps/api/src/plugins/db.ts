import fp from 'fastify-plugin';
import type pg from 'pg';
import { closeDb, createDb, type Db } from '@jb/db';
import { requestStore } from '../services/actor.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Request-scoped when inside an authenticated request; the base pool otherwise. */
    db: Db;
    pool: pg.Pool;
  }
}

export interface DbPluginOptions {
  connectionString: string;
}

/**
 * Owns the base pool (app.scope=none: nothing client-owned is visible) and exposes `app.db` as a
 * proxy that resolves to the request's scoped connection when one exists. Repositories keep a single
 * `db` reference and are row-secured automatically.
 */
export default fp<DbPluginOptions>(
  (app, opts, done) => {
    const base = createDb(opts.connectionString, { scope: 'none' });
    const proxy = new Proxy(base, {
      get(target, prop, receiver) {
        const scoped = requestStore.getStore()?.db;
        const source: object = scoped && prop !== '$client' ? scoped : target;
        const value: unknown = Reflect.get(source, prop, receiver === proxy ? source : receiver);
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(source)
          : value;
      },
    });
    app.decorate('db', proxy);
    app.decorate('pool', base.$client);
    app.addHook('onClose', async () => {
      await closeDb(base);
    });
    done();
  },
  { name: 'db' },
);
