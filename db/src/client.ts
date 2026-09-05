import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool };

/** Creates a pooled Drizzle client. The caller owns its lifetime; call closeDb() when done. */
export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });
  return drizzle(pool, { schema, casing: 'snake_case' });
}

export async function closeDb(db: Db): Promise<void> {
  await db.$client.end();
}
