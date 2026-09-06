/**
 * Promise extraction from RM notes and call text. Deterministic: sentence split, commitment
 * verbs, party from the grammatical subject, a due date when the sentence names one. Every
 * candidate carries the sentence it came from, verbatim. A language model may add candidates
 * later; it may not paraphrase the quote.
 */
import type { PromiseCandidate } from '@jb/contracts';

const RM_SUBJECT = /\b(i|we|rm|the rm|priscilla|our team|the bank|the desk)\b/i;
const CLIENT_SUBJECT =
  /\b(he|she|they|client|the client|mr|mrs|ms|madam|the family|his wife|her husband)\b/i;

const RM_VERBS =
  /\b(will|would|to)\s+(send|share|prepare|circulate|revert|follow up|follow-up|come back|arrange|set up|schedule|book|provide|draft|put together|organise|organize|check|confirm|look into|review|table|present|bring)\b|\b(agreed|promised|offered|undertook)\s+to\s+(send|share|prepare|circulate|revert|follow up|arrange|set up|schedule|book|provide|draft|put together|organise|organize|check|confirm|look into|review|present)\b|\b(rm|i|we)\s+to\s+(send|share|prepare|revert|follow up|arrange|schedule|book|provide|draft|check|confirm|present)\b/i;
const CLIENT_VERBS =
  /\b(will|would|agreed to|committed to|plans? to|intends? to|is going to|are going to|expects? to|wants? to|asked (?:us|me) to|has asked for|would like)\s+/i;
const CLIENT_COMMIT_WORDS =
  /\b(top up|top-up|transfer|fund|sign|send|provide|revert|confirm|decide|come back|let (?:us|me) know|call back|review|consider|instruct|execute|proceed|subscribe|invest|deposit|repay|reduce|sell|buy|move)\b/i;
const DECISION_DEBT =
  /\b(agreed|approved|accepted|signed off)\b[^.]*\b(has not|hasn't|have not|haven't|not yet|but (?:has|have) not|still (?:has|have) not|never)\s+(executed|proceeded|acted|instructed|signed|funded|implemented|followed through|done so)\b|\bnot executed\b|\bhas not executed\b|\bdeferred (?:the )?decision\b|\bstill (?:has not|hasn't) (?:executed|decided|signed)\b|\bagreed .* (?:in principle|again) .* but\b/i;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_MS = 86_400_000;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A due date named in a sentence, relative to the note date. Approximate by design: first day of a month or quarter, mid-year for "mid-YYYY". */
export function dueDateIn(sentence: string, noteDate: string): string | null {
  const s = sentence.toLowerCase();
  const base = new Date(`${noteDate}T00:00:00Z`);
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(s)?.[1];
  if (iso) {
    return iso;
  }
  const plus = (d: number): string =>
    new Date(base.getTime() + d * DAY_MS).toISOString().slice(0, 10);
  const fmt = (y: number, m: number, d: number): string =>
    new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  const year = base.getUTCFullYear();

  const mid = /\bmid[- ](\d{4})\b/.exec(s);
  if (mid) {
    return fmt(Number(mid[1]), 5, 30);
  }
  const early = /\b(early|beginning of)\s+(\d{4})\b/.exec(s);
  if (early) {
    return fmt(Number(early[2]), 1, 28);
  }
  const late = /\b(late|end of|by the end of)\s+(\d{4})\b/.exec(s);
  if (late) {
    return fmt(Number(late[2]), 11, 31);
  }
  const q = /\bq([1-4])\s*(\d{4})\b/.exec(s);
  if (q) {
    return fmt(Number(q[2]), (Number(q[1]) - 1) * 3, 1);
  }
  const dm =
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(\d{4}))?\b/.exec(
      s,
    );
  if (dm) {
    const m = MONTHS.findIndex((x) => x.startsWith(dm[2] ?? ''));
    const y = dm[3] ? Number(dm[3]) : year;
    const out = fmt(y, m, Number(dm[1]));
    return out < noteDate && !dm[3] ? fmt(y + 1, m, Number(dm[1])) : out;
  }
  const my = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b/.exec(s);
  if (my) {
    return fmt(
      Number(my[2]),
      MONTHS.findIndex((x) => x.startsWith(my[1] ?? '')),
      1,
    );
  }
  const monthOnly =
    /\b(?:by|in|before|until|for)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(
      s,
    );
  if (monthOnly) {
    const m = MONTHS.findIndex((x) => x.startsWith(monthOnly[1] ?? ''));
    const out = fmt(year, m, 1);
    return out < noteDate ? fmt(year + 1, m, 1) : out;
  }
  if (/\btomorrow\b/.test(s)) {
    return plus(1);
  }
  if (/\bnext week\b/.test(s)) {
    return plus(7);
  }
  if (/\bnext month\b/.test(s)) {
    return plus(30);
  }
  if (/\bthis week\b|\bby friday\b|\bend of (the )?week\b/.test(s)) {
    const dow = base.getUTCDay();
    return plus((5 - dow + 7) % 7 || 7);
  }
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b(?:by|on|before|until)\\s+${w}\\b`).test(s));
  if (wd >= 0) {
    const diff = (wd - base.getUTCDay() + 7) % 7 || 7;
    return plus(diff);
  }
  const inDays = /\bin (\d{1,3}) days?\b/.exec(s);
  if (inDays) {
    return plus(Number(inDays[1]));
  }
  const inWeeks = /\bin (\d{1,2}|two|three) weeks?\b/.exec(s);
  if (inWeeks) {
    const n = inWeeks[1] === 'two' ? 2 : inWeeks[1] === 'three' ? 3 : Number(inWeeks[1]);
    return plus(7 * n);
  }
  return null;
}

/** Candidates from one note or call text. Sentences are the unit; each is quoted whole. */
export function extractPromises(text: string, noteDate: string): PromiseCandidate[] {
  const out: PromiseCandidate[] = [];
  for (const sentence of splitSentences(text)) {
    const due = dueDateIn(sentence, noteDate);
    if (DECISION_DEBT.test(sentence)) {
      out.push({
        party: 'client',
        kind: 'decision-debt',
        text: clean(sentence),
        quote: sentence,
        dueDate: due,
      });
      continue;
    }
    const rmVerb = RM_VERBS.test(sentence);
    const clientVerb = CLIENT_VERBS.test(sentence) && CLIENT_COMMIT_WORDS.test(sentence);
    if (!rmVerb && !clientVerb) {
      continue;
    }
    const subjectRm = RM_SUBJECT.test(
      sentence.split(/\b(will|would|agreed|promised|to)\b/i)[0] ?? '',
    );
    const subjectClient = CLIENT_SUBJECT.test(
      sentence.split(/\b(will|would|agreed|committed|plans?|intends?|expects?|wants?)\b/i)[0] ?? '',
    );
    const party: PromiseCandidate['party'] =
      rmVerb &&
      (subjectRm ||
        /^\s*(rm|i|we)\b/i.test(sentence) ||
        /\b(send|share|prepare|revert|circulate)\s+(him|her|them|the client)\b/i.test(sentence))
        ? 'rm'
        : clientVerb || subjectClient
          ? 'client'
          : 'rm';
    out.push({ party, kind: 'promise', text: clean(sentence), quote: sentence, dueDate: due });
  }
  return dedupe(out);
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[“”"]/g, '').trim().replace(/\.$/, '');
}

function dedupe(xs: PromiseCandidate[]): PromiseCandidate[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.quote) ? false : (seen.add(x.quote), true)));
}
