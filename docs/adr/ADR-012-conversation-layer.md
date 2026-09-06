# ADR-012: The conversation layer

Date: 2026-09-06 · Status: accepted · Design: `docs/rm-experience-design.html` §11, `docs/plugin-agent-design.html`

## Context

The RM asked for a conversational interface present on every screen that answers questions about a
client, a group of clients or the market signals, and turns sentences into tasks. No Anthropic API
key exists on the development machine, so the layer must be useful without a model and better with one.

## Decision

1. **One pipeline, two planners.** A `Plan` (intent, tool calls, proposals, navigation, question
   shape) is produced either by Claude (fast tier, structured output) or by a deterministic grammar
   (`apps/api/src/assistant/grammar.ts`). The executor (`tools.ts`) runs the plan against the
   existing services; tools only read. The composer writes the answer either through Claude
   (analysis tier) from the template's facts, or through the template writer (`compose.ts`). The
   response says which planner and which writer answered.
2. **Facts come only from tools.** The Claude writer receives the template's sentences and the
   trimmed tool results; figures in its answer are checked against them and unmatched figures raise
   a visible warning. Notes and event text are quoted, never followed as instructions.
3. **Tasks are proposals.** Sentences that imply an action (defer, done, triage, decision, override,
   draft) become proposal cards with the exact effect. Nothing is written until the RM confirms;
   confirmation performs the same service call the screens use and adds an audit event
   `ASSISTANT_CONFIRMED` whose payload records the originating sentence. Proposals expire after five
   minutes and are single-use. There is no send proposal.
4. **Scope follows the URL.** The drawer sends the client in context; pronouns resolve to it;
   book-wide words ("who", "which clients", "compare") switch to the book.
5. **Find is a tool.** `findClients` filters the book by alert kind, lane, contact gap, signal reach,
   KYC or cash-need window, wealth band, place and language over one `BookService.perClient`
   computation. `compareClients` lays clients side by side.
6. **The drawer is on every screen** (`AssistantDrawer`, ⌘/), with starters per scope, cards, proposal
   cards, warnings, the tool trace as L3 and follow-up chips.

## Consequences

- The MCP tool server of the plugin design reuses `plan.ts`, `tools.ts` and the proposal handshake.
- The grammar is a list of RM questions; unknown questions fall back to a client summary or help.
  Extending it means adding a pattern and a template writer, with a test.
- Cmd+J is Chrome's downloads shortcut and never reached the page; the drawer uses ⌘/.
- Companion cues, promise extraction and the idea desk (9b) build on the same router.
