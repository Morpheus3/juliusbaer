/**
 * Claude gateway. One place for model choice, prompt versions, structured-output validation,
 * recorded-mode replay and trace persistence. Nothing else in the API talks to the SDK.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { llmTraces, type Db } from '@jb/db';
import { promptHash, sha256, type PromptSpec } from './prompts/registry.js';

export type GatewayMode = 'live' | 'recorded';

export interface GatewayConfig {
  apiKey: string | undefined;
  analysisModel: string;
  fastModel: string;
  /** Directory of recorded responses used when no key is available (and written when recording). */
  recordingsDir?: string;
  record?: boolean;
}

export interface StructuredCall<T extends z.ZodType> {
  prompt: PromptSpec;
  input: unknown;
  schema: T;
  clientId?: string | undefined;
  tier?: 'analysis' | 'fast';
}

export type StructuredResult<T> =
  | { status: 'ok'; data: T; traceId: string; model: string; mode: GatewayMode }
  | { status: 'unavailable'; traceId: string | null; note: string }
  | { status: 'invalid'; traceId: string; note: string };

export class ClaudeGateway {
  private readonly client: Anthropic | null;
  readonly mode: GatewayMode;
  private readonly recordingsDir: string;

  constructor(
    private readonly cfg: GatewayConfig,
    private readonly db: Db,
  ) {
    this.client = cfg.apiKey ? new Anthropic({ apiKey: cfg.apiKey }) : null;
    this.mode = this.client ? 'live' : 'recorded';
    this.recordingsDir =
      cfg.recordingsDir ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'recordings');
  }

  private recordingPath(key: string): string {
    return path.join(this.recordingsDir, `${key}.json`);
  }

  /** A structured call: validated against the Zod schema on both live and replayed paths. */
  async structured<T extends z.ZodType>(
    call: StructuredCall<T>,
  ): Promise<StructuredResult<z.output<T>>> {
    const model = call.tier === 'fast' ? this.cfg.fastModel : this.cfg.analysisModel;
    const inputJson = JSON.stringify(call.input);
    const inputHash = sha256(inputJson);
    const pHash = promptHash(call.prompt);
    const key = `${call.prompt.id}-${call.prompt.version}-${pHash}-${inputHash}`;
    const started = Date.now();
    const base = {
      promptId: call.prompt.id,
      promptVersion: call.prompt.version,
      promptHash: pHash,
      model,
      inputHash,
      clientId: call.clientId ?? null,
      request: { system: call.prompt.system, input: call.input },
    };

    if (!this.client) {
      const recorded = await this.readRecording(key);
      if (!recorded) {
        const [t] = await this.db
          .insert(llmTraces)
          .values({
            ...base,
            mode: 'recorded',
            error: 'no API key and no recording for this input',
          })
          .returning({ id: llmTraces.id });
        return {
          status: 'unavailable',
          traceId: t?.id ?? null,
          note: 'LLM assessor unavailable: no ANTHROPIC_API_KEY and no recorded response for this input.',
        };
      }
      const parsed = call.schema.safeParse(recorded);
      const [t] = await this.db
        .insert(llmTraces)
        .values({
          ...base,
          mode: 'recorded',
          response: recorded as Record<string, unknown>,
          latencyMs: Date.now() - started,
          error: parsed.success ? null : 'recording failed schema validation',
        })
        .returning({ id: llmTraces.id });
      const traceId = t?.id ?? '';
      return parsed.success
        ? { status: 'ok', data: parsed.data, traceId, model, mode: 'recorded' }
        : { status: 'invalid', traceId, note: 'Recorded response no longer matches the schema.' };
    }

    try {
      const response = await this.client.messages.parse({
        model,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: [{ type: 'text', text: call.prompt.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: inputJson }],
        output_config: { format: zodOutputFormat(call.schema) },
      });
      const usage: Record<string, unknown> = { ...response.usage };
      const parsed = response.parsed_output;
      const [t] = await this.db
        .insert(llmTraces)
        .values({
          ...base,
          mode: 'live',
          response: (parsed ?? { stop_reason: response.stop_reason }) as Record<string, unknown>,
          usage,
          latencyMs: Date.now() - started,
          error: parsed ? null : `no parsed output (stop_reason ${response.stop_reason})`,
        })
        .returning({ id: llmTraces.id });
      const traceId = t?.id ?? '';
      if (!parsed) {
        return {
          status: 'invalid',
          traceId,
          note: `Model returned no schema-valid output (stop reason ${response.stop_reason}).`,
        };
      }
      if (this.cfg.record) {
        await writeFile(this.recordingPath(key), JSON.stringify(parsed, null, 2));
      }
      return { status: 'ok', data: parsed, traceId, model, mode: 'live' };
    } catch (err) {
      const message =
        err instanceof Anthropic.APIError
          ? `${err.status ?? ''} ${err.name}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      const [t] = await this.db
        .insert(llmTraces)
        .values({ ...base, mode: 'live', latencyMs: Date.now() - started, error: message })
        .returning({ id: llmTraces.id });
      return {
        status: 'unavailable',
        traceId: t?.id ?? null,
        note: `Claude call failed: ${message}`,
      };
    }
  }

  private async readRecording(key: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.recordingPath(key), 'utf8')) as unknown;
    } catch {
      return null;
    }
  }
}
