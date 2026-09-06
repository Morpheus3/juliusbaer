import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, createDb } from '../client.js';
import { loadEnv, repoRoot, requireEnv } from '../env.js';

loadEnv();
const db = createDb(requireEnv('DATABASE_URL'), { scope: 'all' });
try {
  await migrate(db, {
    migrationsFolder: path.join(repoRoot(), 'db', 'migrations'),
  });
  console.log('migrations applied');
} finally {
  await closeDb(db);
}
