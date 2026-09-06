-- Database roles for the RM workbench. Run once per database as a superuser.
--
--   rmw_owner     owns the schemas; runs migrations (db:migrate) and the DDL in schema.sql
--   rmw_app       the API. Connects with app.scope=none and sets own/team/all per request after authentication.
--   rmw_ingest    the loader and the Kafka consumer. Connects with app.scope=all; writes raw.*, ingest.*, derived.load_runs.
--   rmw_analytics the Python analytics service. Connects with app.scope=all; reads raw.*, writes derived vectors.
--
-- Superusers bypass row-level security, so the API must never connect as one. Passwords come in as
-- psql variables; never commit real values:
--   psql "$ADMIN_URL" -v owner_password=... -v app_password=... -v ingest_password=... -v analytics_password=... -f db/sql/00_roles.sql

SELECT format('CREATE ROLE rmw_owner LOGIN PASSWORD %L', :'owner_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rmw_owner') \gexec
SELECT format('CREATE ROLE rmw_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rmw_app') \gexec
SELECT format('CREATE ROLE rmw_ingest LOGIN PASSWORD %L', :'ingest_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rmw_ingest') \gexec
SELECT format('CREATE ROLE rmw_analytics LOGIN PASSWORD %L', :'analytics_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rmw_analytics') \gexec

-- Connection-level defaults for the scope setting. A process may still override per session.
ALTER ROLE rmw_app SET app.scope = 'none';
ALTER ROLE rmw_ingest SET app.scope = 'all';
ALTER ROLE rmw_analytics SET app.scope = 'all';
