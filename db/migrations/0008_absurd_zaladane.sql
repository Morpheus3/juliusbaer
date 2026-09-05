CREATE TABLE "derived"."alert_triage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" text NOT NULL,
	"client_id" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived"."outreach" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"channel" text NOT NULL,
	"language" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text NOT NULL,
	"llm_trace_id" uuid,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "alert_triage_client_idx" ON "derived"."alert_triage" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "outreach_client_idx" ON "derived"."outreach" USING btree ("client_id","created_at");