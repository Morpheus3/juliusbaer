# ADR-013: Companion, promise ledger and idea desk

Date: 2026-09-06 · Status: accepted · Design: `docs/rm-experience-design.html` §8–10

## Context

Iteration 9a gave the RM a drawer that answers questions. Three moments of the day still had no
support: the call itself, the follow-through after it, and finding which clients an idea fits.

## Decision

1. **Promise ledger** (`derived.promises`, migration 0010). A promise is a commitment with a party
   (RM or client), a kind (promise or decision debt), the verbatim sentence it came from, a source
   (note, call, manual, assistant) and an optional due date. Extraction from notes is deterministic
   (`domain/promises/extract.ts`): sentence split, commitment verbs, party from the subject, due date
   from the sentence. It is idempotent through a fingerprint of client and quote, and it runs every
   time a client's ledger is read. Overdue open promises add to the call plan's relationship-debt
   term through the policy's `promiseOverdueBonus` and cap. The ledger appears in journey chapter 5,
   in the strip as a count, and on Today for the book.
2. **Companion** (`CompanionPanel`, opened from the journey with `?call=1`). Cues go to the assistant
   with the client fixed, so the number, the rule, suitability and the sources arrive together. A
   guardrails block composes the cross-border reference file (`data/reference/cross_border_policy.json`
   → `derived.reference_docs`, keyed by residence, illustrative and replaceable), the stated profile
   and rubric, the not-permitted list, and sensitivities quoted from notes. The note drafts from cues
   the RM adds; promise candidates are previewed from the note as she types; ending the call writes a
   `CALL_LOGGED` audit event with note, cues and promises, adds the promises to the ledger, marks the
   call done on the sheet and optionally drafts the follow-up. Dictation uses the browser's speech
   recognition when present; nothing is recorded server-side.
3. **Idea desk** (`/ideas`, `IdeasService`). The trade-idea rules that run for one client in the risk
   room run for every client from one `BookService.perClient` pass, with the latest rubric scores.
   A query matches by the signal that motivated an idea or by words in its title and rationale; ideas
   that fail suitability are shown as blocked with the failed rule. Opportunities are rules with
   reasons: a dated cash need against thin coverage (lending), repeated breaches on an advisory
   portfolio (discretionary mandate), and notes quoted for succession, next generation and decision
   debt. Uptake counts drafts and sent messages whose context names a signal. Drafting for a client
   uses the existing outreach draft endpoint, one per client, reviewed before it goes anywhere.
4. **The drawer learns two tools**: `promises` ("what did I promise Lau", "all open promises") and
   `ideas` ("which clients fit short-duration credit after the Fed hold").

## Consequences

- Extraction is honest but modest: it finds sentences with commitment verbs and quotes them; the RM
  adds what it misses, and a language model may propose more candidates later without paraphrasing.
- The cross-border file is illustrative and clearly labelled; compliance owns its contents.
- Reading a client's ledger writes new extractions; this is intentional and idempotent.
