import { createHash } from 'node:crypto';

export interface PromptSpec {
  id: string;
  version: string;
  /** Frozen system prompt. Never interpolate volatile content here; it is cached and hashed. */
  system: string;
}

export const sha256 = (s: string): string =>
  createHash('sha256').update(s).digest('hex').slice(0, 16);

export function promptHash(p: PromptSpec): string {
  return sha256(`${p.id}@${p.version}\n${p.system}`);
}
