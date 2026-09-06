/**
 * Call plan: whom to call, by when, at what hour, through which channel. Deterministic and
 * explained: priority = Σ items harm × clock × damper + convergence + relationship debt, every
 * term reported with its inputs. All judgement comes from the CallPolicy, never from constants here.
 */
import type {
  CallPlanEntry,
  CallPlanTerm,
  CallPolicy,
  CallSlot,
  HorizonItem,
  Theme,
  Urgency,
} from '@jb/contracts';
import { addMonths, daysBetween } from '../dates.js';

const LANE_RANK: Record<Urgency, number> = { now: 3, week: 2, month: 1 };
const SEVERITY_W = { high: 3, medium: 2, low: 1 } as const;
const DAY_MS = 86_400_000;

export interface NoteInput {
  date: string;
  channel: string;
  text: string;
}

export interface CallPlanClientInput {
  clientId: string;
  clientName: string;
  wealthBand: string;
  countryOfResidence: string;
  reportingLanguage: string;
  aumUsd: number;
  items: HorizonItem[];
  ltvTrend: { facilityId: string; headroomNow: number; headroomPrev: number | null }[];
  /** Days between the snapshot the items were built on and the previous one; null when unknown. */
  snapshotIntervalDays: number | null;
  /** Notes dated on or before the clock. */
  notes: NoteInput[];
  kycReviewDue: string;
  clientSince: string;
  deferral: { until: string; reason: string; at: string; madeAtClock: string } | null;
  doneAtClock: string | null;
  /** Open promises past their due date at the clock. */
  overduePromises: number;
}

/* ------------------------------------------------------------------ dates */

const toDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date): string => d.toISOString().slice(0, 10);

export function isBusinessDay(iso: string): boolean {
  const dow = toDate(iso).getUTCDay();
  return dow !== 0 && dow !== 6;
}

export function nextBusinessDay(iso: string): string {
  let d = iso;
  while (!isBusinessDay(d)) {
    d = toIso(new Date(toDate(d).getTime() + DAY_MS));
  }
  return d;
}

export function addBusinessDays(iso: string, n: number): string {
  let d = nextBusinessDay(iso);
  for (let i = 0; i < n; i += 1) {
    d = nextBusinessDay(toIso(new Date(toDate(d).getTime() + DAY_MS)));
  }
  return d;
}

export const addDays = (iso: string, n: number): string =>
  toIso(new Date(toDate(iso).getTime() + n * DAY_MS));

/* --------------------------------------------------------------- deadlines */

/** Due today doubles an item; due in thirty days or more leaves it unchanged. */
export function clockFactor(daysToDeadline: number): number {
  return 1 + Math.max(0, 1 - Math.max(daysToDeadline, 0) / 30);
}

