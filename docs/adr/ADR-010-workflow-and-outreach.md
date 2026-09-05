# ADR-010: Workflow, maker-checker, outreach and audit

**Status:** Accepted · 2026-09-05

## Context

Slide 08 of the wireframes describes the end-to-end RM workflow: nine steps from selecting the
customer to logging the decision, alert triage, a recommendation review with suitability, compliance
pre-clearance, explainability and maker-checker, a client outreach preview, and guardrails. Nothing
may execute automatically.

## Decision

- **Steps are derived, not tracked.** Each of the nine steps reads its status from artefacts that
  already exist: triage records, saved impact runs or modelled signal risk, a rubric assessment,
  approved actions, outreach drafts and sends. The first step not done is "current". No separate
  workflow state machine to keep in sync.
- **Alert triage** records the RM's decision per data-derived alert (triaged into review, or
  dismissed with a reason). Dismissed alerts leave the Client 360 banner and the book cockpit lanes;
  the record and the audit event remain.
- **Recommendation review** applies six checks to an approved action: suitability (from the action),
  compliance pre-clearance (KYC current, no PEP flag), explainability (evidence attached),
  maker-checker, permissions and the suitability record (locked rubric). Collateral, rebalancing and
  liquidity actions require RM-Level-2 and a second RM; the signed-in level and the checker id come
  from configuration (`RM_LEVEL`, `CHECKER_ID`). "Approve and proceed" clears only when every check
  is green.
- **Outreach** is drafted through the Claude gateway in the client's reporting language from the
  approved actions, the signals behind them and the modelled impact, with the prompt forbidding
  invented numbers and events outside the supplied log. When the gateway is unavailable a labelled
  English template is produced with the same facts and a caveat to redraft. The RM edits, then
  "send and log" records the decision and text; no message leaves the system.
- **Audit trail** is the append-only `derived.audit_events` table, now shown as the first tab of the
  audit screen with filters by kind and client.

## Consequences

- The workflow page is a view over existing records, so it stays consistent with every other
  screen without synchronisation code.
- Triage, checker approvals, drafts and sends each add an audit event with actor and timestamp.
- On this machine the outreach draft is the template until an API key is added; the UI says so and
  the trace records why.
