-- Assignments and RMs are access metadata: the entitlement function reads them, so they cannot be
-- row-secured themselves (0012 made access.entitled_clients() recurse through its own policy).
ALTER TABLE raw.rm_assignments DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE raw.rm_assignments NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS rls_client ON raw.rm_assignments;
