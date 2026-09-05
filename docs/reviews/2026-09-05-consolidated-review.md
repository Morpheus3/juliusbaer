# Consolidated review: code quality, performance, security

**Date:** 2026-09-05 · **Branch:** `feat/rm-workbench` at iteration 7 plus the Claude key panel
**Reviews run:** code and architecture review, performance analysis, security analysis (three independent
agents with the ai-dlc role briefs; the plugin's own agent definitions could not spawn because their
tool lists name tools that do not exist in Claude Code).

## Tool gates at the time of review

| Gate                                                          | Result                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `npm run typecheck`                                           | 0 errors                                                              |
| `npx eslint .` (strict type-checked)                          | 0 findings                                                            |
| `npx vitest run`                                              | 40 tests pass                                                         |
| `npm run py:check` (ruff, mypy strict, pytest in Python 3.12) | all pass, 21 tests                                                    |
| `npm audit --omit=dev`                                        | 0 vulnerabilities                                                     |
| `npm audit` (dev included)                                    | 4 moderate, all one chain: esbuild via drizzle-kit's loader, dev-only |

## Verdict in one paragraph

The skeleton is sound: shared contracts enforced at both ends, a genuinely layered API, pure domain
functions, a well-designed Claude gateway, and real dataset agnosticism for snapshots, today, the RM and
reference data. No SQL injection or XSS defect was found in either language. The weaknesses concentrate
in three places: the recommendation layer (alerts → actions → trade ideas → lanes) is the largest,
most heuristic and least tested code and passes information through display strings; the platform has
no identity layer, so maker-checker and the audit trail are UX guardrails rather than controls; and
the analytics service trains its models on the first request, which stalls the first rubric for
about 13 seconds.

## Blockers before promotion (fix first)

| #   | Finding                                                                                                                                                                                                               | Where                                                                                                               | Source                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | Cold-start model training on the request path: first `/rubric/assess` takes 12.7 s and the API call has no timeout. Train in a FastAPI lifespan hook or persist the models; add a fetch timeout in `rubricService`.   | `services/analytics/app/rubric/statistical.py`, `apps/api/src/services/rubricService.ts`                            | Performance           |
| 2   | Hard-coded mandate code `'SUSBAL'` in the data-quality register while the generic helper `exclusionBoundMandates()` in the same file is never called. Register and API disagree on any other dataset.                 | `db/src/seed/quality/checks.ts:312`                                                                                 | Code                  |
| 3   | Python cash-need proration counts needs whose window already ended (`due_to < today` guard missing) and the impact engine uses 365 days instead of 12 months. Three implementations disagree; add a parity test.      | `services/analytics/app/features/behavioural.py:96`, `app/impact/engine.py:347`, `apps/api/src/domain/cashflows.ts` | Code                  |
| 4   | Stale-valuation alerts only fire when the clock equals a snapshot date because `deriveAlerts` conflates clock and snapshot. Pass both explicitly.                                                                     | `apps/api/src/domain/alerts.ts`                                                                                     | Code                  |
| 5   | Docker publishes Postgres (default credentials) and the analytics API on all interfaces. Bind both to `127.0.0.1`.                                                                                                    | `docker-compose.yml:11-12,28-29`                                                                                    | Security              |
| 6   | Recorded LLM responses under `apps/api/recordings/*.json` are not gitignored; with `CLAUDE_RECORD=true` they would contain client narratives and the remote is public.                                                | `.gitignore`                                                                                                        | Security              |
| 7   | `.env` write keeps the existing world-readable mode (`mode: 0o600` only applies on create); key charset is unvalidated. `chmod` after write, add a `sk-ant-` regex.                                                   | `apps/api/src/services/settingsService.ts:36-48`                                                                    | Security              |
| 8   | Outreach can be re-sent over a sent record (no `status='draft'` guard) and decisions can be recorded for action ids that do not exist.                                                                                | `apps/api/src/repositories/workflowRepository.ts:79-94`, `apps/api/src/services/riskService.ts:219-253`             | Security              |
| 9   | The book cockpit loads every client bundle separately: 296 SQL statements per request, 7× latency at 10 concurrent requests. Add `bundleAll()` and share reference tables.                                            | `apps/api/src/services/bookService.ts`, `repositories/clientDetailRepository.ts`                                    | Performance           |
| 10  | The replay clock puts the date in query keys, so playing refetches the cockpit (296 statements) or the risk page (two impact runs) on every tick. Key on the resolved snapshot and event set; debounce while playing. | `apps/web/src/features/book/BookPage.tsx:33`, `features/risk/riskApi.ts`, `state/clock.ts`                          | Performance           |
| 11  | The core recommendation engines have no tests: `generateTradeIdeas`, `generateActions`, `deriveAlerts`, `exposure`, `mandate`, `derivedSignals`, all services and routes.                                             | `apps/api/src/domain/risk/*`, `domain/alerts.ts`, `domain/exposure.ts`                                              | Code                  |
| 12  | `riskService.combined` swallows every error from the impact call as "unavailable", including programming errors; the two impact runs are sequential.                                                                  | `apps/api/src/services/riskService.ts:113-117`                                                                      | Code                  |
| 13  | Body-less POST routes (`rubric/assess`, `rubric/lock`, `vectors/rebuild`) are CSRF-able as simple requests; CORS is not a CSRF control. Require a custom header and validate `Host`/`Origin`.                         | `apps/api/src/routes/rubric.ts`, `routes/vectors.ts`, `app.ts`                                                      | Security              |
| 14  | No rate limiting or concurrency cap on LLM-backed and heavy endpoints; no timeouts on Anthropic or analytics calls.                                                                                                   | `apps/api/src/llm/gateway.ts`, `routes/rubric.ts`, `routes/workflow.ts`                                             | Security, Performance |

