# ADR-007: Dataset agnosticism

**Status:** Accepted · 2026-09-05

## Context

The first four iterations were built against one dataset and, in places, assumed its shape: five
named snapshot dates, a "today" of 26 August 2026, a covering RM, default client ids, a sustainable
mandate code, dataset-specific stress windows, named 2026 scenarios in code, and series-specific
rules for derived signals. The product must accept another book of clients without code changes.

## Decision

- **Snapshots are discovered**, not declared. The loader reads distinct `snapshot_date` values from
  holdings, labels them from `market_context.snapshot_label` when present, and unpivots every wide
  `<prefix>_<date>` column it finds. `SnapshotDate` is a plain ISO string everywhere.
- **"Today" defaults to the latest snapshot**; `DATASET_TODAY` overrides it. The replay clock range
  is the snapshot span.
- **A `DatasetContext`** in the API serves `/api/v1/meta`: snapshots, today, baseline, current, the
  RM covering the most clients, client count, default client and which reference files are loaded.
  Services take the context; nothing hard-codes a date, an id or a name. The web app reads the same
  meta for its shell, clock, snapshot pickers and default routes.
- **World-specific judgement lives in optional reference files beside the data**
  (`data/reference/lookthrough.json`, `signal_rules.json`, `scenarios.json`), loaded into
  `derived.*` tables at seed time and treated as absent-but-fine when missing. Derived-signal rules
  are data too: series id, unit, threshold, match rules and a shock template applied as
  `path = move × factor`.
- **Behaviour is inferred from the data's own structure**: stress windows are intervals where
  equity indices fell, volatility rose, or the event log records a Severe market or geopolitical event; the
  "leverage change" feature compares the current snapshot with two snapshots earlier; income is
  annualised from the first transaction date; exclusion-bound mandates are recognised from their
  notes.
- **The contract is documented** in `docs/DATASET_CONTRACT.md`, including the column vocabulary the
  engines interpret and where each mapping table lives.

## Consequences

- Swapping the dataset is `DATA_DIR=... npm run db:seed` followed by the vector build.
- Some judgement tables remain in code because they are about finance, not about this dataset:
  duration defaults by fixed-income sub-asset class, equity betas, region-to-key mapping, the
  source-of-wealth keyword table. They are named in the contract so a new dataset can extend them.
- The June 2026 technology drawdown is invisible at snapshot granularity: month-end indices were up
  and the event is graded High, not Severe, so that interval is not a stress window. The RM notes
  carry that story instead, which is where the LLM assessor reads it.
