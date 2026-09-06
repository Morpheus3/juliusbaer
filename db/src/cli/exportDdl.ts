/**
 * Exports the plain-SQL DDL for the whole database into db/sql/schema.sql by concatenating the
 * Drizzle migrations in journal order. Drizzle migrations stay the source of truth for the app;
 * this file exists for DBAs, reviews and platforms that apply SQL directly.
 *
 *   npm run db:ddl
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from '../env.js';

const root = repoRoot();
const migrations = path.join(root, 'db', 'migrations');
const journal = JSON.parse(
  await readFile(path.join(migrations, 'meta', '_journal.json'), 'utf8'),
) as {
  entries: { idx: number; tag: string; when: number }[];
};
const parts: string[] = [
  '-- RM Workbench · full DDL, generated from db/migrations by `npm run db:ddl`.',
  '-- Apply on an empty database that already has the pgvector and pgcrypto extensions',
  '-- (see db/init/01-extensions.sql) with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/sql/schema.sql',
  '-- Do not edit by hand; edit the Drizzle schema, generate a migration, then re-export.',
  `-- Generated ${new Date().toISOString().slice(0, 10)} from ${journal.entries.length} migrations.`,
  '',
  'BEGIN;',
  '',
];
for (const e of journal.entries.sort((a, b) => a.idx - b.idx)) {
  const sql = await readFile(path.join(migrations, `${e.tag}.sql`), 'utf8');
  parts.push(`-- ============================================================================`);
  parts.push(
    `-- ${String(e.idx).padStart(4, '0')} · ${e.tag} · ${new Date(e.when).toISOString().slice(0, 10)}`,
  );
  parts.push(`-- ============================================================================`);
  parts.push(sql.replace(/--> statement-breakpoint\n?/g, '').trimEnd());
  parts.push('');
}
parts.push('COMMIT;', '');
await writeFile(path.join(root, 'db', 'sql', 'schema.sql'), parts.join('\n'));
console.log(`db/sql/schema.sql written from ${journal.entries.length} migrations`);
