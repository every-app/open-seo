CREATE TABLE "ga4_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"property_display_name" text NOT NULL,
	"property_time_zone" text NOT NULL,
	"property_currency_code" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"ga4_account_id" text NOT NULL,
	"connected_account_email" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_activation_state" ADD COLUMN "ga4_card_dismissed_at" text;--> statement-breakpoint
ALTER TABLE "ga4_connections" ADD CONSTRAINT "ga4_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga4_connections" ADD CONSTRAINT "ga4_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ga4_connections_project_idx" ON "ga4_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ga4_connections_organization_idx" ON "ga4_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ga4_connections_connector_idx" ON "ga4_connections" USING btree ("connected_by_user_id","ga4_account_id");