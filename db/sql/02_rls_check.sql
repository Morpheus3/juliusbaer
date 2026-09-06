-- Row-level security smoke test. Run as a NON-superuser role (superusers bypass RLS):
--   PGPASSWORD=... psql -U rmw_app -d rm_workbench -f db/sql/02_rls_check.sql
\echo 'scope none  → 0 clients expected'
SELECT set_config('app.scope', 'none', false);
SELECT count(*) AS clients_visible FROM raw.clients;

\echo 'scope all   → every client'
SELECT set_config('app.scope', 'all', false);
SELECT count(*) AS clients_visible FROM raw.clients;

\echo 'scope own   → the first RM with assignments'
SELECT set_config('app.scope', 'all', false);
SELECT set_config('app.scope', 'own', false),
       set_config('app.rm_id', (SELECT rm_id FROM raw.rm_assignments WHERE valid_to IS NULL ORDER BY rm_id LIMIT 1), false);
SELECT current_setting('app.rm_id') AS rm, count(*) AS clients_visible FROM raw.clients;
SELECT count(*) AS holdings_visible FROM raw.holdings;
SELECT count(*) AS notes_visible FROM raw.rm_notes;

\echo 'scope own, unknown RM → 0 everywhere'
SELECT set_config('app.rm_id', 'RM-NOBODY', false);
SELECT count(*) AS clients_visible FROM raw.clients;
SELECT count(*) AS facility_snapshots_visible FROM raw.credit_facility_snapshots;

\echo 'scope team  → the first team''s books'
SELECT set_config('app.scope', 'team', false),
       set_config('app.team_id', (SELECT team_id FROM raw.teams ORDER BY team_id LIMIT 1), false);
SELECT current_setting('app.team_id') AS team, count(*) AS clients_visible FROM raw.clients;

\echo 'entitlements view'
SELECT set_config('app.scope', 'all', false);
SELECT rm_id, rm_name, count(*) AS clients FROM access.entitlements GROUP BY 1, 2 ORDER BY 1;
