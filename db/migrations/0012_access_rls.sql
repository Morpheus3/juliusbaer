-- Row-level security: every client-owned row is invisible unless the connection declares a scope.
--   app.scope  = 'all'  (loaders, migrations, analytics service)
--              | 'own'  (an RM: clients assigned to app.rm_id today)
--              | 'team' (a team head: clients assigned to any RM in app.team_id)
--              | 'none' (the API's base pool; nothing visible until a request is authenticated)
-- Policies use FORCE so the table owner is bound too. Access tables carry no client data and no RLS.

SELECT set_config('app.scope', 'all', false);

INSERT INTO "access"."roles" ("role", "scope", "description") VALUES
  ('rm', 'own', 'Relationship manager: the clients assigned to them'),
  ('team_head', 'team', 'Team head: every client assigned to an RM in the team'),
  ('checker', 'own', 'May approve as the second pair of eyes on money-moving actions'),
  ('admin', 'all', 'Platform administrator: every client')
ON CONFLICT ("role") DO NOTHING;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION access.current_scope() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.scope', true), ''), 'none')
$$;
--> statement-breakpoint

-- Clients the current connection may see. Assignments are valid on the real date, not the replay clock.
CREATE OR REPLACE FUNCTION access.entitled_clients() RETURNS SETOF text
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT a.client_id
  FROM raw.rm_assignments a
  WHERE (a.valid_to IS NULL OR a.valid_to >= current_date)
    AND a.valid_from <= current_date
    AND (
      (access.current_scope() = 'own'
        AND a.rm_id = current_setting('app.rm_id', true))
      OR
      (access.current_scope() = 'team'
        AND a.rm_id IN (SELECT r.rm_id FROM raw.rms r WHERE r.team_id = current_setting('app.team_id', true)))
    )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION access.can_see(p_client_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT access.current_scope() = 'all'
      OR (p_client_id IS NOT NULL AND p_client_id IN (SELECT access.entitled_clients()))
$$;
--> statement-breakpoint

-- Tables keyed by client_id (not null).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'raw.clients', 'raw.portfolios', 'raw.holdings', 'raw.transactions', 'raw.credit_facilities',
    'raw.commitments', 'raw.planned_cash_needs', 'raw.rm_notes', 'raw.rm_assignments',
    'derived.client_factual', 'derived.client_vectors', 'derived.rubric_assessments',
    'derived.rubric_overrides', 'derived.impact_runs', 'derived.action_decisions',
    'derived.alert_triage', 'derived.outreach', 'derived.promises'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_client ON %s', t);
    EXECUTE format('CREATE POLICY rls_client ON %s FOR ALL USING (access.can_see(client_id)) WITH CHECK (access.can_see(client_id))', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Tables where client_id may be null: book-level rows stay visible to everyone authenticated.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'derived.audit_events', 'derived.llm_traces', 'derived.data_quality_issues', 'ingest.change_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_client_nullable ON %s', t);
    EXECUTE format('CREATE POLICY rls_client_nullable ON %s FOR ALL USING (access.current_scope() <> ''none'' AND (client_id IS NULL OR access.can_see(client_id))) WITH CHECK (access.current_scope() <> ''none'' AND (client_id IS NULL OR access.can_see(client_id)))', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Snapshot tables without a client_id: visible through their parent.
ALTER TABLE raw.credit_facility_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.credit_facility_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_via_facility ON raw.credit_facility_snapshots;
CREATE POLICY rls_via_facility ON raw.credit_facility_snapshots FOR ALL
  USING (access.current_scope() = 'all' OR EXISTS (
    SELECT 1 FROM raw.credit_facilities f
    WHERE f.facility_id = credit_facility_snapshots.facility_id AND access.can_see(f.client_id)))
  WITH CHECK (access.current_scope() = 'all' OR EXISTS (
    SELECT 1 FROM raw.credit_facilities f
    WHERE f.facility_id = credit_facility_snapshots.facility_id AND access.can_see(f.client_id)));
--> statement-breakpoint
ALTER TABLE raw.portfolio_aum ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.portfolio_aum FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_via_portfolio ON raw.portfolio_aum;
CREATE POLICY rls_via_portfolio ON raw.portfolio_aum FOR ALL
  USING (access.current_scope() = 'all' OR EXISTS (
    SELECT 1 FROM raw.portfolios p
    WHERE p.portfolio_id = portfolio_aum.portfolio_id AND access.can_see(p.client_id)))
  WITH CHECK (access.current_scope() = 'all' OR EXISTS (
    SELECT 1 FROM raw.portfolios p
    WHERE p.portfolio_id = portfolio_aum.portfolio_id AND access.can_see(p.client_id)));
--> statement-breakpoint

-- Who sees what, for operators and tests.
CREATE OR REPLACE VIEW access.entitlements AS
  SELECT a.rm_id, r.name AS rm_name, r.team_id, a.client_id, a.role, a.valid_from, a.valid_to
  FROM raw.rm_assignments a
  JOIN raw.rms r ON r.rm_id = a.rm_id
  WHERE a.valid_to IS NULL OR a.valid_to >= current_date;
--> statement-breakpoint

-- Dead-letter view for the ingest landing zone.
CREATE OR REPLACE VIEW ingest.dead_letters AS
  SELECT id, topic, type, idempotency_key, error, received_at
  FROM ingest.staging_messages
  WHERE status = 'rejected'
  ORDER BY received_at DESC;
