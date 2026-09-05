CREATE TABLE "derived"."action_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" text NOT NULL,
	"client_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"actor" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "action_decisions_client_idx" ON "derived"."action_decisions" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "action_decisions_action_idx" ON "derived"."action_decisions" USING btree ("action_id");