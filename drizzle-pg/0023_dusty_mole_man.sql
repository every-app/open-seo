CREATE TABLE "clarity_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"encrypted_api_token" text NOT NULL,
	"token_hint" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clarity_report_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"report_kind" text NOT NULL,
	"num_of_days" integer NOT NULL,
	"connection_id" text NOT NULL,
	"response_json" text NOT NULL,
	"fetched_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clarity_report_refresh_leases" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"report_kind" text NOT NULL,
	"num_of_days" integer NOT NULL,
	"connection_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"expires_at" text NOT NULL,
	"error_code" text
);
--> statement-breakpoint
ALTER TABLE "clarity_connections" ADD CONSTRAINT "clarity_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarity_connections" ADD CONSTRAINT "clarity_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarity_report_cache" ADD CONSTRAINT "clarity_report_cache_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarity_report_cache" ADD CONSTRAINT "clarity_report_cache_connection_id_clarity_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."clarity_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarity_report_refresh_leases" ADD CONSTRAINT "clarity_report_refresh_leases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarity_report_refresh_leases" ADD CONSTRAINT "clarity_report_refresh_leases_connection_id_clarity_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."clarity_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clarity_connections_project_idx" ON "clarity_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "clarity_connections_organization_idx" ON "clarity_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clarity_report_cache_report_idx" ON "clarity_report_cache" USING btree ("project_id","report_kind","num_of_days");--> statement-breakpoint
CREATE INDEX "clarity_report_cache_project_idx" ON "clarity_report_cache" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "clarity_report_cache_fetched_at_idx" ON "clarity_report_cache" USING btree ("fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clarity_report_refresh_lease_report_idx" ON "clarity_report_refresh_leases" USING btree ("project_id","report_kind","num_of_days");--> statement-breakpoint
CREATE INDEX "clarity_report_refresh_lease_project_idx" ON "clarity_report_refresh_leases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "clarity_report_refresh_lease_expires_at_idx" ON "clarity_report_refresh_leases" USING btree ("expires_at");