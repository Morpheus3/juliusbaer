# Dataset contract

The workbench is built to be dropped onto any book of clients that provides the files below. Nothing
about a specific client, date, event, instrument or relationship manager is written into the code:
snapshot dates are discovered from the holdings, "today" defaults to the latest snapshot, the RM
shown in the shell is the one covering the loaded clients, and every world-specific judgement lives in
optional reference files next to the data.

Point the loader at a directory with `DATA_DIR=/path/to/data npm run db:seed` (default `./data`).

## Required files

| File                     | Grain                         | Required columns                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clients.csv`            | one per client                | `client_id, client_name, age, gender, nationality, country_of_residence, tax_domicile, booking_centre, rm_id, rm_name, rm_desk, base_currency, wealth_band, total_aum_usd, life_stage, source_of_wealth, risk_profile, risk_tolerance_score, investment_horizon_years, liquidity_needs, objectives, client_since, kyc_review_due, pep_status, reporting_language`                                                |
| `portfolios.csv`         | one per portfolio             | `portfolio_id, client_id, portfolio_name, mandate_code, mandate_name, service_model, base_currency, inception_date, benchmark, aum_usd_current` plus one `aum_<YYYY-MM-DD>` column per snapshot                                                                                                                                                                                                                  |
| `holdings.csv`           | one per position per snapshot | `snapshot_date, portfolio_id, client_id, instrument_id, instrument_name, asset_class, sub_asset_class, sector, region, instrument_ccy, quantity, price_local, market_value_local, portfolio_ccy, market_value_base, market_value_usd, weight_pct, avg_cost_local, cost_basis_base, unrealised_pnl_base, unrealised_pnl_pct, lending_value_base, advance_rate_pct, liquidity_tier, valuation_date, acquired_date` |
| `instruments.csv`        | one per instrument            | `instrument_id, instrument_name, asset_class, sub_asset_class, sector, region, currency, liquidity_tier, underlying_reference, sustainability_excluded, concentration_limit_applies` plus `price_<YYYY-MM-DD>` per snapshot                                                                                                                                                                                      |
| `mandates.csv`           | one per mandate × asset class | `mandate_code, mandate_name, asset_class, min_pct, target_pct, max_pct, max_single_position_pct, mandate_notes`                                                                                                                                                                                                                                                                                                  |
| `transactions.csv`       | one per transaction           | `transaction_id, trade_date, settlement_date, portfolio_id, client_id, transaction_type, instrument_id, instrument_name, quantity, price_local, currency, amount, narrative`                                                                                                                                                                                                                                     |
| `credit_facilities.csv`  | one per facility              | `facility_id, client_id, collateral_portfolio_id, facility_type, facility_ccy, credit_limit, interest_rate_pct, margin_call_ltv_pct, utilisation_pct_current` plus `drawn_`, `collateral_market_value_`, `lending_value_`, `ltv_pct_`, `headroom_` columns per snapshot                                                                                                                                          |
| `commitments.csv`        | one per commitment            | `commitment_id, client_id, portfolio_id, fund_name, currency, committed, called_to_date, uncalled, expected_call_window`                                                                                                                                                                                                                                                                                         |
| `planned_cash_needs.csv` | one per need                  | `need_id, client_id, description, currency, amount, due_from, due_to, recurrence, certainty`                                                                                                                                                                                                                                                                                                                     |
| `market_context.csv`     | one per series per snapshot   | `snapshot_date, series_id, series_name, category, unit, value` and optionally `snapshot_label`                                                                                                                                                                                                                                                                                                                   |
| `event_log.csv`          | one per event                 | `event_date, event_type, region, description, primary_transmission, severity`                                                                                                                                                                                                                                                                                                                                    |
| `rm_notes.json`          | array of notes                | `note_id, client_id, note_date, rm_id, rm_name, channel, note`                                                                                                                                                                                                                                                                                                                                                   |

Rules the loader enforces: every wide `<prefix>_<date>` column must exist for every snapshot date
found in `holdings.csv`; identifiers must resolve; asset classes are one of `Cash and Equivalents`,
`Fixed Income`, `Equity`, `Alternatives`, `Commodities`, `Structured Products`; liquidity tiers are
`Daily`, `Weekly`, `Monthly`, `Quarterly Gate`, `Illiquid`; event severity is `Low`, `Medium`, `High`
or `Severe`. Events receive stable ids `EV-001…` in file order.

## Vocabulary the engines read

These are column _values_ the engines interpret. They are data, not code, but a new dataset should
use them (or extend the mapping tables named below).

- **FX**: `market_context.series_id` pairs named `USDXXX` (XXX per USD) or `EURUSD`/`GBPUSD` (USD per unit). Any currency used by a holding needs a pair at every snapshot.
- **Exclusion-bound mandates**: any mandate whose `mandate_notes` mention "exclusion" is checked against `instruments.sustainability_excluded`.
- **Cash needs**: `certainty` values `Confirmed` and `Likely` are treated as firm; `recurrence` containing "annual" or equal to `One-off` counts in full inside 12 months, anything else is pro-rated.
- **Income and flows**: transaction types `Dividend, Coupon, Interest, Distribution` are income; `Management Fee, Interest Charge` are fees; `Withdrawal` is a withdrawal.
- **Stress windows** (behavioural vector): snapshot intervals where the median series in a `market_context.category` containing "equity" fell more than 2%, a category containing "volatil" rose more than 5 points, or the event log holds a Severe Market or Geopolitical event.
- **Impact pricing**: fixed-income duration by `sub_asset_class` and by `due YYYY` in the instrument name; equity region keys by `region`; sectors `Gold`, `Energy`, `Information Technology`, `Real Estate`, `Financials`, `Industrials` are used by scenario overlays. Tables live in `services/analytics/app/impact/models.py`.
- **Source-of-wealth overlap**: keyword table in `services/analytics/app/features/behavioural.py` maps free text to a holding sector.

## Optional reference files (`<data dir>/reference/`)

| File                | Purpose                                                                                                                                                                       | If absent                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `lookthrough.json`  | Structured-product legs (`instrumentId, leg, weight, exposureName, sector, region, matchedInstrumentId, note`) and `issuers` grouping direct holdings under one exposure name | Exposure uses direct classification only; no look-through concentration alerts            |
| `signal_rules.json` | Per-event `match` rules and base `shock`; `derived.series` thresholds, match rules and shock templates for market-context series                                              | Events appear as signals with no mapped holdings and no implied shock; no derived signals |
| `scenarios.json`    | Named stress scenarios (`id, name, description, shock, horizonDays, probabilityNote`)                                                                                         | Impact analysis runs on selected signals only                                             |

Every entry in these files is a stated judgement about the dataset's world and is shown to the RM in
the evidence drawer, the assumptions panel or the leg table.

## Environment

| Variable            | Default          | Meaning                                                 |
| ------------------- | ---------------- | ------------------------------------------------------- |
| `DATA_DIR`          | `./data`         | Directory holding the files above                       |
| `DATASET_TODAY`     | latest snapshot  | Overrides the dataset's "today"                         |
| `DATASET_NAME`      | `Loaded dataset` | Shown in the shell                                      |
| `ANTHROPIC_API_KEY` | unset            | Enables the live LLM assessor; unset runs recorded mode |

## Messages (incremental ingestion)

Changes arrive as messages, from Kafka or from `*.jsonl` files, with one envelope:

```json
{
  "type": "rm.assignment.v1",
  "key": "core:assign:1001",
  "eventTime": "2026-09-01T02:00:00Z",
  "source": "core-banking",
  "payload": { "clientId": "…", "rmId": "…", "role": "primary", "validFrom": "2026-09-01" }
}
```

`type` selects the payload schema (`packages/contracts/src/messages.ts`); row-shaped payloads
(`client.upsert.v1`, `transaction.v1`, `note.v1`, …) are the CSV row contracts and accept JSON
numbers and booleans. `key` is the source system's identity for the change and makes the apply
idempotent. Snapshot messages (`holdings.snapshot.v1`, `prices.snapshot.v1`, `facility_snapshot.v1`,
`market_context.snapshot.v1`) create the snapshot date when it is new. `rm.assignment.v1` with role
`primary` closes the previous primary and updates the client's RM columns. Sample messages:
`data/messages/sample`.
