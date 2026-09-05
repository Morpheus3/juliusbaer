# Recorded Claude responses

When `ANTHROPIC_API_KEY` is set and `CLAUDE_RECORD=true`, the gateway writes each schema-valid
response here, keyed by prompt id, version, prompt hash and input hash. Without a key the gateway
replays these files; if no file matches, the LLM assessor reports itself unavailable and the
rubric proceeds on the two deterministic assessors with the confidence penalised.

Recordings are inputs to the demo, not test fixtures; regenerate them after any prompt or vector
change with `npm run llm:record`.
