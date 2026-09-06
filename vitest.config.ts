import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** Root test run: resolve the web app's `@/` alias so its modules load outside Vite. */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'apps/web/src') } },
});
