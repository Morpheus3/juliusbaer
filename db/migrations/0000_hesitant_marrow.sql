CREATE SCHEMA "raw";
--> statement-breakpoint
CREATE SCHEMA "derived";
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "raw"."instrument_prices" (
	"instrument_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"price_local" numeric(20, 4) NOT NULL,
	CONSTRAINT "instrument_prices_instrument_id_snapshot_date_pk" PRIMARY KEY("instrument_id","snapshot_date")
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "raw"."portfolio_aum" (
	"portfolio_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"aum_base" numeric(20, 4) NOT NULL,
	CONSTRAINT "portfolio_aum_portfolio_id_snapshot_date_pk" PRIMARY KEY("portfolio_id","snapshot_date")
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "raw"."rm_notes" (
	"note_id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"note_date" date NOT NULL,
	"rm_id" text NOT NULL,
	"rm_name" text NOT NULL,
	"channel" text NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw"."snapshots" (
	"snapshot_date" date PRIMARY KEY NOT NULL,
	"ordinal" integer NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "raw"."commitments" ADD CONSTRAINT "commitments_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."commitments" ADD CONSTRAINT "commitments_portfolio_id_portfolios_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "raw"."portfolios"("portfolio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."credit_facilities" ADD CONSTRAINT "credit_facilities_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."credit_facilities" ADD CONSTRAINT "credit_facilities_collateral_portfolio_id_portfolios_portfolio_id_fk" FOREIGN KEY ("collateral_portfolio_id") REFERENCES "raw"."portfolios"("portfolio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."credit_facility_snapshots" ADD CONSTRAINT "credit_facility_snapshots_facility_id_credit_facilities_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "raw"."credit_facilities"("facility_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."credit_facility_snapshots" ADD CONSTRAINT "credit_facility_snapshots_snapshot_date_snapshots_snapshot_date_fk" FOREIGN KEY ("snapshot_date") REFERENCES "raw"."snapshots"("snapshot_date") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."holdings" ADD CONSTRAINT "holdings_snapshot_date_snapshots_snapshot_date_fk" FOREIGN KEY ("snapshot_date") REFERENCES "raw"."snapshots"("snapshot_date") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."holdings" ADD CONSTRAINT "holdings_portfolio_id_portfolios_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "raw"."portfolios"("portfolio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."holdings" ADD CONSTRAINT "holdings_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."holdings" ADD CONSTRAINT "holdings_instrument_id_instruments_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "raw"."instruments"("instrument_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."instrument_prices" ADD CONSTRAINT "instrument_prices_instrument_id_instruments_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "raw"."instruments"("instrument_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."instrument_prices" ADD CONSTRAINT "instrument_prices_snapshot_date_snapshots_snapshot_date_fk" FOREIGN KEY ("snapshot_date") REFERENCES "raw"."snapshots"("snapshot_date") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."market_context" ADD CONSTRAINT "market_context_snapshot_date_snapshots_snapshot_date_fk" FOREIGN KEY ("snapshot_date") REFERENCES "raw"."snapshots"("snapshot_date") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."planned_cash_needs" ADD CONSTRAINT "planned_cash_needs_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."portfolio_aum" ADD CONSTRAINT "portfolio_aum_portfolio_id_portfolios_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "raw"."portfolios"("portfolio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."portfolio_aum" ADD CONSTRAINT "portfolio_aum_snapshot_date_snapshots_snapshot_date_fk" FOREIGN KEY ("snapshot_date") REFERENCES "raw"."snapshots"("snapshot_date") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."portfolios" ADD CONSTRAINT "portfolios_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."rm_notes" ADD CONSTRAINT "rm_notes_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."transactions" ADD CONSTRAINT "transactions_portfolio_id_portfolios_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "raw"."portfolios"("portfolio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."transactions" ADD CONSTRAINT "transactions_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "raw"."clients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw"."transactions" ADD CONSTRAINT "transactions_instrument_id_instruments_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "raw"."instruments"("instrument_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived"."data_quality_issues" ADD CONSTRAINT "data_quality_issues_load_run_id_load_runs_id_fk" FOREIGN KEY ("load_run_id") REFERENCES "derived"."load_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_unique_position" ON "raw"."holdings" USING btree ("portfolio_id","snapshot_date","instrument_id");--> statement-breakpoint
CREATE INDEX "holdings_client_snapshot_idx" ON "raw"."holdings" USING btree ("client_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "holdings_instrument_idx" ON "raw"."holdings" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "portfolios_client_idx" ON "raw"."portfolios" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "rm_notes_client_idx" ON "raw"."rm_notes" USING btree ("client_id","note_date");--> statement-breakpoint
CREATE INDEX "transactions_client_date_idx" ON "raw"."transactions" USING btree ("client_id","trade_date");--> statement-breakpoint
CREATE INDEX "transactions_portfolio_idx" ON "raw"."transactions" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "dq_issues_run_idx" ON "derived"."data_quality_issues" USING btree ("load_run_id");--> statement-breakpoint
CREATE INDEX "dq_issues_client_idx" ON "derived"."data_quality_issues" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "dq_issues_code_idx" ON "derived"."data_quality_issues" USING btree ("code");