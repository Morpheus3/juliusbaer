-- RM Workbench · full DDL, generated from db/migrations by `npm run db:ddl`.
-- Apply on an empty database that already has the pgvector and pgcrypto extensions
-- (see db/init/01-extensions.sql) with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/sql/schema.sql
-- Do not edit by hand; edit the Drizzle schema, generate a migration, then re-export.
-- Generated 2026-09-06 from 14 migrations.

BEGIN;

-- ============================================================================
-- 0000 · 0000_hesitant_marrow · 2026-09-05
-- ============================================================================
CREATE SCHEMA "raw";
CREATE SCHEMA "derived";
CREATE TABLE "raw"."clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_name" text NOT NULL,
	"age" integer,
	"gender" text NOT NULL,
	"nationality" text NOT NULL,
	"country_of_residence" text NOT NULL,
	"tax_domicile" text NOT NULL,
	"booking_centre" text NOT NULL,
	"rm_id" text NOT NULL,
	"rm_name" text NOT NULL,
	"rm_desk" text NOT NULL,
	"base_currency" text NOT NULL,
	"wealth_band" text NOT NULL,
	"total_aum_usd" numeric(20, 4) NOT NULL,
	"life_stage" text NOT NULL,
	"source_of_wealth" text NOT NULL,
	"risk_profile" text NOT NULL,
	"risk_tolerance_score" integer NOT NULL,
	"investment_horizon_years" integer NOT NULL,
	"liquidity_needs" text NOT NULL,
	"objectives" text NOT NULL,
	"client_since" date NOT NULL,
	"kyc_review_due" date NOT NULL,
	"pep_status" boolean NOT NULL,
	"reporting_language" text NOT NULL
);
CREATE TABLE "raw"."commitments" (
	"commitment_id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"fund_name" text NOT NULL,
	"currency" text NOT NULL,
	"committed" numeric(20, 4) NOT NULL,
	"called_to_date" numeric(20, 4) NOT NULL,
	"uncalled" numeric(20, 4) NOT NULL,
	"expected_call_window" text NOT NULL
);
CREATE TABLE "raw"."credit_facilities" (
	"facility_id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"collateral_portfolio_id" text NOT NULL,
	"facility_type" text NOT NULL,
	"facility_ccy" text NOT NULL,
	"credit_limit" numeric(20, 4) NOT NULL,
	"interest_rate_pct" numeric(10, 4) NOT NULL,
	"margin_call_ltv_pct" numeric(10, 4) NOT NULL,
	"utilisation_pct_current" numeric(10, 4) NOT NULL
);
CREATE TABLE "raw"."credit_facility_snapshots" (
	"facility_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"drawn" numeric(20, 4) NOT NULL,
	"collateral_market_value" numeric(20, 4) NOT NULL,
	"lending_value" numeric(20, 4) NOT NULL,
	"ltv_pct" numeric(10, 4) NOT NULL,
	"headroom" numeric(20, 4) NOT NULL,
	CONSTRAINT "credit_facility_snapshots_facility_id_snapshot_date_pk" PRIMARY KEY("facility_id","snapshot_date")
);
CREATE TABLE "raw"."event_log" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_date" date NOT NULL,
	"event_type" text NOT NULL,
	"region" text NOT NULL,
	"description" text NOT NULL,
	"primary_transmission" text NOT NULL,
	"severity" text NOT NULL,
	"ordinal" integer NOT NULL
);
CREATE TABLE "raw"."holdings" (
	"holding_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "raw"."holdings_holding_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"snapshot_date" date NOT NULL,
	"portfolio_id" text NOT NULL,
	"client_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"instrument_name" text NOT NULL,
	"asset_class" text NOT NULL,
	"sub_asset_class" text NOT NULL,
	"sector" text,
	"region" text NOT NULL,
	"instrument_ccy" text NOT NULL,
	"quantity" numeric(20, 4) NOT NULL,
	"price_local" numeric(20, 4) NOT NULL,
	"market_value_local" numeric(20, 4) NOT NULL,
	"portfolio_ccy" text NOT NULL,
	"market_value_base" numeric(20, 4) NOT NULL,
	"market_value_usd" numeric(20, 4) NOT NULL,
	"weight_pct" numeric(10, 4) NOT NULL,
	"avg_cost_local" numeric(20, 4),
	"cost_basis_base" numeric(20, 4),
	"unrealised_pnl_base" numeric(20, 4),
	"unrealised_pnl_pct" numeric(10, 4),
	"lending_value_base" numeric(20, 4) NOT NULL,
	"advance_rate_pct" numeric(10, 4) NOT NULL,
	"liquidity_tier" text NOT NULL,
	"valuation_date" date NOT NULL,
	"acquired_date" date NOT NULL
);
CREATE TABLE "raw"."instrument_prices" (
	"instrument_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"price_local" numeric(20, 4) NOT NULL,
	CONSTRAINT "instrument_prices_instrument_id_snapshot_date_pk" PRIMARY KEY("instrument_id","snapshot_date")
);
CREATE TABLE "raw"."instruments" (
	"instrument_id" text PRIMARY KEY NOT NULL,
	"instrument_name" text NOT NULL,
	"asset_class" text NOT NULL,
	"sub_asset_class" text NOT NULL,
	"sector" text,
	"region" text NOT NULL,
	"currency" text NOT NULL,
	"liquidity_tier" text NOT NULL,
	"underlying_reference" text,
	"sustainability_excluded" boolean NOT NULL,
	"concentration_limit_applies" boolean NOT NULL
);
CREATE TABLE "raw"."mandates" (
	"mandate_code" text NOT NULL,
	"mandate_name" text NOT NULL,
	"asset_class" text NOT NULL,
	"min_pct" numeric(10, 4) NOT NULL,
	"target_pct" numeric(10, 4) NOT NULL,
	"max_pct" numeric(10, 4) NOT NULL,
	"max_single_position_pct" numeric(10, 4) NOT NULL,
	"mandate_notes" text NOT NULL,
	CONSTRAINT "mandates_mandate_code_asset_class_pk" PRIMARY KEY("mandate_code","asset_class")
);
CREATE TABLE "raw"."market_context" (
	"snapshot_date" date NOT NULL,
	"series_id" text NOT NULL,
	"series_name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"value" numeric(20, 6) NOT NULL,
	"snapshot_label" text NOT NULL,
	CONSTRAINT "market_context_series_id_snapshot_date_pk" PRIMARY KEY("series_id","snapshot_date")
);
CREATE TABLE "raw"."planned_cash_needs" (
	"need_id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"description" text NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"due_from" date NOT NULL,
	"due_to" date NOT NULL,
	"recurrence" text NOT NULL,
	"certainty" text NOT NULL
);
CREATE TABLE "raw"."portfolio_aum" (
	"portfolio_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"aum_base" numeric(20, 4) NOT NULL,
	CONSTRAINT "portfolio_aum_portfolio_id_snapshot_date_pk" PRIMARY KEY("portfolio_id","snapshot_date")
);
CREATE TABLE "raw"."portfolios" (
	"portfolio_id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"portfolio_name" text NOT NULL,
	"mandate_code" text NOT NULL,
	"mandate_name" text NOT NULL,
	"service_model" text NOT NULL,
	"base_currency" text NOT NULL,
	"inception_date" date NOT NULL,
	"benchmark" text NOT NULL,
	"aum_usd_current" numeric(20, 4) NOT NULL
);
CREATE TABLE "raw"."rm_notes" (
	"note_id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"note_date" date NOT NULL,
	"rm_id" text NOT NULL,
	"rm_name" text NOT NULL,
	"channel" text NOT NULL,
	"note" text NOT NULL
);
CREATE TABLE "raw"."snapshots" (
	"snapshot_date" date PRIMARY KEY NOT NULL,
	"ordinal" integer NOT NULL,
	"label" text NOT NULL
);
CREATE TABLE "raw"."transactions" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"trade_date" date NOT NULL,
	"settlement_date" date NOT NULL,
	"portfolio_id" text NOT NULL,
	"client_id" text NOT NULL,
	"transaction_type" text NOT NULL,
	"instrument_id" text,
	"instrument_name" text,
	"quantity" numeric(20, 4),
	"price_local" numeric(20, 4),
	"currency" text NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"narrative" text NOT NULL
);
CREATE TABLE "derived"."data_quality_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"load_run_id" uuid NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"client_id" text,
	"message" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "derived"."load_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"dataset_today" text NOT NULL,
	"source_dir" text NOT NULL,
	"row_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issue_count" integer DEFAULT 0 NOT NULL,
	"error" text
);
ALTER TABLE "raw"."commitments" ADD CONSTRAINT "commitments_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."commitments" ADD CONSTRAINT "commitments_portfolio_id_portfolios_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "raw"."portfolios"("portfolio_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."credit_facilities" ADD CONSTRAINT "credit_facilities_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."credit_facilities" ADD CONSTRAINT "credit_facilities_collateral_portfolio_id_portfolios_portfolio_id_fk" FOREIGN KEY ("collateral_portfolio_id") REFERENCES "raw"."portfolios"("portfolio_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."credit_facility_snapshots" ADD CONSTRAINT "credit_facility_snapshots_facility_id_credit_facilities_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "raw"."credit_facilities"("facility_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."credit_facility_snapshots" ADD CONSTRAINT "credit_facility_snapshots_snapshot_date_snapshots_snapshot_date_fk" FOREIGN KEY ("snapshot_date") REFERENCES "raw"."snapshots"("snapshot_date") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."holdings" ADD CONSTRAINT "holdings_snapshot_date_snapshots_snapshot_date_fk" FOREIGN KEY ("snapshot_date") REFERENCES "raw"."snapshots"("snapshot_date") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."holdings" ADD CONSTRAINT "holdings_portfolio_id_portfolios_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "raw"."portfolios"("portfolio_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."holdings" ADD CONSTRAINT "holdings_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."holdings" ADD CONSTRAINT "holdings_instrument_id_instruments_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "raw"."instruments"("instrument_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."instrument_prices" ADD CONSTRAINT "instrument_prices_instrument_id_instruments_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "raw"."instruments"("instrument_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."instrument_prices" ADD CONSTRAINT "instrument_prices_snapshot_date_snapshots_snapshot_date_fk" FOREIGN KEY ("snapshot_date") REFERENCES "raw"."snapshots"("snapshot_date") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."market_context" ADD CONSTRAINT "market_context_snapshot_date_snapshots_snapshot_date_fk" FOREIGN KEY ("snapshot_date") REFERENCES "raw"."snapshots"("snapshot_date") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."planned_cash_needs" ADD CONSTRAINT "planned_cash_needs_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."portfolio_aum" ADD CONSTRAINT "portfolio_aum_portfolio_id_portfolios_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "raw"."portfolios"("portfolio_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."portfolio_aum" ADD CONSTRAINT "portfolio_aum_snapshot_date_snapshots_snapshot_date_fk" FOREIGN KEY ("snapshot_date") REFERENCES "raw"."snapshots"("snapshot_date") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."portfolios" ADD CONSTRAINT "portfolios_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."rm_notes" ADD CONSTRAINT "rm_notes_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."transactions" ADD CONSTRAINT "transactions_portfolio_id_portfolios_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "raw"."portfolios"("portfolio_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."transactions" ADD CONSTRAINT "transactions_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."transactions" ADD CONSTRAINT "transactions_instrument_id_instruments_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "raw"."instruments"("instrument_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "derived"."data_quality_issues" ADD CONSTRAINT "data_quality_issues_load_run_id_load_runs_id_fk" FOREIGN KEY ("load_run_id") REFERENCES "derived"."load_runs"("id") ON DELETE cascade ON UPDATE no action;CREATE UNIQUE INDEX "holdings_unique_position" ON "raw"."holdings" USING btree ("portfolio_id","snapshot_date","instrument_id");CREATE INDEX "holdings_client_snapshot_idx" ON "raw"."holdings" USING btree ("client_id","snapshot_date");CREATE INDEX "holdings_instrument_idx" ON "raw"."holdings" USING btree ("instrument_id");CREATE INDEX "portfolios_client_idx" ON "raw"."portfolios" USING btree ("client_id");CREATE INDEX "rm_notes_client_idx" ON "raw"."rm_notes" USING btree ("client_id","note_date");CREATE INDEX "transactions_client_date_idx" ON "raw"."transactions" USING btree ("client_id","trade_date");CREATE INDEX "transactions_portfolio_idx" ON "raw"."transactions" USING btree ("portfolio_id");CREATE INDEX "dq_issues_run_idx" ON "derived"."data_quality_issues" USING btree ("load_run_id");CREATE INDEX "dq_issues_client_idx" ON "derived"."data_quality_issues" USING btree ("client_id");CREATE INDEX "dq_issues_code_idx" ON "derived"."data_quality_issues" USING btree ("code");

-- ============================================================================
-- 0001 · 0001_cultured_sabra · 2026-09-05
-- ============================================================================
CREATE TABLE "derived"."client_factual" (
	"client_id" text PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"facts" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
CREATE TABLE "derived"."vector_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dataset_today" text NOT NULL,
	"engine_version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"client_count" integer NOT NULL
);
ALTER TABLE "derived"."client_factual" ADD CONSTRAINT "client_factual_run_id_vector_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "derived"."vector_runs"("id") ON DELETE cascade ON UPDATE no action;ALTER TABLE "derived"."client_vectors" ADD CONSTRAINT "client_vectors_run_id_vector_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "derived"."vector_runs"("id") ON DELETE cascade ON UPDATE no action;

-- ============================================================================
-- 0002 · 0002_silly_sauron · 2026-09-05
-- ============================================================================
CREATE TABLE "derived"."issuer_groups" (
	"instrument_id" text PRIMARY KEY NOT NULL,
	"exposure_name" text NOT NULL
);
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
CREATE INDEX "lookthrough_instrument_idx" ON "derived"."lookthrough_legs" USING btree ("instrument_id");

-- ============================================================================
-- 0003 · 0003_nifty_namor · 2026-09-05
-- ============================================================================
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
CREATE TABLE "derived"."signal_rules" (
	"event_id" text PRIMARY KEY NOT NULL,
	"match" jsonb NOT NULL,
	"shock" jsonb NOT NULL,
	"note" text NOT NULL
);
CREATE TABLE "derived"."signal_thresholds" (
	"series_id" text PRIMARY KEY NOT NULL,
	"threshold" numeric(12, 4) NOT NULL
);
CREATE INDEX "impact_runs_client_idx" ON "derived"."impact_runs" USING btree ("client_id","created_at");

-- ============================================================================
-- 0004 · 0004_dark_ser_duncan · 2026-09-05
-- ============================================================================
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
ALTER TABLE "derived"."rubric_assessments" ADD CONSTRAINT "rubric_assessments_vector_run_id_vector_runs_id_fk" FOREIGN KEY ("vector_run_id") REFERENCES "derived"."vector_runs"("id") ON DELETE set null ON UPDATE no action;ALTER TABLE "derived"."rubric_overrides" ADD CONSTRAINT "rubric_overrides_assessment_id_rubric_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "derived"."rubric_assessments"("id") ON DELETE cascade ON UPDATE no action;CREATE INDEX "audit_client_idx" ON "derived"."audit_events" USING btree ("client_id","created_at");CREATE INDEX "audit_kind_idx" ON "derived"."audit_events" USING btree ("kind");CREATE INDEX "llm_traces_client_idx" ON "derived"."llm_traces" USING btree ("client_id","created_at");CREATE INDEX "rubric_client_idx" ON "derived"."rubric_assessments" USING btree ("client_id","created_at");CREATE INDEX "rubric_overrides_client_idx" ON "derived"."rubric_overrides" USING btree ("client_id");

-- ============================================================================
-- 0005 · 0005_eminent_lilandra · 2026-09-05
-- ============================================================================
DROP TABLE "derived"."signal_thresholds" CASCADE;

-- ============================================================================
-- 0006 · 0006_zippy_bedlam · 2026-09-05
-- ============================================================================
CREATE TABLE "derived"."scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"ordinal" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"shock" jsonb NOT NULL,
	"horizon_days" integer NOT NULL,
	"probability_note" text NOT NULL
);
CREATE TABLE "derived"."signal_series_rules" (
	"series_id" text PRIMARY KEY NOT NULL,
	"unit" text NOT NULL,
	"threshold" numeric(12, 4) NOT NULL,
	"match" jsonb NOT NULL,
	"shock" jsonb NOT NULL
);

-- ============================================================================
-- 0007 · 0007_windy_martin_li · 2026-09-05
-- ============================================================================
CREATE TABLE "derived"."action_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" text NOT NULL,
	"client_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"actor" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "action_decisions_client_idx" ON "derived"."action_decisions" USING btree ("client_id","created_at");CREATE INDEX "action_decisions_action_idx" ON "derived"."action_decisions" USING btree ("action_id");

-- ============================================================================
-- 0008 · 0008_absurd_zaladane · 2026-09-05
-- ============================================================================
CREATE TABLE "derived"."alert_triage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" text NOT NULL,
	"client_id" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
CREATE INDEX "alert_triage_client_idx" ON "derived"."alert_triage" USING btree ("client_id","created_at");CREATE INDEX "outreach_client_idx" ON "derived"."outreach" USING btree ("client_id","created_at");

-- ============================================================================
-- 0009 · 0009_living_sinister_six · 2026-09-06
-- ============================================================================
CREATE TABLE "derived"."call_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"policy" jsonb NOT NULL
);

-- ============================================================================
-- 0010 · 0010_skinny_molten_man · 2026-09-06
-- ============================================================================
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
CREATE TABLE "derived"."reference_docs" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"doc" jsonb NOT NULL
);
CREATE INDEX "promises_client_idx" ON "derived"."promises" USING btree ("client_id","status");CREATE UNIQUE INDEX "promises_fingerprint_idx" ON "derived"."promises" USING btree ("fingerprint");

-- ============================================================================
-- 0011 · 0011_steady_blizzard · 2026-09-06
-- ============================================================================
CREATE SCHEMA "access";
CREATE SCHEMA "ingest";
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
CREATE TABLE "raw"."rms" (
	"rm_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"desk" text DEFAULT '' NOT NULL,
	"team_id" text,
	"email" text,
	"status" text DEFAULT 'active' NOT NULL
);
CREATE TABLE "raw"."teams" (
	"team_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"desk" text DEFAULT '' NOT NULL,
	"head_rm_id" text
);
CREATE TABLE "access"."roles" (
	"role" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
CREATE TABLE "access"."user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
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
CREATE TABLE "ingest"."change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"kind" text NOT NULL,
	"load_run_id" uuid,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
ALTER TABLE "derived"."load_runs" ADD COLUMN "mode" text DEFAULT 'full' NOT NULL;ALTER TABLE "raw"."rm_assignments" ADD CONSTRAINT "rm_assignments_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."rm_assignments" ADD CONSTRAINT "rm_assignments_rm_id_rms_rm_id_fk" FOREIGN KEY ("rm_id") REFERENCES "raw"."rms"("rm_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "raw"."rms" ADD CONSTRAINT "rms_team_id_teams_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "raw"."teams"("team_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "access"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "access"."users"("user_id") ON DELETE no action ON UPDATE no action;ALTER TABLE "access"."user_roles" ADD CONSTRAINT "user_roles_role_roles_role_fk" FOREIGN KEY ("role") REFERENCES "access"."roles"("role") ON DELETE no action ON UPDATE no action;ALTER TABLE "access"."users" ADD CONSTRAINT "users_rm_id_rms_rm_id_fk" FOREIGN KEY ("rm_id") REFERENCES "raw"."rms"("rm_id") ON DELETE no action ON UPDATE no action;CREATE INDEX "rm_assignments_client_idx" ON "raw"."rm_assignments" USING btree ("client_id","valid_to");CREATE INDEX "rm_assignments_rm_idx" ON "raw"."rm_assignments" USING btree ("rm_id","valid_to");CREATE INDEX "change_log_client_idx" ON "ingest"."change_log" USING btree ("client_id","applied_at");CREATE INDEX "staging_status_idx" ON "ingest"."staging_messages" USING btree ("status","received_at");

-- ============================================================================
-- 0012 · 0012_access_rls · 2026-09-06
-- ============================================================================
-- Row-level security: every client-owned row is invisible unless the connection declares a scope.
--   app.scope  = 'all'  (loaders, migrations, analytics service)
--              | 'own'  (an RM: clients assigned to app.rm_id today)
--              | 'team' (a team head: clients assigned to any RM in app.team_id)
--              | 'none' (the API's base pool; nothing visible until a request is authenticated)
-- Policies use FORCE so the table owner is bound too. Access tables carry no client data and no RLS.

SELECT set_config('app.scope', 'all', false);

INSERT INTO "access"."roles" ("role", "scope", "description") VALUES
  ('rm', 'own', 'Relationship manager: the clients assigned to them'),
  ('team_head', 'team', 'Team head: every client assigned to an RM in the team'),
  ('checker', 'own', 'May approve as the second pair of eyes on money-moving actions'),
  ('admin', 'all', 'Platform administrator: every client')
ON CONFLICT ("role") DO NOTHING;

CREATE OR REPLACE FUNCTION access.current_scope() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.scope', true), ''), 'none')
$$;

-- Clients the current connection may see. Assignments are valid on the real date, not the replay clock.
CREATE OR REPLACE FUNCTION access.entitled_clients() RETURNS SETOF text
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT a.client_id
  FROM raw.rm_assignments a
  WHERE (a.valid_to IS NULL OR a.valid_to >= current_date)
    AND a.valid_from <= current_date
    AND (
      (access.current_scope() = 'own'
        AND a.rm_id = current_setting('app.rm_id', true))
      OR
      (access.current_scope() = 'team'
        AND a.rm_id IN (SELECT r.rm_id FROM raw.rms r WHERE r.team_id = current_setting('app.team_id', true)))
    )
$$;

CREATE OR REPLACE FUNCTION access.can_see(p_client_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT access.current_scope() = 'all'
      OR (p_client_id IS NOT NULL AND p_client_id IN (SELECT access.entitled_clients()))
$$;

-- Tables keyed by client_id (not null).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'raw.clients', 'raw.portfolios', 'raw.holdings', 'raw.transactions', 'raw.credit_facilities',
    'raw.commitments', 'raw.planned_cash_needs', 'raw.rm_notes', 'raw.rm_assignments',
    'derived.client_factual', 'derived.client_vectors', 'derived.rubric_assessments',
    'derived.rubric_overrides', 'derived.impact_runs', 'derived.action_decisions',
    'derived.alert_triage', 'derived.outreach', 'derived.promises'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_client ON %s', t);
    EXECUTE format('CREATE POLICY rls_client ON %s FOR ALL USING (access.can_see(client_id)) WITH CHECK (access.can_see(client_id))', t);
  END LOOP;
END $$;

-- Tables where client_id may be null: book-level rows stay visible to everyone authenticated.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'derived.audit_events', 'derived.llm_traces', 'derived.data_quality_issues', 'ingest.change_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_client_nullable ON %s', t);
    EXECUTE format('CREATE POLICY rls_client_nullable ON %s FOR ALL USING (access.current_scope() <> ''none'' AND (client_id IS NULL OR access.can_see(client_id))) WITH CHECK (access.current_scope() <> ''none'' AND (client_id IS NULL OR access.can_see(client_id)))', t);
  END LOOP;
END $$;

-- Snapshot tables without a client_id: visible through their parent.
ALTER TABLE raw.credit_facility_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.credit_facility_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_via_facility ON raw.credit_facility_snapshots;
CREATE POLICY rls_via_facility ON raw.credit_facility_snapshots FOR ALL
  USING (access.current_scope() = 'all' OR EXISTS (
    SELECT 1 FROM raw.credit_facilities f
    WHERE f.facility_id = credit_facility_snapshots.facility_id AND access.can_see(f.client_id)))
  WITH CHECK (access.current_scope() = 'all' OR EXISTS (
    SELECT 1 FROM raw.credit_facilities f
    WHERE f.facility_id = credit_facility_snapshots.facility_id AND access.can_see(f.client_id)));
ALTER TABLE raw.portfolio_aum ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.portfolio_aum FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_via_portfolio ON raw.portfolio_aum;
CREATE POLICY rls_via_portfolio ON raw.portfolio_aum FOR ALL
  USING (access.current_scope() = 'all' OR EXISTS (
    SELECT 1 FROM raw.portfolios p
    WHERE p.portfolio_id = portfolio_aum.portfolio_id AND access.can_see(p.client_id)))
  WITH CHECK (access.current_scope() = 'all' OR EXISTS (
    SELECT 1 FROM raw.portfolios p
    WHERE p.portfolio_id = portfolio_aum.portfolio_id AND access.can_see(p.client_id)));

-- Who sees what, for operators and tests.
CREATE OR REPLACE VIEW access.entitlements AS
  SELECT a.rm_id, r.name AS rm_name, r.team_id, a.client_id, a.role, a.valid_from, a.valid_to
  FROM raw.rm_assignments a
  JOIN raw.rms r ON r.rm_id = a.rm_id
  WHERE a.valid_to IS NULL OR a.valid_to >= current_date;

-- Dead-letter view for the ingest landing zone.
CREATE OR REPLACE VIEW ingest.dead_letters AS
  SELECT id, topic, type, idempotency_key, error, received_at
  FROM ingest.staging_messages
  WHERE status = 'rejected'
  ORDER BY received_at DESC;

-- ============================================================================
-- 0013 · 0013_rls_assignments_open · 2026-09-06
-- ============================================================================
-- Assignments and RMs are access metadata: the entitlement function reads them, so they cannot be
-- row-secured themselves (0012 made access.entitled_clients() recurse through its own policy).
ALTER TABLE raw.rm_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE raw.rm_assignments NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_client ON raw.rm_assignments;

COMMIT;
