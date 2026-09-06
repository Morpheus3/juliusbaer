/**
 * Dataset-specific reference data lives next to the dataset in `<data dir>/reference/` and is
 * optional: a missing file loads an empty table and the features that depend on it degrade
 * gracefully (no look-through, events without transmission rules, no named scenarios).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Db } from '../../client.js';
import {
  issuerGroups,
  lookthroughLegs,
  callPolicy,
  scenarios,
  signalRules,
  signalSeriesRules,
} from '../../schema/derived.js';

const Leg = z.object({
  instrumentId: z.string(),
  leg: z.string(),
  weight: z.number().positive().max(1),
  exposureName: z.string(),
  sector: z.string(),
  region: z.string(),
  matchedInstrumentId: z.string().nullable(),
  note: z.string(),
});
const Issuer = z.object({ instrumentId: z.string(), exposureName: z.string() });
const LookthroughFile = z.object({
  $comment: z.string().optional(),
  legs: z.array(Leg),
  issuers: z.array(Issuer),
});
export type LookthroughLeg = z.infer<typeof Leg>;

const MatchRule = z.record(z.string(), z.union([z.string(), z.boolean()]));
const EventRule = z.object({
  eventId: z.string().regex(/^EV-\d{3}$/),
  match: z.array(MatchRule).min(1),
  shock: z.record(z.string(), z.unknown()),
  note: z.string(),
});
const SeriesRule = z.object({
  seriesId: z.string(),
  unit: z.enum(['pct', 'abs']),
  threshold: z.number().positive(),
  match: z.array(MatchRule).min(1),
  shock: z.array(z.object({ path: z.string(), factor: z.number() })),
});
const SignalFile = z.object({
  $comment: z.string().optional(),
  events: z.array(EventRule),
  derived: z.object({ $comment: z.string().optional(), series: z.array(SeriesRule) }),
});

const ScenarioFile = z.object({
  $comment: z.string().optional(),
  scenarios: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      shock: z.record(z.string(), z.unknown()),
      horizonDays: z.number().int().positive(),
      probabilityNote: z.string(),
    }),
  ),
});

async function readOptional<T>(dir: string, file: string, schema: z.ZodType<T>): Promise<T | null> {
  let text: string;
  try {
    text = await readFile(path.join(dir, file), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
  return schema.parse(JSON.parse(text));
}

export async function loadReference(
  db: Db,
  referenceDir: string,
  knownInstrumentIds: ReadonlySet<string>,
): Promise<{ legs: number; issuers: number }> {
  const ref = await readOptional(referenceDir, 'lookthrough.json', LookthroughFile);
  await db.transaction(async (tx) => {
    await tx.delete(lookthroughLegs);
    await tx.delete(issuerGroups);
    if (ref) {
      await tx.insert(lookthroughLegs).values(ref.legs);
      await tx.insert(issuerGroups).values(ref.issuers);
    }
  });
  if (!ref) {
    return { legs: 0, issuers: 0 };
  }
  const sums = new Map<string, number>();
  for (const l of ref.legs) {
    if (!knownInstrumentIds.has(l.instrumentId)) {
      throw new Error(`lookthrough.json refers to unknown instrument ${l.instrumentId}`);
    }
    if (l.matchedInstrumentId !== null && !knownInstrumentIds.has(l.matchedInstrumentId)) {
      throw new Error(`lookthrough.json matches unknown instrument ${l.matchedInstrumentId}`);
    }
    sums.set(l.instrumentId, (sums.get(l.instrumentId) ?? 0) + l.weight);
  }
  for (const [id, sum] of sums) {
    if (sum > 1.0001) {
      throw new Error(`lookthrough legs for ${id} sum to ${sum}, above 1`);
    }
  }
  return { legs: ref.legs.length, issuers: ref.issuers.length };
}

/** Event rules must point at events that exist; events without a rule are allowed and become unmapped signals. */
export async function loadSignalRules(
  db: Db,
  referenceDir: string,
  eventIds: ReadonlySet<string>,
): Promise<{ rules: number; series: number }> {
  const ref = await readOptional(referenceDir, 'signal_rules.json', SignalFile);
  if (ref) {
    for (const r of ref.events) {
      if (!eventIds.has(r.eventId)) {
        throw new Error(`signal_rules.json rule ${r.eventId} does not match any event`);
      }
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(signalRules);
    await tx.delete(signalSeriesRules);
    if (ref) {
      await tx.insert(signalRules).values(ref.events);
      if (ref.derived.series.length) {
        await tx.insert(signalSeriesRules).values(ref.derived.series);
      }
    }
  });
  return { rules: ref?.events.length ?? 0, series: ref?.derived.series.length ?? 0 };
}

export async function loadScenarios(db: Db, referenceDir: string): Promise<number> {
  const ref = await readOptional(referenceDir, 'scenarios.json', ScenarioFile);
  await db.transaction(async (tx) => {
    await tx.delete(scenarios);
    if (ref?.scenarios.length) {
      await tx.insert(scenarios).values(ref.scenarios.map((s, i) => ({ ...s, ordinal: i })));
    }
  });
  return ref?.scenarios.length ?? 0;
}

const CallPolicyFile = z.looseObject({ version: z.number().int().positive() });

/** Loads the call-plan policy document if the dataset ships one. The API falls back to defaults. */
export async function loadCallPolicy(db: Db, referenceDir: string): Promise<number> {
  const ref = await readOptional(referenceDir, 'call_policy.json', CallPolicyFile);
  await db.transaction(async (tx) => {
    await tx.delete(callPolicy);
    if (ref) {
      await tx.insert(callPolicy).values({ id: 'default', version: ref.version, policy: ref });
    }
  });
  return ref ? 1 : 0;
}
