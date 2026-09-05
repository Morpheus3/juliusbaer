# ADR-003: Customer vector and factual record

**Status:** Accepted · 2026-09-05

## Context

The rubric (Capacity, Appetite, Horizon) and the confidence score need a machine-readable
description of each client that is computed, not asserted. Trading activity in the dataset is
sparse (one Buy, six structured-product subscriptions, four withdrawals), so behaviour has to
be inferred mainly from how positions changed between the five snapshots.

## Decision

- **Two artefacts per client**, both written by the Python analytics service and stored in the
  `derived` schema: a **factual record** (`client_factual.facts`, JSON) that normalises the
  client file and attaches portfolios, facilities, commitments, cash needs and contact history;
  and a **behavioural vector** (`client_vectors.features`, 32 named features in manifest
  order) with book percentiles, per-feature evidence references, nearest peers and a note
  embedding.
- **Household level.** Features aggregate across all of a client's portfolios, including
  custody accounts, because a risk that is invisible per portfolio is often obvious combined.
  Mandate drift is the exception: custody accounts are excluded because no mandate applies.
- **Implied trades.** Position changes between consecutive snapshots (quantity delta × price ×
  FX) drive turnover and the stress-behaviour features. The two stress windows are
  27 Feb → 31 Mar (conflict, Hormuz) and 31 Mar → 30 Jun (technology drawdown). Redemption
  requests on gated funds are not yet counted as risk reduction; iteration 4 revisits this.
- **Every feature declares its rubric dimension and what a higher value means.** The manifest
  is stored with each run so the UI and the LLM assessor read the same definitions.
- **Source-of-wealth overlap** uses a keyword table mapping the free-text source of wealth to a
  holding sector. It is a heuristic and is labelled as such in the evidence.
- **Note embedding** is a TF-IDF vector over each client's notes, padded to 256 dimensions,
  stored in pgvector. It is deterministic and offline; a model-backed embedding can replace it
  without changing the storage shape.
- **Percentiles** rank among clients with a non-null value; features that do not apply (LTV for
  a client with no facility) stay null and are shown as "not applicable".
- **Nearest peers** are the three closest clients by Euclidean distance over z-scored features,
  excluding pure context features (age, stated score, YTD change). Each peer lists the three
  features on which it differs most.
- A build **replaces the previous run** (one `vector_runs` row; rows cascade), so the workbench
  always shows one consistent vector per client.

## Consequences

- The vector explorer (L3) can show every number with its formula inputs.
- The rubric assessors in iteration 4 consume the vector and manifest; no new data plumbing.
- Percentiles are relative to a book of 20, so they say "unusual for this RM's book", not
  "unusual for the bank".
