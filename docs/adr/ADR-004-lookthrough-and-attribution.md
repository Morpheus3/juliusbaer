# ADR-004: Look-through exposure, change attribution and data-derived alerts

**Status:** Accepted · 2026-09-05

## Context

The challenge brief names three things a good solution must do that a position report cannot:
see concentration that only appears once structured products are resolved to their underlyings
and portfolios are combined; explain what happened between snapshots; and surface risks before
the client asks. All three must be defensible in front of a client, so none of them may depend
on a language model.

## Decision

### Look-through

- A reference table `derived.lookthrough_legs` (seeded from `db/src/seed/reference/lookthrough.json`)
  decomposes each structured product into legs with an economic weight, a sector, a region and,
  where the universe contains it, the matched direct instrument. `derived.issuer_groups` maps
  direct holdings that share an issuer (Golden Harbour shares and Golden Harbour perpetuals) to
  one exposure name.
- Worst-of baskets are split equally across legs. The worst performer drives the payoff and is
  not knowable in advance; equal weights are a stated simplification, shown in the UI.
- Capital-protected notes count at their participation rate; the rest stays as issuer credit.
- Exposure is aggregated across every portfolio including custody. The limit applied to a name
  is the single-position limit of the largest managed portfolio that holds it.

### Change attribution

For each position matched by portfolio and instrument between two snapshots:

- flow = (q₁ − q₀) × p₁ × fx₁
- price = q₀ × (p₁ − p₀) × fx₀
- fx = q₀ × p₁ × (fx₁ − fx₀)

The three sum exactly to the change in USD market value; any residual from rounding in the
source file is folded into the price effect so the identity holds. New positions are pure flow;
closed positions are negative flow at the end price. Event attribution (which event moved which
line) is layered on top of this in iteration 3 using the transmission channels in the event log.

### Alerts from data

`apps/api/src/domain/alerts.ts` derives ten alert kinds with severity and evidence: margin-call
proximity, mandate breach, single-line concentration, look-through concentration, sustainability
exclusion, KYC due, approaching cash need, liquidity shortfall, stale valuation, unanswered
client contact. They are computed on request and feed the Client 360 banner today; in iteration 3
they become the evidence layer beneath signal-driven insights, and in iteration 5 the inputs to
ranked actions.

## Consequences

- The first concrete "hidden risk" is visible without any model: Zhang Meiling holds Helios Cloud
  Systems at 15.4% directly and 22.5% once her equity-linked note is looked through, against a
  15% limit. Lau Chi Ming's Golden Harbour exposure is 29.5% of the household across shares,
  perpetual and accumulator.
- Every alert carries the rows that produced it, so the explainability object in iteration 4 can
  cite them by id.
- Equal-weight basket treatment can understate exposure to the weakest leg; the assumptions
  panel says so and the leg table shows the full basket.
