import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Fetches JSON and validates it against the shared contract before it reaches the UI. */
export async function getJson<T extends z.ZodType>(url: string, schema: T): Promise<z.output<T>> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message);
  }
  return schema.parse(body);
}
