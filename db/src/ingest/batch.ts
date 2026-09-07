/**
 * Batch adapter: reads message files (*.jsonl, one envelope per line, or *.json arrays) from a
 * folder and applies them. The same messages could have come from Kafka.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '../client.js';
import { applyMessages, type ApplyResult } from './apply.js';

export async function readMessageDir(dir: string): Promise<unknown[]> {
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.jsonl') || f.endsWith('.json'))
    .sort();
  const out: unknown[] = [];
  for (const f of files) {
    const text = await readFile(path.join(dir, f), 'utf8');
    if (f.endsWith('.jsonl')) {
      for (const line of text.split('\n')) {
        if (line.trim()) {
          out.push(JSON.parse(line));
        }
      }
    } else {
      const parsed: unknown = JSON.parse(text);
      out.push(...(Array.isArray(parsed) ? (parsed as unknown[]) : [parsed]));
    }
  }
  return out;
}

export async function applyBatchDir(db: Db, dir: string): Promise<ApplyResult> {
  const messages = await readMessageDir(dir);
  return applyMessages(db, messages, { topic: 'batch', source: dir });
}
