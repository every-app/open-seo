CREATE TABLE "indexnow_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"public_key" text NOT NULL,
	"key_location" text NOT NULL,
	"key_verified_at" text,
	"generated_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexnow_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"config_id" text NOT NULL,
	"status" text NOT NULL,
	"requested_url_count" integer NOT NULL,
	"unique_url_count" integer NOT NULL,
	"chunk_count" integer NOT NULL,
	"received_chunk_count" integer NOT NULL,
	"rejected_chunk_count" integer NOT NULL,
	"failed_chunk_count" integer NOT NULL,
	"http_statuses_json" text NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "indexnow_configs" ADD CONSTRAINT "indexnow_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indexnow_configs" ADD CONSTRAINT "indexnow_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indexnow_submissions" ADD CONSTRAINT "indexnow_submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indexnow_submissions" ADD CONSTRAINT "indexnow_submissions_config_id_indexnow_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."indexnow_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "indexnow_configs_project_idx" ON "indexnow_configs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "indexnow_configs_organization_idx" ON "indexnow_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "indexnow_submissions_project_created_idx" ON "indexnow_submissions" USING btree ("project_id","created_at");