# ADR-005: Signal engine, replay clock and impact engine

**Status:** Accepted · 2026-09-05

## Context

The wireframes show a live signal feed with an evidence drawer and a stress waterfall. The
dataset is static, and the brief forbids letting a language model free-associate about 2026.
Signals therefore have to come from the controlled event log and the market table, the feed has
to be made "live" honestly, and every impact number has to be reproducible.

## Decision

### Signals

- **Two kinds.** _Event_ signals are the 16 rows of `event_log.csv`, one signal each, severity
  taken from the file. _Derived_ signals are moves in `market_context.csv` between consecutive
  snapshots that exceed a per-series threshold; their source reliability is set lower (85) because
  the move is inferred from two points rather than observed.
- **Transmission rules.** `db/src/seed/reference/signal_rules.json` gives each event a list of
  match rules over instrument attributes (sector, sub-asset class, asset class, region, currency,
  liquidity tier, exposure name, has-facility) and a base-case factor shock. Rules are loaded into
  `derived.signal_rules` at seed time; the seed fails if any event lacks a rule. The evidence
  drawer shows which rule matched each holding, including matches through look-through legs.
- **Confidence** = 0.35 × data freshness + 0.40 × source reliability + 0.25 × model confidence,
  each stated with a reason. Freshness decays with the signal's age at the clock date.
- **Client view.** With a client selected, each signal lists the holdings it reaches, the USD and
  household percentage exposed, and a one-sentence "why it matters" built from those numbers.

### Replay clock

- A dataset date held in the web app's clock store (31 Dec 2025 → 26 Aug 2026), with play,
  pause, speed and scrub. The API accepts `clock=` and returns only signals dated on or before it,
  computes ages against it, and uses the latest snapshot on or before it for positions. A
  stale-data warning appears when the snapshot is more than 30 dataset days older than the clock.
- This gives a live-feeling feed without inventing data, and lets the RM replay "what did this
  client look like in March".

### Impact engine (Python)

- Input: client, snapshot, a combined factor shock (`Shock` in `packages/contracts`, mirrored by
  `app/impact/shock.py`). Shocks from selected signals and an optional named scenario are summed,
  then scaled by severity (mild 0.5, base 1, severe 2).
- Models per asset class are simple and stated on screen: duration × yield shift (duration from
  maturity in the name or a sub-asset-class default) plus spread duration × spread shock;
  beta-adjusted regional equity move plus sector overlay (single names β 1.2); structured
  products priced through their look-through legs with payoff-specific multipliers; gold and
  Brent for commodities; private marks not revalued and reported as unmodelled; FX applied
  multiplicatively to every non-USD position.
- Outputs: per-holding lines by factor, totals by factor and asset class, post-shock lending
  value and LTV per facility with the shortfall to cure, post-shock 12-month liquidity coverage,
  modelled coverage of AUM, a confidence point and band that widen with unmodelled share and
  severity, and the assumption list.
- Five named scenarios live in `app/impact/scenarios.py`: Strait of Hormuz reopens, escalation,
  Fed hikes, technology drawdown repeats, Hong Kong property leg down. Runs can be saved to
  `derived.impact_runs` with the request that produced them.

## Consequences

- The feed, the drawer and the waterfall are all reproducible from files in the repository; a
  reviewer can trace any number to a rule and a formula.
- The "Strait reopens" question Al-Mansoori asked on 12 Aug has an answer with stated assumptions.
- Equal treatment of worst-of legs and parallel yield shifts are known simplifications; the
  assumptions panel says so and the confidence band reflects unmodelled assets.