## Must exist before any deployment inside a bank

- **Identity and authorisation.** No endpoint is authenticated; the actor recorded in the audit log comes from the dataset or configuration, and the second-RM check is satisfied by the same anonymous caller. Needs OIDC/SAML, RBAC, server-side maker ≠ checker, actor from the token, service-to-service auth.
- **Data sent to the LLM.** RM notes, factual records and holdings go to Anthropic verbatim and are stored verbatim in `llm_traces` and `outreach.context`. Needs an approved deployment route with zero data retention, pseudonymisation, prompt minimisation, encrypted or trimmed traces, and a retention policy.
- **Prompt injection hardening.** Delimit untrusted fields, validate that every cited evidence item resolves to a real note, feature or rule, cap output lengths, reject URLs or contact details not present in the input, and never let the LLM vote be decisive against the rules assessor on a mismatch-relevant dimension.
- **Append-only audit at the database.** Separate insert-only role, trigger against update and delete, hash chaining; one `AuditRepository` used inside every write transaction (today audit writes are scattered and the rubric writes are not transactional).
- **Transport and secrets.** TLS to Postgres and to the analytics service, a secrets manager instead of the `.env` write path, security headers and a CSP, self-hosted fonts, FastAPI docs disabled, non-root and digest-pinned containers.
- **CI.** `permissions:` block, actions pinned by SHA, dependency and secret scanning, Dependabot, a Python lock file.

## Architecture and code-quality improvements (first refactoring sprint)

- Domain modules import `sha256` from the LLM prompt registry; move it to `domain/ids.ts`.
- Three HTTP clients for one Python service with inconsistent error mapping; one `AnalyticsClient` with distinct error classes, injected everywhere.
- The stored rubric JSON is cast three different ways with `as unknown as`; define `StoredAssessment`, `OutreachContext` and `ImpactRunSummary` as Zod schemas in contracts and parse once in the repository; use `pgEnum` for status and decision columns.
- Alerts, actions and lanes communicate through title strings (`split(':')`, regex on "from YYYY-MM-DD"); make `ClientAlert.evidence` a kind-discriminated union and derive titles from fields.
- Dataset literals leaked into copy and heuristics: "Since 31 Dec 2025", "2026 receipts", "five snapshots", "among the 20 in the book" in the web; "2026 stress windows" in the rubric narrative; `CL-`/`PF-` id regexes, booking-centre and wealth-band enums in the row schemas; note-wording heuristics for waivers and unanswered emails. Derive from meta, relax the schemas or document them in the contract, move note phrases to `data/reference/note_patterns.json`.
- Route helpers: `.parse()` on request params turns validation errors into 500s; invalid `clock` is silently dropped; one shared validation helper.
- Seed is not atomic and deletes older successful runs before marking the new one successful.
- Web: five copies of the JSON POST helper, duplicated waterfall builder, an unused Outlet context, a dynamic import of an already imported module; `generateTradeIdeas` is one 440-line function, three pages hold five to eight components each.
- Gateway sends adaptive thinking unconditionally including to the fast tier, which needs `budget_tokens` on Haiku 4.5; corrupt recordings are indistinguishable from missing ones; every trace stores the full system prompt.
- Reference-file validation is looser than the runtime that consumes it (unknown match keys pass seed and match nothing).
- Accessibility: table rows as click targets, popover without ARIA state, charts without labels, two `h1` on the audit page.

## Performance measurements (local dev, warm, median of 7)

| Endpoint                             | Latency                                                                             | SQL statements            |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------- |
| `GET /api/v1/book`                   | 55 ms (370 ms p50 at 10 concurrent)                                                 | 296                       |
| `GET /api/v1/book/board`             | 28 ms                                                                               | 286                       |
| `GET /api/v1/clients/:id/risk`       | 30 ms                                                                               | 72 plus 2 analytics calls |
| `GET /api/v1/clients/:id/workflow`   | 33 ms                                                                               | 115 plus analytics        |
| `GET /api/v1/signals?clientId=`      | 5 ms                                                                                | 23                        |
| `GET /api/v1/clients/:id/overview`   | 4 ms                                                                                | 16                        |
| `GET /rubric/assess/:id` (analytics) | 12.66 s first call, 12 ms after                                                     |                           |
| `POST /vectors/build`                | 400 ms                                                                              |                           |
| Web bundle                           | 1.12 MB minified, 352 KB gzip, one chunk; 51% is ECharts loaded on chart-less pages |                           |

Suggested budgets: cockpit endpoints p50 under 50 ms single and p95 under 200 ms at 10 concurrent with at most 30 statements; analytics first call under 500 ms after start; initial JS under 250 KB gzip; at most one data request per five seconds per page during replay.

## Things that are already right

Zod on every route boundary and on every response the web app consumes; Drizzle everywhere in TypeScript and fully parameterised psycopg in Python; no `dangerouslySetInnerHTML`, `innerHTML` or `eval`; frozen, versioned, hashed system prompts with schema-validated output and a recorded mode that never fabricates; the LLM treated as one optional assessor among three; pino redaction correct and request bodies never logged; lockfile present and `npm ci` in CI; all hot queries are index hits under 0.05 ms.
