# ADR-014: Ingestion — messages, incremental apply, Kafka and batch front doors

Date: 2026-09-07 · Status: accepted · Assessment: `docs/data-platform-assessment.html`

## Context

The platform loaded one dataset folder by truncate-and-reload. New customers, new RMs and daily
snapshots arrive as changes, from Kafka in production and as files in development and tests.

## Decision

1. **One envelope, typed payloads.** `packages/contracts/src/messages.ts` defines `Envelope`
   (`type`, `key`, `eventTime`, `source`, `payload`) and a payload schema per message type. Payloads
   reuse the CSV row contracts, so a message is one row, typed; the cell schemas accept JSON scalars as
   well as CSV strings. `parseMessage` validates both at once.
2. **Landing zone, then apply.** Every message is written to `ingest.staging_messages` keyed by its
   idempotency key. New keys are applied; keys rejected earlier are revived and retried; keys already
   applied are duplicates and skipped. Each message is its own transaction so one bad row cannot
   poison a batch. Rejected messages keep a one-line error and appear in `ingest.dead_letters`.
3. **Upsert, append, close.** Reference entities upsert by natural key; snapshot messages append by
   `(id, snapshot_date)` and create the snapshot row when new; a primary assignment closes the previous
   primary the day before and updates the client's denormalised RM columns; offboarding closes
   assignments with `valid_to` rather than deleting history.
4. **Change log and load runs.** Each applied message writes `ingest.change_log` rows (client,
   entity, kind); each batch writes a `derived.load_runs` row with `mode = 'incremental'` and counts.
   After a batch that changed clients, the vector service is asked to rebuild.
5. **Two front doors, one apply.** `apps/ingest` consumes one Kafka topic in small batches and
   commits offsets after the apply returns; `npm run ingest:batch -- <dir>` applies `*.jsonl` files.
   Redpanda runs locally under the `kafka` compose profile; `npm run ingest:produce` publishes a folder.
   The full CSV seed remains the full-load path and shares the row mappers (`db/src/seed/mappers.ts`).

## Consequences

- Quality checks still run on full loads; incremental batches record rejections and counts. Scoping
  the thirteen checks to changed clients is the next step.
- The vector rebuild is book-wide per batch (fast at this size); a per-client build is the scale step.
- Partitioning by client id keeps a client's changes ordered; ordering across clients is not needed.
- A full load (the CSV seed) clears the landing zone and the change log: messages applied before it no
  longer describe the data, so they must be re-applied after a reseed (`npm run ingest:batch`).
