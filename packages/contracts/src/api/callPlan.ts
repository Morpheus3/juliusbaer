import { z } from 'zod';
import { Theme } from './book.js';
import { Urgency } from './risk.js';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Call-plan policy. Every judgement the ranking makes lives here, loaded from
 * data/reference/call_policy.json; a dataset without the file gets these defaults.
 */
export const CallPolicy = z.object({
  version: z.number().int().default(1),
  cadenceDays: z.record(z.string(), z.number()).default({ UHNW: 30, HNW: 60, default: 90 }),
  cashNeedLeadDays: z.number().default(30),
  severeSignalFreshnessBusinessDays: z.number().default(3),
  convergenceBonusPerTheme: z.number().default(2),
  relationshipDebtPer30Days: z.number().default(1),
  relationshipDebtCap: z.number().default(4),
  promiseOverdueBonus: z.number().default(1),
  promiseOverdueCap: z.number().default(3),
  recencyDamperDays: z.number().default(7),
  recencyDamperFactor: z.number().default(0.5),
  laneFallbackBusinessDays: z
    .object({ now: z.number(), week: z.number(), month: z.number() })
    .default({ now: 0, week: 5, month: 20 }),
  capacity: z
    .object({
      conversationsPerDay: z.number(),
      callMinutes: z.number(),
      meetingMinutes: z.number(),
    })
    .default({ conversationsPerDay: 6, callMinutes: 30, meetingMinutes: 60 }),
  rmHours: z
    .object({ timezone: z.string(), start: z.number(), end: z.number() })
    .default({ timezone: 'UTC', start: 9, end: 18 }),
  clientHours: z.object({ start: z.number(), end: z.number() }).default({ start: 9, end: 18 }),
  reviewIntervalMonths: z.number().default(12),
  themeKeywords: z.record(z.string(), z.array(z.string())).default({}),
  timezoneByCountry: z.record(z.string(), z.string()).default({}),
});
export type CallPolicy = z.infer<typeof CallPolicy>;

export const CallPlanTermKey = z.enum(['harm', 'clock', 'convergence', 'relationship', 'damper']);
export type CallPlanTermKey = z.infer<typeof CallPlanTermKey>;

export const CallPlanTerm = z.object({
  term: CallPlanTermKey,
  points: z.number(),
  detail: z.string(),
});
export type CallPlanTerm = z.infer<typeof CallPlanTerm>;

export const CallSlot = z.object({
  /** In the RM's local time, HH:MM. */
  rmStart: z.string(),
  rmEnd: z.string(),
  clientTimezone: z.string(),
  rmTimezone: z.string(),
  /** "client morning" / "client afternoon". */
  note: z.string(),
});
export type CallSlot = z.infer<typeof CallSlot>;

export const CallPlanEntry = z.object({
  clientId: z.string(),
  clientName: z.string(),
  kind: z.enum(['call', 'schedule']),
  status: z.enum(['planned', 'deferred', 'done']),
  returnedEarly: z.boolean(),
  priority: z.number(),
  terms: z.array(CallPlanTerm),
  itemCount: z.number(),
  topLane: Urgency.nullable(),
  themes: z.array(Theme),
  dueBy: IsoDate,
  dueReason: z.string(),
  /** Business day the plan assigns after packing. */
  day: IsoDate,
  slot: CallSlot.nullable(),
  channel: z.enum(['call', 'meeting', 'email']),
  language: z.string(),
  minutes: z.number(),
  talkingPoints: z.array(z.string()),
  lastContact: z.object({ date: IsoDate, channel: z.string(), daysAgo: z.number() }).nullable(),
  deferral: z.object({ until: IsoDate, reason: z.string(), at: z.string() }).nullable(),
  link: z.string(),
});
export type CallPlanEntry = z.infer<typeof CallPlanEntry>;

export const CallPlanResponse = z.object({
  clock: z.string(),
  planDay: IsoDate,
  rmTimezone: z.string(),
  capacity: z.object({
    conversationsPerDay: z.number(),
    plannedToday: z.number(),
    minutesToday: z.number(),
  }),
  entries: z.array(CallPlanEntry),
  policySource: z.enum(['reference', 'defaults']),
  policy: CallPolicy,
  method: z.array(z.string()),
});
export type CallPlanResponse = z.infer<typeof CallPlanResponse>;

export const DeferCallRequest = z.object({
  until: IsoDate,
  reason: z.string().min(5).max(300),
});
export type DeferCallRequest = z.infer<typeof DeferCallRequest>;

export const DoneCallRequest = z.object({
  note: z.string().max(300).optional(),
});
export type DoneCallRequest = z.infer<typeof DoneCallRequest>;
