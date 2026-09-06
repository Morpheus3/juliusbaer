/** Entity resolution for the grammar planner: clients, signals, scenarios, dates, themes. Pure. */
import type { ClientAlert } from '@jb/contracts';

export interface ClientRef {
  clientId: string;
  name: string;
}
export interface SignalRef {
  id: string;
  title: string;
  date: string;
}
export interface ScenarioRef {
  id: string;
  name: string;
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'what',
  'who',
  'why',
  'how',
  'does',
  'did',
  'about',
  'his',
  'her',
  'their',
  'that',
  'this',
  'from',
  'into',
  'have',
  'has',
  'should',
  'would',
  'could',
  'when',
  'where',
  'which',
  'client',
  'clients',
  'family',
  'office',
  'enterprises',
  'holdings',
  'limited',
  'ltd',
]);

/** Finds the client named in the text: by id, by full name, or by a distinctive name token. */
export function resolveClient(text: string, clients: ClientRef[]): ClientRef | null {
  const id = /\b(CL-\d{3,})\b/i.exec(text)?.[1]?.toUpperCase();
  if (id) {
    return clients.find((c) => c.clientId.toUpperCase() === id) ?? null;
  }
  const t = norm(text);
  const byFull = clients.find((c) => t.includes(norm(c.name)));
  if (byFull) {
    return byFull;
  }
  const words = new Set(t.split(/[\s-]+/).filter((w) => w.length >= 3 && !STOP.has(w)));
  let best: { c: ClientRef; hits: number } | null = null;
  let tie = false;
  for (const c of clients) {
    const tokens = norm(c.name)
      .split(/[\s-]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w));
    const hits = tokens.filter((w) => words.has(w)).length;
    if (hits > 0 && (best === null || hits > best.hits)) {
      best = { c, hits };
      tie = false;
    } else if (best !== null && hits === best.hits && hits > 0 && c.clientId !== best.c.clientId) {
      tie = true;
    }
  }
  return best !== null && !tie ? best.c : null;
}

/** All clients named in the text (for comparisons), in order of appearance. */
export function resolveClients(text: string, clients: ClientRef[]): ClientRef[] {
  const t = norm(text);
  const found: { c: ClientRef; at: number }[] = [];
  for (const c of clients) {
    const idAt = t.indexOf(c.clientId.toLowerCase());
    if (idAt >= 0) {
      found.push({ c, at: idAt });
      continue;
    }
    const tokens = norm(c.name)
      .split(/[\s-]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w));
    for (const w of tokens) {
      const at = new RegExp(`\\b${w}\\b`).exec(t)?.index ?? -1;
      if (at >= 0) {
        found.push({ c, at });
        break;
      }
    }
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .filter((f) => (seen.has(f.c.clientId) ? false : (seen.add(f.c.clientId), true)))
    .map((f) => f.c);
}

const SIGNAL_ALIASES: [RegExp, RegExp][] = [
  [/\bfed\b|\brates?\b|\bfomc\b|\bhold\b|\bhike/i, /fed|rate|hold|hike|treasury|yield/i],
  [
    /\boil\b|\bhormuz\b|\benergy\b|\bbrent\b|\btanker|\bblockade/i,
    /oil|hormuz|energy|brent|tanker|blockade|strait/i,
  ],
  [/\btech\b|\bcapex\b|\bnasdaq\b|\bsemis?\b|\bai\b/i, /tech|capex|megacap|semiconductor|nasdaq/i],
  [/\bvix\b|\bvolatility\b/i, /vix|volatility/i],
  [/\bchina\b|\bproperty\b|\bhong kong\b|\bhk\b/i, /china|property|hong kong/i],
  [/\btariff|\btrade war/i, /tariff|trade/i],
  [/\bdollar\b|\busd\b|\bfx\b|\byen\b|\bsgd\b/i, /dollar|usd|fx|yen|sgd|currency/i],
];

/** The signal the text refers to, by alias family then by title-word overlap. Newest wins ties. */
export function resolveSignal(text: string, signals: SignalRef[]): SignalRef | null {
  const sorted = [...signals].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const [ask, title] of SIGNAL_ALIASES) {
    if (ask.test(text)) {
      const hit = sorted.find((s) => title.test(s.title));
      if (hit) {
        return hit;
      }
    }
  }
  const words = new Set(
    norm(text)
      .split(' ')
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
  let best: { s: SignalRef; hits: number } | null = null;
  for (const s of sorted) {
    const hits = norm(s.title)
      .split(' ')
      .filter((w) => w.length >= 4 && words.has(w)).length;
    if (hits >= 2 && (best === null || hits > best.hits)) {
      best = { s, hits };
    }
  }
  return best?.s ?? null;
}

export function resolveScenario(text: string, scenarios: ScenarioRef[]): ScenarioRef | null {
  const t = norm(text);
  const byId = scenarios.find(
    (s) => t.includes(s.id.toLowerCase().replace(/-/g, ' ')) || t.includes(s.id.toLowerCase()),
  );
  if (byId) {
    return byId;
  }
  const words = new Set(t.split(' ').filter((w) => w.length >= 4 && !STOP.has(w)));
  let best: { s: ScenarioRef; hits: number } | null = null;
  for (const s of scenarios) {
    const hits = norm(s.name)
      .split(' ')
      .filter((w) => w.length >= 4 && words.has(w)).length;
    if (hits >= 1 && (best === null || hits > best.hits)) {
      best = { s, hits };
    }
  }
  return best?.s ?? null;
}

