# ADR-006: Risk rubric assessors, confidence score and the Claude gateway

**Status:** Accepted · 2026-09-05

## Context

The rubric (Risk Capacity, Risk Appetite, Investment Horizon, each 1–3) is the client-level
judgement everything downstream depends on. The brief asks for Claude to do the analysis, for
predictive Python code to validate it, and for a confidence score the RM can see. Twenty clients
cannot train a supervised model on real labels, and no Anthropic credentials exist on the build
machine.

## Decision

### Three independent assessors per dimension

1. **Rules** (Python, `app/rubric/rules.py`): explicit thresholds over the behavioural vector.
   Every contribution (rule, feature, value, effect, note) is returned and shown, so the RM sees
   which fact moved the score. Base band plus adjustments, clamped to 1–3.
2. **Statistical** (Python, `app/rubric/statistical.py`): a gradient-boosted classifier per
   dimension trained on 3,000 synthetic vectors drawn from archetype ranges written from the
   rubric definitions, then isotonic-calibrated; seeded and disclosed on screen with its hold-out
   accuracy. It knows nothing the archetypes do not encode. Its value is a calibrated probability
   and a second opinion that can disagree with the rules.
3. **LLM** (TypeScript, `apps/api/src/llm`): Claude reads the factual record, the vector with its
   manifest, the rules contributions, the RM notes and the event-log excerpt, and returns a
   structured score, rationale, cited evidence and caveats per dimension. Structured output is
   validated with the Zod schema; a response that fails validation is an error, never accepted.

### Combination and confidence

- System score is the majority of available assessors; with no majority the rules assessor
  decides because its reasoning is fully visible.
- Confidence = 0.45 × agreement + 0.25 × statistical calibration + 0.15 × data quality +
  0.15 × freshness, minus 10 points when the LLM assessor is unavailable. Agreement is 1 / 0.6 /
  0.2 for three assessors (all / two / none agreeing) and 1 / 0.35 for two.
- Mismatches are derived deterministically: portfolio risk above Appetite, stated versus observed
  Appetite, Horizon against near-term cash needs, Capacity against leverage.

### Claude gateway

- One module owns the SDK: model choice from configuration (Sonnet 5 analysis, Haiku 4.5 fast,
  per decision D3), prompt registry with versions and hashes, `messages.parse` with
  `zodOutputFormat` and adaptive thinking, cached system prompt, trace persistence to
  `derived.llm_traces` (prompt id/version/hash, input hash, model, mode, response, usage, latency,
  error).
- **Recorded mode.** Without a key the gateway replays saved responses keyed by prompt and input
  hash from `apps/api/recordings`. If none matches, the assessor reports `unavailable` and the
  rubric proceeds on two assessors with the penalty above and a visible notice. With a key and
  `CLAUDE_RECORD=true`, live responses are saved for offline demos.
- Numbers in the LLM's rationale are quoted from inputs; the prompt forbids world events outside
  the supplied event-log excerpt.

### RM control and audit

- Overrides require a reason of at least ten characters, record the system score alongside the
  override, and are written to `derived.audit_events` with the RM id. Locking freezes the
  assessment; further changes require a new assessment. Every assessment, override and lock is an
  audit event.

## Consequences

- On this machine the rubric runs on two assessors and says so; adding a key changes nothing in
  the code path.
- Disagreement is visible and useful: for Lau Chi Ming the rules score Capacity 1 (margin-call
  proximity, heavy near-term claims) while the statistical assessor says 2 with 92% probability;
  the RM sees both and the reduced confidence.
- The statistical assessor's archetype ranges are a stated judgement and live in one file; they
  can be revised as real labelled outcomes accumulate.
