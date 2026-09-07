# ADR-015: Identity, RM assignments and row-level security

Date: 2026-09-07 · Status: accepted · Assessment: `docs/data-platform-assessment.html`

## Context

RM facts were columns on clients; the API inferred one RM from the data and served every client to
every browser. The platform must onboard RMs and teams and guarantee that one RM's clients are
invisible to another, with a team head seeing the team and an admin everything.

## Decision

1. **RM model in raw.** `raw.teams`, `raw.rms`, `raw.rm_assignments` (client, RM, role primary /
   secondary / checker / cover, valid_from, valid_to, source, reason). Assignments are the source of
   truth for entitlement and history; the `rm_*` columns on clients stay as the denormalised current
   primary for the engines and are kept in step by the apply step and the seed.
2. **Identity in access.** `access.users` (subject from the identity provider, display name, RM),
   `access.roles` (rm → own, team_head → team, checker → own, admin → all), `access.user_roles`.
   No client data, no row-level security.
3. **Row-level security in Postgres, enforced.** `access.entitled_clients()` derives the visible
   client set from assignments valid on the real date and the connection's `app.scope`, `app.rm_id`
   and `app.team_id`; `access.can_see(client_id)` guards every client-owned table with `FORCE ROW
LEVEL SECURITY`, so a query with no filter still returns only entitled rows. Tables whose client
   id may be null show book-level rows to any authenticated scope. Snapshot tables without a client
   id are guarded through their parent. Default is deny: an unset scope sees nothing.
4. **Roles, not superusers.** Superusers bypass RLS, so the API connects as `rmw_app` (`db/sql/00_roles.sql`,
   `01_grants.sql`); loaders and the analytics service connect as service roles with `app.scope = all`.
5. **Per-request scope in the API.** The auth plugin verifies a bearer token (HS256 in development,
   the bank's OIDC JWKS in production), resolves the caller in `access.users`, leases one connection,
   sets the three settings on it, and runs the request inside AsyncLocalStorage; `app.db` is a proxy to
   that connection, so repositories are row-secured without changes. The actor also drives the meta
   endpoint, audit actors, the RM level and the checker.
6. **Development identities.** The seed creates a user per RM found in the data and reads
   `data/reference/access.json` for heads, checkers and admins; `/auth/dev/login` issues tokens for
   them. Production sets `AUTH_MODE=oidc`.

## Consequences

- Percentiles and peers are computed bank-wide by the analytics service under the service scope and
  shown per client; no cross-client rows reach an RM.
- `db/sql/02_rls_check.sql` (`npm run db:rls-check`) is the standing proof and must run as a
  non-superuser.
- Cached meta is keyed by scope; the assistant, call plan and idea desk are scoped by construction.
