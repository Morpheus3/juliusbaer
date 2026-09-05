import type { Scenario, ScenariosResponse } from '@jb/contracts';
import {
  ImpactResponse,
  Shock,
  type ImpactRequest,
  type ImpactRunsResponse,
  type SignalsResponse,
} from '@jb/contracts';
import { z } from 'zod';
import { daysBetween } from '../domain/dates.js';
import { buildSignals, snapshotForClock } from '../domain/signals/build.js';
import type { ClientDetailRepository } from '../repositories/clientDetailRepository.js';
import type { SignalRepository } from '../repositories/signalRepository.js';
import { AnalyticsUnavailableError } from './analyticsClient.js';
import { ClientNotFoundError } from './vectorService.js';

/** Feed older than this (in dataset days) shows the stale-data warning. */
export const STALE_AFTER_DAYS = 30;

export class SignalService {
  constructor(
    private readonly signals: SignalRepository,
    private readonly clients: ClientDetailRepository,
    private readonly analyticsUrl: string,
    private readonly today: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private clampClock(clock: string | undefined): string {
    const c = clock ?? this.today;
    return c > this.today ? this.today : c;
  }

  async feed(clock: string | undefined, clientId: string | undefined): Promise<SignalsResponse> {
    const at = this.clampClock(clock);
    const [inputs, bundle] = await Promise.all([
      this.signals.inputs(),
      clientId ? this.clients.bundle(clientId) : null,
    ]);
    if (clientId && !bundle) {
      throw new ClientNotFoundError(clientId);
    }
    const snapshot = snapshotForClock(at);
    const snapshotAgeDays = daysBetween(snapshot, at);
    return {
      clock: at,
      snapshotDate: snapshot,
      snapshotAgeDays,
      stale: snapshotAgeDays > STALE_AFTER_DAYS,
      signals: buildSignals(inputs, at, bundle),
    };
  }

  async scenarios(): Promise<z.infer<typeof ScenariosResponse>> {
    const res = await this.callAnalytics('/impact/scenarios', undefined);
    const parsed = z
      .object({
        scenarios: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            shock: Shock,
            horizon_days: z.number(),
            probability_note: z.string(),
          }),
        ),
      })
      .parse(res);
    return {
      scenarios: parsed.scenarios.map((s): Scenario => ({
        id: s.id,
        name: s.name,
        description: s.description,
        shock: s.shock,
        horizonDays: s.horizon_days,
        probabilityNote: s.probability_note,
      })),
    };
  }

  async impact(
    clientId: string,
    req: ImpactRequest,
    clock: string | undefined,
  ): Promise<ImpactResponse> {
    const at = this.clampClock(clock);
    const snapshot = req.snapshotDate ?? snapshotForClock(at);
    const [inputs, bundle] = await Promise.all([
      this.signals.inputs(),
      this.clients.bundle(clientId),
    ]);
    if (!bundle) {
      throw new ClientNotFoundError(clientId);
    }
    const all = buildSignals(inputs, this.today, null);
    const chosen = all.filter((s) => req.signalIds.includes(s.id));
    const missing = req.signalIds.filter((id) => !chosen.some((s) => s.id === id));
    if (missing.length > 0) {
      throw new UnknownSignalError(missing);
    }
    const body = {
      client_id: clientId,
      snapshot_date: snapshot,
      severity: req.severity,
      shocks: chosen.map((s) => s.shock),
      scenario_id: req.scenarioId ?? null,
      label: req.label ?? null,
      save: req.save,
      request_echo: {
        signalIds: req.signalIds,
        scenarioId: req.scenarioId ?? null,
        severity: req.severity,
        snapshotDate: snapshot,
        clock: at,
      },
    };
    const res = await this.callAnalytics('/impact/run', body);
    return ImpactResponse.parse(res);
  }

  async savedRuns(clientId: string): Promise<ImpactRunsResponse> {
    const runs = await this.signals.runsForClient(clientId);
    return {
      runs: runs.map((r) => {
        const result = r.result as { total_usd?: number; total_pct?: number; severity?: string };
        const request = r.request as { signalIds?: string[]; scenarioId?: string | null };
        return {
          id: r.id,
          label: r.label,
          snapshotDate: r.snapshotDate,
          createdAt: r.createdAt.toISOString(),
          totalUsd: result.total_usd ?? 0,
          totalPct: result.total_pct ?? 0,
          severity: (result.severity ?? 'base') as 'mild' | 'base' | 'severe',
          signalIds: request.signalIds ?? [],
          scenarioId: request.scenarioId ?? null,
        };
      }),
    };
  }

  private async callAnalytics(path: string, body: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${this.analyticsUrl}${path}`,
        body === undefined
          ? undefined
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            },
      );
    } catch (err) {
      throw new AnalyticsUnavailableError(err instanceof Error ? err.message : String(err));
    }
    if (!res.ok) {
      throw new AnalyticsUnavailableError(`${res.status} ${await res.text()}`);
    }
    return res.json();
  }
}

export class UnknownSignalError extends Error {
  constructor(readonly ids: string[]) {
    super(`Unknown signal id(s): ${ids.join(', ')}`);
    this.name = 'UnknownSignalError';
  }
}
