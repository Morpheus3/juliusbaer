# Agentic RM Workbench

An AI-assisted workbench for a private-banking Relationship Manager, built for the Julius Baer
**SingHacks 2026** challenge. It turns 20 client files, five portfolio snapshots and a 2026 event
log into a ranked list of what the RM should act on now, this week and this month, with every
recommendation traceable to its evidence and carrying a machine-checked confidence score.

> All client data in `data/` is **synthetic**, supplied by the challenge. Market levels and the
> event log are calibrated to 2026 history. Nothing here is investment advice.

- **Product blueprint:** [docs/BLUEPRINT.html](docs/BLUEPRINT.html) (scope, screens, engines, plan)
- **Decisions:** [docs/adr/](docs/adr/) · **Dataset docs:** [docs/dataset/](docs/dataset/)
- **Bring your own dataset:** [docs/DATASET_CONTRACT.md](docs/DATASET_CONTRACT.md) (required files, vocabulary, optional reference files)
- **Challenge brief:** [docs/dataset/CHALLENGE_README.md](docs/dataset/CHALLENGE_README.md)

## Run it

Prerequisites: Node 24+, Docker Desktop. Python 3.12 only if you want to run the analytics
service outside Docker.

```bash
cp .env.example .env         # ANTHROPIC_API_KEY is optional here: you can also paste it into the Claude panel in the app's left rail
npm install
npm run db:up                # Postgres 17 + pgvector on localhost:5433
npm run db:migrate
npm run db:seed              # loads data/ (or DATA_DIR) and builds the data-quality register
npm run dev                  # API on :4000, web on :5173
```

Then build the customer vectors (needs the analytics service):

```bash
docker compose --profile analytics up -d --build
npm run vectors:build
```

Open <http://localhost:5173>. To enable the language model, paste an Anthropic API key into the **Claude** panel at the bottom of the left rail; the API validates it against the models endpoint, keeps it in process memory (optionally saving it to the local `.env`), and the rubric's LLM assessor and outreach drafts switch to live immediately.

## Repository layout

```
apps/web/            React 19 + TypeScript single-page workbench
apps/api/            Fastify API: routes → services → repositories, engines, Claude gateway
packages/contracts/  Zod schemas and types shared by web, API and loader
db/                  Drizzle schema (raw + derived), migrations, dataset loader, quality checks
services/analytics/  Python FastAPI: customer vectors, impact models, validator
data/                The SingHacks dataset, unchanged; data/reference holds dataset-specific judgement files
docs/                Blueprint, ADRs, dataset dictionary
```

## Quality bar

- TypeScript strict with `exactOptionalPropertyTypes`; ESLint strict type-checked; Prettier.
- Python typed with pydantic, `mypy --strict`, Ruff.
- Vitest and pytest; CI runs typecheck, lint, tests, a migration and a full seed against Postgres.
  Locally, `npm run py:check` runs Ruff, mypy and pytest for the Python service inside a 3.12 container.
- Every prompt lives in a registry with a version; numbers in narratives are injected, never generated.
- No automated trading. Every action requires RM approval and is written to an audit log.

## Data platform

Postgres is the system of record; every engine reads it. The database ships as code twice: Drizzle
migrations in `db/migrations` (the application's source of truth) and plain SQL in `db/sql`
(`schema.sql` generated from the migrations, plus roles, grants and the row-level-security check).
See `db/sql/README.md`.

- **Schemas**: `raw` (bank data, incl. RMs, teams and dated client assignments), `derived` (engine
  outputs and RM decisions), `access` (users and roles), `ingest` (landing zone and change log).
- **Isolation**: row-level security on every client-owned table, enforced in Postgres; the API
  connects as `rmw_app` and scopes each request to the caller (own book, team, or everything).
  `npm run db:roles` creates the roles locally, `npm run db:rls-check` proves the policies.
- **Identity**: `AUTH_MODE=dev` lists identities from the data and `data/reference/access.json`;
  `AUTH_MODE=oidc` verifies the bank's tokens.
- **Ingestion**: message contracts in `packages/contracts/src/messages.ts`; `npm run ingest:batch --
data/messages/sample` applies files; `npm run kafka:up` then `npm run ingest:dev` and
  `npm run ingest:produce` run the Kafka path locally (Redpanda). Rejected messages appear in
  `ingest.dead_letters`; every batch is a `derived.load_runs` row. ADR-014 and ADR-015.

## Build iterations

| #     | Scope                                                                                  | Status |
| ----- | -------------------------------------------------------------------------------------- | ------ |
| 0     | Foundation: monorepo, Postgres, schema, loader, data-quality register, app shell       | done   |
| 1     | Customer factual data and behavioural vector                                           | done   |
| 2     | Client 360 and portfolio deep dive                                                     | done   |
| 3     | Market signals and impact analysis                                                     | done   |
| 4     | Risk rubric (Capacity · Appetite · Horizon) and confidence scoring                     | done   |
| 4.5   | Dataset agnosticism refactor                                                           | done   |
| 5     | Combined risk, ranked actions, trade ideas                                             | done   |
| 6     | Book cockpit with Now / 7-day / 30-day lanes                                           | done   |
| 7     | Workflow, approvals, outreach, audit                                                   | done   |
| 7.6   | Hardening pass from the 2026-09-05 review                                              | done   |
| 8a    | Client context: strip, ⌘K switcher, corridor rail                                      | done   |
| 8b    | Client journey: five chapters as the client's front door                               | done   |
| 8c    | Call plan: whom to call and when, policy in reference data                             | done   |
| 8d    | Today: morning brief, call sheet, lanes opening the journey                            | done   |
| 9a    | The conversation: assistant drawer on every screen, grammar + Claude planners          | done   |
| 9b    | Companion (in-call cues, guardrails), promise ledger, idea desk                        | done   |
| D1–D4 | Data platform: RM model, identity, row-level security, incremental and Kafka ingestion | done   |
| 10    | The manager and the foundation: team page, gateway and playbooks, shadow mode          | next   |

The experience design behind iterations 8 to 10 is `docs/rm-experience-design.html` (the RM Spine).
