import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Db } from '../../client.js';
import {
  issuerGroups,
  lookthroughLegs,
  signalRules,
  signalThresholds,
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
const File = z.object({
  $comment: z.string().optional(),
  legs: z.array(Leg),
  issuers: z.array(Issuer),
});

export type LookthroughLeg = z.infer<typeof Leg>;

export async function readLookthrough(): Promise<z.infer<typeof File>> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const text = await readFile(path.join(here, 'lookthrough.json'), 'utf8');
  return File.parse(JSON.parse(text));
}

/** Replaces the reference tables. Validates that every structured product's legs sum to at most 1. */
export async function loadReference(
  db: Db,
  knownInstrumentIds: ReadonlySet<string>,
): Promise<{ legs: number; issuers: number }> {
  const ref = await readLookthrough();
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
  await db.transaction(async (tx) => {
    await tx.delete(lookthroughLegs);
    await tx.delete(issuerGroups);
    await tx.insert(lookthroughLegs).values(ref.legs);
    await tx.insert(issuerGroups).values(ref.issuers);
  });
  return { legs: ref.legs.length, issuers: ref.issuers.length };
}

const SignalRule = z.object({
  eventId: z.string().regex(/^EV-\d{3}$/),
  match: z.array(z.record(z.string(), z.union([z.string(), z.boolean()]))).min(1),
  shock: z.record(z.string(), z.unknown()),
  note: z.string(),
});
const SignalFile = z.object({
  $comment: z.string().optional(),
  events: z.array(SignalRule),
  derived: z.object({
    $comment: z.string().optional(),
    thresholds: z.record(z.string(), z.number().positive()),
  }),
});

export async function readSignalRules(): Promise<z.infer<typeof SignalFile>> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const text = await readFile(path.join(here, 'signal_rules.json'), 'utf8');
  return SignalFile.parse(JSON.parse(text));
}

/** Replaces the signal reference tables. Every event in the log must have exactly one rule. */
export async function loadSignalRules(
  db: Db,
  eventIds: ReadonlySet<string>,
): Promise<{ rules: number; thresholds: number }> {
  const ref = await readSignalRules();
  const ruleIds = new Set(ref.events.map((e) => e.eventId));
  for (const id of eventIds) {
    if (!ruleIds.has(id)) {
      throw new Error(`signal_rules.json has no rule for ${id}`);
    }
  }
  for (const id of ruleIds) {
    if (!eventIds.has(id)) {
      throw new Error(`signal_rules.json rule ${id} does not match any event`);
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(signalRules);
    await tx.delete(signalThresholds);
    await tx.insert(signalRules).values(ref.events);
    await tx.insert(signalThresholds).values(
      Object.entries(ref.derived.thresholds).map(([seriesId, threshold]) => ({
        seriesId,
        threshold,
      })),
    );
  });
  return { rules: ref.events.length, thresholds: Object.keys(ref.derived.thresholds).length };
}
