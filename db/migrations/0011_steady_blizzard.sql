CREATE SCHEMA "access";
--> statement-breakpoint
CREATE SCHEMA "ingest";
--> statement-breakpoint
CREATE TABLE "raw"."rm_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"rm_id" text NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"source" text DEFAULT 'dataset' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw"."rms" (
	"rm_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"desk" text DEFAULT '' NOT NULL,
	"team_id" text,
	"email" text,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw"."teams" (
	"team_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"desk" text DEFAULT '' NOT NULL,
	"head_rm_id" text
);
--> statement-breakpoint
CREATE TABLE "access"."roles" (
	"role" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access"."user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "access"."users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"rm_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_subject_unique" UNIQUE("subject")
);
--> statement-breakpoint
CREATE TABLE "ingest"."change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"kind" text NOT NULL,
	"load_run_id" uuid,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest"."staging_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"load_run_id" uuid,
	CONSTRAINT "staging_messages_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "derived"."load_runs" ADD COLUMN "mode" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "raw"."rm_assignments" ADD CONSTRAINT "rm_assignments_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."rm_assignments" ADD CONSTRAINT "rm_assignments_rm_id_rms_rm_id_fk" FOREIGN KEY ("rm_id") REFERENCES "raw"."rms"("rm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."rms" ADD CONSTRAINT "rms_team_id_teams_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "raw"."teams"("team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "access"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access"."user_roles" ADD CONSTRAINT "user_roles_role_roles_role_fk" FOREIGN KEY ("role") REFERENCES "access"."roles"("role") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access"."users" ADD CONSTRAINT "users_rm_id_rms_rm_id_fk" FOREIGN KEY ("rm_id") REFERENCES "raw"."rms"("rm_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rm_assignments_client_idx" ON "raw"."rm_assignments" USING btree ("client_id","valid_to");--> statement-breakpoint
CREATE INDEX "rm_assignments_rm_idx" ON "raw"."rm_assignments" USING btree ("rm_id","valid_to");--> statement-breakpoint
CREATE INDEX "change_log_client_idx" ON "ingest"."change_log" USING btree ("client_id","applied_at");--> statement-breakpoint
CREATE INDEX "staging_status_idx" ON "ingest"."staging_messages" USING btree ("status","received_at");