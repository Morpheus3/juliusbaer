import path from 'node:path';
import { closeDb, createDb } from '../client.js';
import { loadEnv, repoRoot, requireEnv } from '../env.js';
import { applyBatchDir } from '../ingest/batch.js';

loadEnv();
const dir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot(), 'data', 'messages', 'sample');
const db = createDb(requireEnv('DATABASE_URL'), { scope: 'all' });
try {
  const r = await applyBatchDir(db, dir);
  console.log(`load run ${r.loadRunId} (incremental) from ${dir}`);
  console.log(
    `  received ${r.received} · applied ${r.applied} · duplicates ${r.duplicates} · rejected ${r.rejected.length}`,
  );
  for (const [t, n] of Object.entries(r.byType)) {
    console.log(`  ${t.padEnd(30)} ${String(n).padStart(4)}`);
  }
  for (const x of r.rejected) {
    console.error(`  rejected ${x.key}: ${x.error}`);
  }
  console.log(`  changed clients: ${r.changedClients.join(', ') || 'none'}`);
  if (process.env.ANALYTICS_URL && r.changedClients.length) {
    try {
      const res = await fetch(`${process.env.ANALYTICS_URL}/vectors/build`, { method: 'POST' });
      console.log(`  vectors rebuilt: ${res.status}`);
    } catch (err) {
      console.error(`  vectors not rebuilt: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
} finally {
  await closeDb(db);
}
