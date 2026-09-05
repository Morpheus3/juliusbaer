import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ClaudeSettings } from '@jb/contracts';
import { repoRoot } from '@jb/db';
import type { ClaudeGateway } from '../llm/gateway.js';

/** Runtime configuration of the Claude gateway. The key is held in API process memory; persistence to .env is opt-in. */
export class SettingsService {
  private persisted = false;

  constructor(private readonly gateway: ClaudeGateway) {}

  claude(): ClaudeSettings {
    return { ...this.gateway.status(), persisted: this.persisted };
  }

  async setClaudeKey(apiKey: string, persist: boolean): Promise<ClaudeSettings> {
    await this.gateway.configure(apiKey);
    if (persist) {
      await this.writeEnv('ANTHROPIC_API_KEY', apiKey);
      this.persisted = true;
    }
    return this.claude();
  }

  async clearClaudeKey(): Promise<ClaudeSettings> {
    this.gateway.clear();
    if (this.persisted) {
      await this.writeEnv('ANTHROPIC_API_KEY', '');
      this.persisted = false;
    }
    return this.claude();
  }

  /** Replaces or appends one KEY=value line in the repository's .env. Never logs the value. */
  private async writeEnv(key: string, value: string): Promise<void> {
    const file = path.join(repoRoot(), '.env');
    let text = '';
    try {
      text = await readFile(file, 'utf8');
    } catch {
      text = '';
    }
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    const next = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`;
    await writeFile(file, next, { mode: 0o600 });
  }
}
