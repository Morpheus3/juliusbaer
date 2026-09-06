# ADR-011: Client journey, client context and the call plan

Date: 2026-09-06 · Status: accepted · Design: `docs/rm-experience-design.html` (the RM Spine, v0.3)

## Context

Iterations 0–7 produced fourteen module screens. Preparing one client call meant opening five or
six of them and re-selecting the client on each. The cockpit ranked items, not conversations, and
said nothing about when a call had to happen or at what hour. The design work for iteration 8 asked
for one corridor through the rooms, a persistent client context, and a deterministic answer to
"whom do I call, and when".

## Decision

1. **The URL is the client context.** `/clients/:id/...` is the source of truth; a small store
   remembers the last client so the rail, the strip, the switcher and later the drawer stay on her.
   The context strip under the top bar shows who, where they stand (matrix cell, book rank, top open
   item, the call plan's line) and the next workflow step. Command-K switches client and keeps the
   room. Page-level client pickers and default-client redirects in the rail are removed.
2. **The journey is the client's front door.** `/clients/:id` renders five chapters read top to
   bottom: where they stand, what happened, what could happen, what to do, what I decided. Chapters
   compose the existing endpoints; Client 360 becomes chapter 1. Chapter openers are sentences built
   from computed facts naming their sources. They are templates; a language model may rewrite them
   later but never add a fact. Chapter 3 shows one named scenario chosen by a deterministic,
   explained rule (`pickScenario`). Decisions (approve, reject) are inline.
3. **The call plan is a deterministic, explained ranking.** Priority = Σ over open items of
   harm × clock × damper, plus convergence, plus relationship debt. Harm is the cockpit urgency, so
   the lanes and the sheet never disagree on direction. Clock uses dated deadlines (KYC, cash needs
   less a lead time, projected collateral breach from the headroom trend, a freshness window for
   severe signals) and treats the lane as a deadline too (a Now item is due today). Due-by, slot
   (first three hours where the client's business day overlaps the RM's), channel and language are
   derived per client; calls are packed into daily capacity by due-by then priority; overflow spills
   visibly to the next business day. Defer and done are append-only audit events.
4. **Judgement lives in reference data.** Weights, cadences, lead times, capacity, hours, theme
   keywords and the residence-to-timezone table are `data/reference/call_policy.json`, loaded into
   `derived.call_policy` at seed. A dataset without the file gets the defaults in the `CallPolicy`
   contract and the response says so.
5. **Today replaces the cockpit as the landing page**: a four-sentence brief composed from the
   book, the signals and the call plan; the call sheet; the lanes, whose cards open the journey at
   the relevant chapter; recently decided.

## Consequences

- One more per-client computation on the book (`BookService.perClient`) is shared by the cockpit
  and the call plan; the N+1 bundle loading noted in the review still applies and remains open.
- The strip composes client-side from the same queries the rooms use, so it is free on pages that
  already load them; a light `/context` endpoint would replace this if the strip grows.
- Relationship debt's promise term is zero until the promise ledger exists (iteration 9).
- Nothing dials, sends or books. The plan proposes; the RM acts.