/** The date an item bites, when the data can say. */
export function deadlineFor(
  item: HorizonItem,
  inp: CallPlanClientInput,
  policy: CallPolicy,
  clock: string,
): { date: string; reason: string } | null {
  if (item.theme === 'liquidity' && item.dueDate) {
    return {
      date: addDays(item.dueDate, -policy.cashNeedLeadDays),
      reason: `cash need starts ${item.dueDate}, ${policy.cashNeedLeadDays} days to arrange funding`,
    };
  }
  if (item.dueDate) {
    return { date: item.dueDate, reason: `due ${item.dueDate}` };
  }
  if (item.theme === 'collateral') {
    const f = inp.ltvTrend.find((t) => String(item.evidence.facilityId) === t.facilityId);
    const prev = f?.headroomPrev ?? null;
    if (f !== undefined && prev !== null && inp.snapshotIntervalDays) {
      const fall = prev - f.headroomNow;
      if (fall > 0) {
        const days = Math.max(0, Math.round((f.headroomNow / fall) * inp.snapshotIntervalDays));
        return {
          date: addDays(clock, days),
          reason: `headroom ${f.headroomNow.toFixed(1)} pts falling ${fall.toFixed(1)} per snapshot; projected breach in ${days} days`,
        };
      }
    }
    return null;
  }
  if (item.theme === 'signal' && item.severity === 'high') {
    return {
      date: addBusinessDays(clock, policy.severeSignalFreshnessBusinessDays),
      reason: `severe signal; ${policy.severeSignalFreshnessBusinessDays} business days of freshness`,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ notes */

/** Themes the RM already discussed within the damper window, from note keywords in the policy. */
export function dampedThemes(notes: NoteInput[], policy: CallPolicy, clock: string): Set<Theme> {
  const recent = notes.filter((n) => {
    const d = daysBetween(n.date, clock);
    return d >= 0 && d <= policy.recencyDamperDays;
  });
  const out = new Set<Theme>();
  for (const n of recent) {
    const text = n.text.toLowerCase();
    for (const [theme, words] of Object.entries(policy.themeKeywords)) {
      if (words.some((w) => text.includes(w.toLowerCase()))) {
        out.add(theme as Theme);
      }
    }
  }
  return out;
}

export function lastContact(
  notes: NoteInput[],
  clock: string,
): { date: string; channel: string; daysAgo: number } | null {
  const past = notes.filter((n) => n.date <= clock).sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = past[0];
  return last
    ? { date: last.date, channel: last.channel, daysAgo: daysBetween(last.date, clock) }
    : null;
}

/** A review is due when no note mentioning a review falls inside the interval. */
export function reviewDue(
  notes: NoteInput[],
  policy: CallPolicy,
  clock: string,
  clientSince: string,
): boolean {
  const since = addMonths(clock, -policy.reviewIntervalMonths);
  if (clientSince > since) {
    return false;
  }
  return !notes.some((n) => n.date > since && n.date <= clock && /review/i.test(n.text));
}

export function preferredChannel(notes: NoteInput[]): 'call' | 'meeting' | 'email' {
  const counts = new Map<string, number>();
  for (const n of notes) {
    const c = n.channel.toLowerCase();
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top === 'meeting' ? 'meeting' : top === 'email' ? 'email' : 'call';
}

/* --------------------------------------------------------------- priority */

export interface Scored {
  priority: number;
  terms: CallPlanTerm[];
  dueBy: string;
  dueReason: string;
  topLane: Urgency | null;
  themes: Theme[];
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

export function scoreClient(inp: CallPlanClientInput, policy: CallPolicy, clock: string): Scored {
  const damped = dampedThemes(inp.notes, policy, clock);
  let harm = 0;
  let clockExtra = 0;
  let damperCut = 0;
  let dueBy: { date: string; reason: string } | null = null;
  const clockDetails: string[] = [];
  const damperDetails: string[] = [];

  for (const it of inp.items) {
    const base =
      LANE_RANK[it.lane] * SEVERITY_W[it.severity] +
      (it.momentum === 'escalated' || it.momentum === 'new' ? 1 : 0);
    const dl = deadlineFor(it, inp, policy, clock);
    const tau = dl ? clockFactor(daysBetween(clock, dl.date)) : 1;
    const isDamped = damped.has(it.theme) && it.momentum !== 'escalated';
    const factor = isDamped ? policy.recencyDamperFactor : 1;
    harm += base;
    clockExtra += base * (tau - 1) * factor;
    if (isDamped) {
      damperCut += base * tau * (1 - factor);
      damperDetails.push(`${it.theme} discussed in the last ${policy.recencyDamperDays} days`);
    }
    if (dl) {
      clockDetails.push(`${it.title}: ${dl.reason} (×${tau.toFixed(2)})`);
      if (dueBy === null || dl.date < dueBy.date) {
        dueBy = dl;
      }
    }
  }

  const themes = [...new Set(inp.items.map((i) => i.theme))];
  const urgentThemes = new Set(inp.items.filter((i) => i.lane !== 'month').map((i) => i.theme));
  const convergence = Math.max(0, urgentThemes.size - 1) * policy.convergenceBonusPerTheme;

  const lc = lastContact(inp.notes, clock);
  const cadence = policy.cadenceDays[inp.wealthBand] ?? policy.cadenceDays.default ?? 90;
  const overdue = lc ? lc.daysAgo - cadence : daysBetween(inp.clientSince, clock) - cadence;
  const contactDebt =
    overdue > 0
      ? Math.min(
          policy.relationshipDebtCap,
          Math.ceil(overdue / 30) * policy.relationshipDebtPer30Days,
        )
      : 0;
  const promiseDebt = Math.min(
    policy.promiseOverdueCap,
    inp.overduePromises * policy.promiseOverdueBonus,
  );
  const debt = contactDebt + promiseDebt;

  const topLane =
    inp.items.map((i) => i.lane).sort((a, b) => LANE_RANK[b] - LANE_RANK[a])[0] ?? null;
  // The lane is a deadline too: a Now item is due today whatever the dated items say.
  const lane = topLane ?? 'month';
  const laneDate = addBusinessDays(clock, policy.laneFallbackBusinessDays[lane]);
  if (dueBy === null || laneDate < dueBy.date) {
    dueBy = {
      date: laneDate,
      reason:
        dueBy === null
          ? `no dated item; ${lane} lane allows ${policy.laneFallbackBusinessDays[lane]} business days`
          : `${lane} lane allows ${policy.laneFallbackBusinessDays[lane]} business days, sooner than the dated items`,
    };
  }

  const terms: CallPlanTerm[] = [
    {
      term: 'harm',
      points: r1(harm),
      detail: `${inp.items.length} open item${inp.items.length === 1 ? '' : 's'}: Σ lane (Now 3, week 2, month 1) × severity (high 3, medium 2, low 1), +1 per new or escalated item`,
    },
    {
      term: 'clock',
      points: r1(clockExtra),
      detail: clockDetails.length
        ? clockDetails.join('; ')
        : 'no item carries a deadline the data can date',
    },
    {
      term: 'convergence',
      points: r1(convergence),
      detail: `${urgentThemes.size} theme${urgentThemes.size === 1 ? '' : 's'} among Now and week items (${[...urgentThemes].join(', ') || 'none'}); +${policy.convergenceBonusPerTheme} per theme beyond the first`,
    },
    {
      term: 'relationship',
      points: r1(debt),
      detail: lc
        ? `last contact ${lc.date} (${lc.daysAgo} days ago) against a ${cadence}-day cadence for ${inp.wealthBand}${overdue > 0 ? `; ${overdue} days overdue` : ''}${inp.overduePromises > 0 ? `; ${inp.overduePromises} promise${inp.overduePromises === 1 ? '' : 's'} past due (+${promiseDebt})` : '; no promise past due'}`
        : `no note on record since onboarding ${inp.clientSince}; ${cadence}-day cadence for ${inp.wealthBand}`,
    },
    {
      term: 'damper',
      points: damperCut === 0 ? 0 : r1(-damperCut),
      detail: damperDetails.length
        ? [...new Set(damperDetails)].join('; ')
        : 'nothing discussed in the damper window',
    },
  ];
  const priority = r1(terms.reduce((s, t) => s + t.points, 0));
  return { priority, terms, dueBy: dueBy.date, dueReason: dueBy.reason, topLane, themes };
}

/* ------------------------------------------------------------------- slot */

/** UTC offset in hours of a zone on a date (midday, to dodge DST edges). */
export function tzOffsetHours(timeZone: string, dateIso: string): number {
  const at = new Date(`${dateIso}T12:00:00Z`);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
  } catch {
    return 0;
  }
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round(((asUtc - at.getTime()) / 3_600_000) * 4) / 4;
}

const hhmm = (h: number): string => {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${String(whole).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * The first three hours where the client's business day overlaps the RM's, in RM time.
 * Null when the days never overlap: write first, call later.
 */
export function slotFor(
  clientTimezone: string,
  policy: CallPolicy,
  dateIso: string,
): CallSlot | null {
  const rmTz = policy.rmHours.timezone;
  const shift = tzOffsetHours(rmTz, dateIso) - tzOffsetHours(clientTimezone, dateIso);
  const start = Math.max(policy.rmHours.start, policy.clientHours.start + shift);
  const end = Math.min(policy.rmHours.end, policy.clientHours.end + shift);
  if (end - start < 1) {
    return null;
  }
  const slotEnd = Math.min(end, start + 3);
  const clientHour = start - shift;
  return {
    rmStart: hhmm(start),
    rmEnd: hhmm(slotEnd),
    clientTimezone,
    rmTimezone: rmTz,
    note: clientHour < 12 ? 'client morning' : 'client afternoon',
  };
}

/* ---------------------------------------------------------------- entries */

export interface PlanOptions {
  clock: string;
  policy: CallPolicy;
}

export function buildEntry(inp: CallPlanClientInput, opts: PlanOptions): CallPlanEntry {
  const { clock, policy } = opts;
  const scored = scoreClient(inp, policy, clock);
  const review = reviewDue(inp.notes, policy, clock, inp.clientSince);
  const hasUrgent = inp.items.some((i) => i.lane !== 'month');
  const kind: CallPlanEntry['kind'] = hasUrgent || !review ? 'call' : 'schedule';
  const forceCall = inp.items.some(
    (i) => i.lane === 'now' && (i.theme === 'collateral' || i.theme === 'contact'),
  );
  const channel: CallPlanEntry['channel'] =
    kind === 'schedule' ? 'meeting' : forceCall ? 'call' : preferredChannel(inp.notes);
  const tz = policy.timezoneByCountry[inp.countryOfResidence] ?? policy.rmHours.timezone;
  const day = nextBusinessDay(clock);
  const slot = slotFor(tz, policy, day);
  const sorted = [...inp.items].sort(
    (a, b) =>
      LANE_RANK[b.lane] - LANE_RANK[a.lane] || SEVERITY_W[b.severity] - SEVERITY_W[a.severity],
  );
  const talking = sorted.slice(0, 3).map((i) => i.title);
  if (review) {
    talking.push('Annual review is due');
  }

  let status: CallPlanEntry['status'] = 'planned';
  let returnedEarly = false;
  if (inp.doneAtClock === clock) {
    status = 'done';
  } else if (inp.deferral && inp.deferral.madeAtClock <= clock && clock < inp.deferral.until) {
    const escalated = inp.items.some((i) => i.lane === 'now' && i.momentum === 'escalated');
    if (escalated) {
      returnedEarly = true;
    } else {
      status = 'deferred';
    }
  }

  return {
    clientId: inp.clientId,
    clientName: inp.clientName,
    kind,
    status,
    returnedEarly,
    priority: scored.priority,
    terms: scored.terms,
    itemCount: inp.items.length,
    topLane: scored.topLane,
    themes: scored.themes,
    dueBy: scored.dueBy,
    dueReason: scored.dueReason,
    day: status === 'deferred' && inp.deferral ? inp.deferral.until : day,
    slot: channel === 'email' ? null : slot,
    channel: slot === null && channel === 'call' ? 'email' : channel,
    language: inp.reportingLanguage,
    minutes: kind === 'schedule' ? policy.capacity.meetingMinutes : policy.capacity.callMinutes,
    talkingPoints: talking,
    lastContact: lastContact(inp.notes, clock),
    deferral: inp.deferral
      ? { until: inp.deferral.until, reason: inp.deferral.reason, at: inp.deferral.at }
      : null,
    link: `/clients/${inp.clientId}`,
  };
}

/**
 * Packs planned calls into business days by due date then priority, within the daily capacity.
 * Overflow moves to the next business day; deferred and done entries keep their own day.
 */
export function packDays(
  entries: CallPlanEntry[],
  clock: string,
  policy: CallPolicy,
): CallPlanEntry[] {
  const planned = entries
    .filter((e) => e.status === 'planned' && e.kind === 'call')
    .sort((a, b) => (a.dueBy < b.dueBy ? -1 : a.dueBy > b.dueBy ? 1 : b.priority - a.priority));
  let day = nextBusinessDay(clock);
  let used = 0;
  for (const e of planned) {
    if (used >= policy.capacity.conversationsPerDay) {
      day = addBusinessDays(day, 1);
      used = 0;
    }
    e.day = day;
    e.slot = e.slot ? slotFor(e.slot.clientTimezone, policy, day) : null;
    used += 1;
  }
  return entries;
}

export const CALL_PLAN_METHOD = [
  'Priority = Σ over open items of harm × clock × damper, plus convergence, plus relationship debt. Ties break by AUM.',
  'Harm is the cockpit urgency: lane rank (Now 3, week 2, month 1) × severity (high 3, medium 2, low 1), +1 per new or escalated item, so the sheet and the lanes never disagree on direction.',
  'Clock multiplies each item by 1 + max(0, 1 − days to deadline / 30). Deadlines come from KYC dates, cash-need starts less the policy lead time, projected collateral breach (headroom ÷ fall per snapshot × snapshot interval) and a freshness window for severe signals.',
  'Convergence adds the policy bonus for every distinct theme beyond the first among Now and week items: one conversation, several outcomes.',
  'Relationship debt adds one point per thirty days the client is overdue against the cadence for their wealth band, capped, plus a point per open promise past its due date, capped.',
  'The damper halves an item whose theme appears in a note inside the damper window, unless it escalated since.',
  'Due-by is the earliest deadline; without one the lane decides. The slot is the first three hours where the client’s business day overlaps the RM’s, from the residence-to-timezone table. Channel follows the notes, forced to a call for collateral and unanswered messages and to a meeting for reviews.',
  'Calls are packed by due-by then priority into the daily capacity; overflow moves to the next business day and stays visible. Deferrals and done marks are audit events.',
  'Every number above comes from the policy file in the reference data. Nothing dials, sends or books.',
];
