# ADR-009: Book cockpit, horizon lanes and the mandate and collateral board

**Status:** Accepted · 2026-09-05

## Context

Twenty clients, one RM. The brief asks the workbench to show what she must act on immediately versus
in the next week and month, based on trend analysis of the past, and to surface mandate and
collateral governance across the whole book.

## Decision

### Horizon lanes

- Every client's alerts are derived at the clock date and each is assigned a lane (Now, next 7
  days, next 30 days) by a rule that uses its deadline and its trend across snapshots: margin-call
  headroom under two points or falling; KYC overdue, within 14 or within 45 days; cash needs
  starting within 30 or 90 days; mandate breaches that widened by more than a point since the last
  snapshot move up a lane; exclusion breaches are always a week item; an unanswered client message
  is always Now. The most exposed high or severe signal of the last 30 days becomes a conversation
  item, Now when severe and reaching 20% of the household.
- **Momentum** is computed by running the same assignment with the clock set to the previous
  snapshot: an item is new, escalated, unchanged or eased. Item ids are deterministic hashes of
  client and alert id so the two runs line up.
- **Client urgency** = Σ lane weight (3/2/1) × severity weight (3/2/1) + 1 per new or escalated
  item; ties break by AUM. This is the "who to call first" ranking.
- No language model and no impact run is involved: the cockpit must render for the whole book in
  one request, and every card links to the screen where its numbers live.

### Mandate and collateral board

- One row per portfolio, one cell per asset class with weight, band, status and a trend arrow
  versus the previous snapshot (worsening or improving by more than half a point).
- **Breach type** is read from the RM notes: "waiver" marks waived; wording that records a client
  instruction or confirmation marks client-directed; otherwise drift. The matching note is shown.
- **Collateral** lists every facility tightest-first with its LTV path, the trigger, and whether it
  breached at an earlier snapshot and was cured by repayment (drawn fell) or by the market (drawn
  unchanged, LTV fell).

## Consequences

- The cockpit answers the Monday-morning question from data alone and explains each placement in
  one sentence; the method is listed on the page.
- Breach-type detection depends on note wording and is labelled as such; a false "client-directed"
  is possible and the note is shown so the RM can judge.
- Lane thresholds (2 and 5 points of headroom, 14 and 45 days, 30 and 90 days, 1 point of drift)
  are product judgements held in one module, `apps/api/src/domain/book/horizon.ts`.
