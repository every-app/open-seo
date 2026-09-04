CREATE TABLE "cloudflare_analytics_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"encrypted_api_token" text NOT NULL,
	"token_hint" text NOT NULL,
	"zone_id" text NOT NULL,
	"zone_label" text,
	"traffic_available" boolean DEFAULT false NOT NULL,
	"traffic_reason" text,
	"security_events_available" boolean DEFAULT false NOT NULL,
	"security_events_reason" text,
	"crawler_access_available" boolean DEFAULT false NOT NULL,
	"crawler_access_reason" text,
	"connected_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloudflare_analytics_connections" ADD CONSTRAINT "cloudflare_analytics_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloudflare_analytics_connections" ADD CONSTRAINT "cloudflare_analytics_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloudflare_analytics_connections_project_idx" ON "cloudflare_analytics_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "cloudflare_analytics_connections_organization_idx" ON "cloudflare_analytics_connections" USING btree ("organization_id");