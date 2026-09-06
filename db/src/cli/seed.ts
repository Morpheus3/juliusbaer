import { closeDb, createDb } from '../client.js';
import { loadEnv, requireEnv } from '../env.js';
import { seed } from '../seed/index.js';

loadEnv();
const db = createDb(requireEnv('DATABASE_URL'), { scope: 'all' });
try {
  const result = await seed(db, { today: process.env.DATASET_TODAY });
  console.log(`load run ${result.loadRunId}`);
  for (const [table, n] of Object.entries(result.rowCounts)) {
    console.log(`  ${table.padEnd(28)} ${String(n).padStart(6)}`);
  }
  console.log(`data-quality issues: ${result.issueCount}`);
  for (const [code, n] of Object.entries(result.issuesByCode).sort()) {
    console.log(`  ${code.padEnd(32)} ${String(n).padStart(4)}`);
  }
} finally {
  await closeDb(db);
}
