CREATE TABLE "derived"."impact_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"label" text,
	"request" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"engine_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived"."signal_rules" (
	"event_id" text PRIMARY KEY NOT NULL,
	"match" jsonb NOT NULL,
	"shock" jsonb NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived"."signal_thresholds" (
	"series_id" text PRIMARY KEY NOT NULL,
	"threshold" numeric(12, 4) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "impact_runs_client_idx" ON "derived"."impact_runs" USING btree ("client_id","created_at");