# ADR-001: Technology stack

**Status:** Accepted · 2026-09-05

## Context

The brief asks for a single-page RM workbench on Node.js and a local Postgres, with Claude for
analysis and Python for predictive validation, held to a stringent code-quality standard. The
host machine has Node 24, Docker Desktop and Python 3.9; there is no system Postgres.

## Decision

| Layer     | Choice                                                                                                | Why                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Web       | React 19, TypeScript, Vite, Tailwind 4, TanStack Query, Zustand, React Router                         | Single-page, fast iteration, current stable versions. React 19 rather than 18 for stack currency.             |
| API       | Node 24, Fastify 5, TypeScript strict, Zod 4                                                          | Layered route → service → repository; schemas shared with the web app via `@jb/contracts`.                    |
| Data      | PostgreSQL 17 with pgvector in Docker on host port 5433                                               | Another project's Postgres occupies 5432 inside Docker; 5433 avoids any clash. pgvector for note embeddings.  |
| ORM       | Drizzle ORM with SQL migrations committed to `db/migrations`                                          | Readable SQL, small runtime, snake_case casing.                                                               |
| Analytics | Python 3.12, FastAPI, pandas, numpy, scikit-learn, in Docker                                          | Host Python is 3.9; numeric engines and the validator need a modern runtime.                                  |
| LLM       | Anthropic SDK behind one gateway module; Sonnet 5 for analysis and chat, Haiku 4.5 for classification | One place for prompt versions, structured-output validation and tracing. Runs in recorded mode without a key. |

## Consequences

- Two runtimes (Node, Python) means two test suites and two lint configurations; CI runs both.
- All numbers shown to the RM are computed in Python or SQL; Claude writes narrative only.
- Monorepo with npm workspaces: `packages/contracts`, `db`, `apps/api`, `apps/web`, `services/analytics`.