export const ALERT_KIND_WORDS: [RegExp, ClientAlert['kind']][] = [
  [/exclu|sustainab|esg/i, 'SUSTAINABILITY_EXCLUSION'],
  [/look-?through/i, 'LOOKTHROUGH_CONCENTRATION'],
  [/concentrat|single (name|position)|overweight/i, 'CONCENTRATION'],
  [/mandate|breach|band|drift/i, 'MANDATE_BREACH'],
  [/ltv|margin|collateral|lombard|headroom|trigger/i, 'MARGIN_CALL_PROXIMITY'],
  [/kyc|review due|documentation/i, 'KYC_DUE'],
  [/cash need|drawdown|funding|need(s)? (cash|money)/i, 'CASH_NEED_APPROACHING'],
  [/liquidity|shortfall|cover/i, 'LIQUIDITY_SHORTFALL'],
  [/stale|valuation|old mark/i, 'STALE_VALUATION'],
  [/unanswered|waiting for (a )?reply|message/i, 'UNANSWERED_CONTACT'],
];

export function alertKindFor(text: string): ClientAlert['kind'] | null {
  for (const [re, kind] of ALERT_KIND_WORDS) {
    if (re.test(text)) {
      return kind;
    }
  }
  return null;
}

export function laneFor(text: string): 'now' | 'week' | 'month' | null {
  if (/\b(act now|right now|today|urgent|immediately)\b/i.test(text)) {
    return 'now';
  }
  if (/\b(this week|next (7|seven) days|7 days)\b/i.test(text)) {
    return 'week';
  }
  if (/\b(this month|next (30|thirty) days|30 days)\b/i.test(text)) {
    return 'month';
  }
  return null;
}

/** "in 45 days", "45 days", "two months", "6 weeks" → days. */
export function daysFor(text: string): number | null {
  const m =
    /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(day|week|month)s?\b/i.exec(
      text,
    );
  if (!m) {
    return null;
  }
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    twelve: 12,
  };
  const n = /^\d+$/.test(m[1] ?? '') ? Number(m[1]) : (words[(m[1] ?? '').toLowerCase()] ?? 0);
  const unit = (m[2] ?? '').toLowerCase();
  return unit === 'day' ? n : unit === 'week' ? n * 7 : n * 30;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A date named in the text, relative to the clock: ISO, "tomorrow", "monday", "next week", "in 3 days". */
export function dateFor(text: string, clock: string): string | null {
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1];
  if (iso) {
    return iso;
  }
  const base = new Date(`${clock}T00:00:00Z`);
  const plus = (d: number): string =>
    new Date(base.getTime() + d * DAY_MS).toISOString().slice(0, 10);
  if (/\btomorrow\b/i.test(text)) {
    return plus(1);
  }
  if (/\bnext week\b/i.test(text)) {
    const dow = base.getUTCDay();
    return plus((8 - dow) % 7 || 7);
  }
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
  if (wd >= 0) {
    const dow = base.getUTCDay();
    const diff = (wd - dow + 7) % 7 || 7;
    return plus(diff);
  }
  const inDays = /\bin (\d{1,3}) days?\b/i.exec(text);
  if (inDays) {
    return plus(Number(inDays[1]));
  }
  const dm = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(text);
  if (dm) {
    const month = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ].indexOf((dm[2] ?? '').toLowerCase().slice(0, 3));
    const y = base.getUTCFullYear();
    const d = new Date(Date.UTC(y, month, Number(dm[1])));
    const out = d.toISOString().slice(0, 10);
    return out <= clock
      ? new Date(Date.UTC(y + 1, month, Number(dm[1]))).toISOString().slice(0, 10)
      : out;
  }
  return null;
}

/** The instrument or name the RM is talking about selling: the words after sell/trim/reduce/cut. */
export function instrumentPhrase(text: string): string | null {
  const m =
    /\b(?:sell(?:ing)?|trim(?:ming)?|reduc(?:e|ing)|cut(?:ting)?|exit(?:ing)?|dispos(?:e|ing) of)\s+(?:the |his |her |their |all (?:of )?)?(.+?)(?:\s+(?:clear|bring|get|take|fix|solve|help|reduce|would|will|do|does|to|by|and|,|\?|$))/i.exec(
      `${text} `,
    );
  const phrase = m?.[1]?.trim();
  return phrase && phrase.length >= 3 ? phrase : null;
}

/** A keyword the RM wants found in notes: the words after about/regarding/on/mention. */
export function keywordPhrase(text: string): string | null {
  const m =
    /\b(?:about|regarding|on|mention(?:ed)?|say about|said about)\s+(?:the |his |her |their )?([a-z0-9][a-z0-9 -]{2,40}?)(?:\?|$|\s+(?:in|last|during|before|after)\b)/i.exec(
      text,
    );
  return m?.[1]?.trim() ?? null;
}
