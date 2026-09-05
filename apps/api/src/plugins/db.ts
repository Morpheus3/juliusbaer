import fp from 'fastify-plugin';
import { closeDb, createDb, type Db } from '@jb/db';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export interface DbPluginOptions {
  connectionString: string;
}

/** Owns one Drizzle client for the server lifetime and closes it on shutdown. */
export default fp<DbPluginOptions>(
  (app, opts, done) => {
    const db = createDb(opts.connectionString);
    app.decorate('db', db);
    app.addHook('onClose', async () => {
      await closeDb(db);
    });
    done();
  },
  { name: 'db' },
);
