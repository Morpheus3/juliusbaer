CREATE TABLE "derived"."shadow_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"playbook_id" text NOT NULL,
	"step_id" text NOT NULL,
	"draft" text NOT NULL,
	"source" text DEFAULT 'template' NOT NULL,
	"grade" text NOT NULL,
	"rm_text" text,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "shadow_grades_playbook_idx" ON "derived"."shadow_grades" USING btree ("playbook_id","created_at");