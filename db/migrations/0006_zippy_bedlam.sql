CREATE TABLE "derived"."scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"ordinal" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"shock" jsonb NOT NULL,
	"horizon_days" integer NOT NULL,
	"probability_note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived"."signal_series_rules" (
	"series_id" text PRIMARY KEY NOT NULL,
	"unit" text NOT NULL,
	"threshold" numeric(12, 4) NOT NULL,
	"match" jsonb NOT NULL,
	"shock" jsonb NOT NULL
);
