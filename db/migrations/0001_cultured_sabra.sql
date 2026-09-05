CREATE TABLE "derived"."client_factual" (
	"client_id" text PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"facts" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived"."client_vectors" (
	"client_id" text PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"features" jsonb NOT NULL,
	"percentiles" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"peers" jsonb NOT NULL,
	"note_embedding" vector(256),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived"."vector_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dataset_today" text NOT NULL,
	"engine_version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"client_count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "derived"."client_factual" ADD CONSTRAINT "client_factual_run_id_vector_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "derived"."vector_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived"."client_vectors" ADD CONSTRAINT "client_vectors_run_id_vector_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "derived"."vector_runs"("id") ON DELETE cascade ON UPDATE no action;