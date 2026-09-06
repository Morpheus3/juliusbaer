import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool };

/**
 * Row-level security scope a connection runs under. Every client-owned table denies rows unless
 * app.scope says otherwise, so a process must declare what it is:
 *  - 'all': loaders, migrations and the analytics service (a service role)
 *  - 'none': the API's base pool; per-request connections set own/team/all after authentication
 */
export type DbScope = 'all' | 'none';

export interface DbOptions {
  scope?: DbScope;
  max?: number;
}

/** Creates a pooled Drizzle client. The caller owns its lifetime; call closeDb() when done. */
export function createDb(connectionString: string, opts: DbOptions = {}): Db {
  const scope = opts.scope ?? 'none';
  const pool = new pg.Pool({
    connectionString,
    max: opts.max ?? 10,
    // Custom GUCs travel in the startup packet, so they hold from the first statement.
    options: scope === 'all' ? '-c app.scope=all' : '-c app.scope=none',
  });
  return drizzle(pool, { schema, casing: 'snake_case' });
}

/** A Drizzle client bound to one checked-out connection (the API's per-request scope). */
export function drizzleFor(client: pg.PoolClient): NodePgDatabase<typeof schema> {
  return drizzle(client, { schema, casing: 'snake_case' });
}

export async function closeDb(db: Db): Promise<void> {
  await db.$client.end();
}
