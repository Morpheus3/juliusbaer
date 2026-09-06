import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  schemaFilter: ['raw', 'derived', 'access', 'ingest'],
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://rmw:rmw_local_dev@localhost:5433/rm_workbench',
  },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
