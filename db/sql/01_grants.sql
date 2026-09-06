-- Grants. Run after schema.sql, as the owner. Re-runnable.
GRANT USAGE ON SCHEMA raw, derived, access, ingest TO rmw_app, rmw_ingest, rmw_analytics;

-- The API reads everything under RLS and writes the decision tables.
GRANT SELECT ON ALL TABLES IN SCHEMA raw, access TO rmw_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA derived TO rmw_app;
GRANT SELECT ON ALL TABLES IN SCHEMA ingest TO rmw_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA access TO rmw_app, rmw_ingest, rmw_analytics;

-- The loader and the consumer own the raw data and the landing zone.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA raw, ingest TO rmw_ingest;
GRANT SELECT, INSERT, UPDATE ON derived.load_runs, derived.data_quality_issues TO rmw_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON derived.lookthrough_legs, derived.issuer_groups, derived.signal_rules,
  derived.signal_series_rules, derived.scenarios, derived.call_policy, derived.reference_docs TO rmw_ingest;
GRANT SELECT, INSERT, UPDATE ON access.users, access.user_roles TO rmw_ingest;

-- Analytics reads raw and writes vectors.
GRANT SELECT ON ALL TABLES IN SCHEMA raw TO rmw_analytics;
GRANT SELECT, INSERT, UPDATE, DELETE ON derived.vector_runs, derived.client_factual, derived.client_vectors TO rmw_analytics;
GRANT SELECT ON derived.rubric_assessments, derived.scenarios TO rmw_analytics;

-- Future tables inherit the same pattern.
ALTER DEFAULT PRIVILEGES IN SCHEMA raw GRANT SELECT ON TABLES TO rmw_app, rmw_analytics;
ALTER DEFAULT PRIVILEGES IN SCHEMA raw GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO rmw_ingest;
ALTER DEFAULT PRIVILEGES IN SCHEMA derived GRANT SELECT, INSERT, UPDATE ON TABLES TO rmw_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ingest GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rmw_ingest;
