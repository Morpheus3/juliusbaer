# Agentic RM Workbench

An AI-assisted workbench for a private-banking Relationship Manager, built for the Julius Baer
**SingHacks 2026** challenge. It turns 20 client files, five portfolio snapshots and a 2026 event
log into a ranked list of what the RM should act on now, this week and this month, with every
recommendation traceable to its evidence and carrying a machine-checked confidence score.

> All client data in `data/` is **synthetic**, supplied by the challenge. Market levels and the
> event log are calibrated to 2026 history. Nothing here is investment advice.

- **Product blueprint:** [docs/BLUEPRINT.html](docs/BLUEPRINT.html) (scope, screens, engines, plan)
- **Decisions:** [docs/adr/](docs/adr/) · **Dataset docs:** [docs/dataset/](docs/dataset/)
- **Challenge brief:** [docs/dataset/CHALLENGE_README.md](docs/dataset/CHALLENGE_README.md)

## Run it

Prerequisites: Node 24+, Docker Desktop. Python 3.12 only if you want to run the analytics
service outside Docker.

```bash
cp .env.example .env         # add ANTHROPIC_API_KEY when you have one
npm install
npm run db:up                # Postgres 17 + pgvector on localhost:5433
npm run db:migrate
npm run db:seed              # loads data/ and builds the data-quality register
npm run dev                  # API on :4000, web on :5173
```

Then build the customer vectors (needs the analytics service):

```bash
docker compose --profile analytics up -d --build
npm run vectors:build
```

Open <http://localhost:5173>. The customer vector explorer is under Customer view.

## Repository layout

```
apps/web/            React 19 + TypeScript single-page workbench
apps/api/            Fastify API: routes → services → repositories, engines, Claude gateway
packages/contracts/  Zod schemas and types shared by web, API and loader
db/                  Drizzle schema (raw + derived), migrations, dataset loader, quality checks
services/analytics/  Python FastAPI: customer vectors, impact models, validator
data/                The SingHacks dataset, unchanged
docs/                Blueprint, ADRs, dataset dictionary
```

## Quality bar

- TypeScript strict with `exactOptionalPropertyTypes`; ESLint strict type-checked; Prettier.
- Python typed with pydantic, `mypy --strict`, Ruff.
- Vitest and pytest; CI runs typecheck, lint, tests, a migration and a full seed against Postgres.
  Locally, `npm run py:check` runs Ruff, mypy and pytest for the Python service inside a 3.12 container.
- Every prompt lives in a registry with a version; numbers in narratives are injected, never generated.
- No automated trading. Every action requires RM approval and is written to an audit log.

## Build iterations

| #   | Scope                                                                            | Status |
| --- | -------------------------------------------------------------------------------- | ------ |
| 0   | Foundation: monorepo, Postgres, schema, loader, data-quality register, app shell | done   |
| 1   | Customer factual data and behavioural vector                                     | next   |
| 2   | Client 360 and portfolio deep dive                                               |        |
| 3   | Market signals and impact analysis                                               |        |
| 4   | Risk rubric (Capacity · Appetite · Horizon) and confidence scoring               |        |
| 5   | Combined risk, ranked actions, trade ideas                                       |        |
| 6   | Book cockpit with Now / 7-day / 30-day lanes                                     |        |
| 7   | Workflow, approvals, outreach, audit                                             |        |
| 8   | Assistant and polish                                                             |        |
