CREATE TABLE "derived"."promises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"party" text NOT NULL,
	"kind" text DEFAULT 'promise' NOT NULL,
	"text" text NOT NULL,
	"quote" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_ref" text,
	"due_date" text,
	"status" text DEFAULT 'open' NOT NULL,
	"actor" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "derived"."reference_docs" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"doc" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "promises_client_idx" ON "derived"."promises" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "promises_fingerprint_idx" ON "derived"."promises" USING btree ("fingerprint");