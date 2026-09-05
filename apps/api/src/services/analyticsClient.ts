import { z } from 'zod';

const BuildResponse = z.object({
  run_id: z.string(),
  engine_version: z.string(),
  client_count: z.number(),
  feature_count: z.number(),
});

export class AnalyticsUnavailableError extends Error {
  constructor(detail: string) {
    super(`Analytics service unavailable: ${detail}`);
    this.name = 'AnalyticsUnavailableError';
  }
}

/** Thin typed client for the Python analytics service. */
export class AnalyticsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async buildVectors(): Promise<z.infer<typeof BuildResponse>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/vectors/build`, { method: 'POST' });
    } catch (err) {
      throw new AnalyticsUnavailableError(err instanceof Error ? err.message : String(err));
    }
    if (!res.ok) {
      const text = await res.text();
      throw new AnalyticsUnavailableError(`${res.status} ${text}`);
    }
    return BuildResponse.parse(await res.json());
  }
}
