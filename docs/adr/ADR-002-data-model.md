# ADR-002: Raw and derived schemas

**Status:** Accepted · 2026-09-05

## Context

Every insight must be traceable to the source rows that produced it. The dataset arrives as
twelve files with wide snapshot columns (`aum_2026-02-27`, `price_2026-06-30`, ...).

## Decision

- **`raw` schema** mirrors the source files one-to-one, with wide snapshot columns unpivoted into
  long tables (`portfolio_aum`, `instrument_prices`, `credit_facility_snapshots`) and a
  `snapshots` dimension carrying the five dates and their labels. Event-log rows receive stable
  ids `EV-001..EV-016` in file order so explanations can cite them.
- **`derived` schema** holds everything the loader and engines write: `load_runs`,
  `data_quality_issues` now; vectors, rubric scores, signals, insights, actions and the audit
  log in later iterations.
- The loader is **idempotent**: it truncates `raw.*`, reloads, runs the quality checks, and keeps
  only the latest successful `load_runs` row (issues cascade with it).
- Monetary values are `numeric(20,4)` read as JavaScript numbers; percentages `numeric(10,4)`.
  Bond quantities keep the dataset convention of units of 100 nominal.

## Consequences

- Figures in the UI can link to `raw` rows by natural key (portfolio, snapshot, instrument).
- The data-quality register is rebuilt on every load, so a fix in the source data clears the
  finding without manual intervention.
- Custody portfolios are loaded like any other but flagged `CUSTODY_OUTSIDE_MANDATE`; mandate
  checks in later iterations must exclude them while exposure aggregation must include them.
