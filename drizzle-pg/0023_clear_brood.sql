CREATE TABLE "first_party_signal_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"payload_digest" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"processing_lease_id" text,
	"processing_lease_expires_at" text,
	"received_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"completed_at" text,
	CONSTRAINT "first_party_signal_batches_status_check" CHECK ("first_party_signal_batches"."status" IN ('pending', 'complete', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "first_party_signal_daily_aggregates" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_receipt_id" text NOT NULL,
	"processing_attempt_id" text NOT NULL,
	"landing_path" text NOT NULL,
	"search_started" integer DEFAULT 0 NOT NULL,
	"search_completed" integer DEFAULT 0 NOT NULL,
	"search_no_results" integer DEFAULT 0 NOT NULL,
	"registrations_completed" integer DEFAULT 0 NOT NULL,
	"checkout_started" integer DEFAULT 0 NOT NULL,
	"payments_completed" integer DEFAULT 0 NOT NULL,
	"received_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "first_party_signal_daily_nonnegative_check" CHECK ("first_party_signal_daily_aggregates"."search_started" >= 0 AND "first_party_signal_daily_aggregates"."search_completed" >= 0 AND "first_party_signal_daily_aggregates"."search_no_results" >= 0 AND "first_party_signal_daily_aggregates"."registrations_completed" >= 0 AND "first_party_signal_daily_aggregates"."checkout_started" >= 0 AND "first_party_signal_daily_aggregates"."payments_completed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "first_party_signal_source_paths" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"path" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "first_party_signal_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"secret_hint" text NOT NULL,
	"created_by_user_id" text,
	"revoked_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "first_party_signal_batches" ADD CONSTRAINT "first_party_signal_batches_source_id_first_party_signal_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."first_party_signal_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "first_party_signal_daily_aggregates" ADD CONSTRAINT "first_party_signal_daily_aggregates_batch_receipt_id_first_party_signal_batches_id_fk" FOREIGN KEY ("batch_receipt_id") REFERENCES "public"."first_party_signal_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "first_party_signal_source_paths" ADD CONSTRAINT "first_party_signal_source_paths_source_id_first_party_signal_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."first_party_signal_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "first_party_signal_sources" ADD CONSTRAINT "first_party_signal_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "first_party_signal_sources" ADD CONSTRAINT "first_party_signal_sources_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "first_party_signal_sources" ADD CONSTRAINT "first_party_signal_sources_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "first_party_signal_batches_source_batch_idx" ON "first_party_signal_batches" USING btree ("source_id","batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "first_party_signal_batches_source_date_idx" ON "first_party_signal_batches" USING btree ("source_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "first_party_signal_daily_batch_path_idx" ON "first_party_signal_daily_aggregates" USING btree ("batch_receipt_id","processing_attempt_id","landing_path");--> statement-breakpoint
CREATE UNIQUE INDEX "first_party_signal_source_paths_unique_idx" ON "first_party_signal_source_paths" USING btree ("source_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "first_party_signal_sources_project_idx" ON "first_party_signal_sources" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "first_party_signal_sources_org_idx" ON "first_party_signal_sources" USING btree ("organization_id");