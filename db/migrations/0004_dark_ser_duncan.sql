CREATE TABLE "derived"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"client_id" text,
	"entity_type" text,
	"entity_id" text,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived"."llm_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"model" text NOT NULL,
	"mode" text NOT NULL,
	"input_hash" text NOT NULL,
	"client_id" text,
	"request" jsonb NOT NULL,
	"response" jsonb,
	"usage" jsonb,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived"."rubric_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"vector_run_id" uuid,
	"clock" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"result" jsonb NOT NULL,
	"engine_versions" jsonb NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived"."rubric_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"dimension" text NOT NULL,
	"system_score" integer NOT NULL,
	"override_score" integer NOT NULL,
	"reason" text NOT NULL,
	"rm_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "derived"."rubric_assessments" ADD CONSTRAINT "rubric_assessments_vector_run_id_vector_runs_id_fk" FOREIGN KEY ("vector_run_id") REFERENCES "derived"."vector_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived"."rubric_overrides" ADD CONSTRAINT "rubric_overrides_assessment_id_rubric_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "derived"."rubric_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_client_idx" ON "derived"."audit_events" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_kind_idx" ON "derived"."audit_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "llm_traces_client_idx" ON "derived"."llm_traces" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "rubric_client_idx" ON "derived"."rubric_assessments" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "rubric_overrides_client_idx" ON "derived"."rubric_overrides" USING btree ("client_id");