CREATE TABLE "derived"."issuer_groups" (
	"instrument_id" text PRIMARY KEY NOT NULL,
	"exposure_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived"."lookthrough_legs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "derived"."lookthrough_legs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" text NOT NULL,
	"leg" text NOT NULL,
	"weight" numeric(8, 4) NOT NULL,
	"exposure_name" text NOT NULL,
	"sector" text NOT NULL,
	"region" text NOT NULL,
	"matched_instrument_id" text,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lookthrough_instrument_idx" ON "derived"."lookthrough_legs" USING btree ("instrument_id");