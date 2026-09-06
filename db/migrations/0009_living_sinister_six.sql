CREATE TABLE "derived"."call_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"policy" jsonb NOT NULL
);
