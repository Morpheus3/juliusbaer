-- Shadow grades name a client, so they follow the same row-level security as every client-owned table.
ALTER TABLE derived.shadow_grades ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE derived.shadow_grades FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rls_client ON derived.shadow_grades FOR ALL USING (access.can_see(client_id)) WITH CHECK (access.can_see(client_id));
