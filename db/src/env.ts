import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/** Loads the repository-root .env once, if present. Safe to call repeatedly. */
export function loadEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '..', '..');
  const file = path.join(root, '.env');
  if (existsSync(file)) {
    config({ path: file, quiet: true });
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return v;
}

/** Repository root, resolved from this file's location. */
export function repoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..');
}
