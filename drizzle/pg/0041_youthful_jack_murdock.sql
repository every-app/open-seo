CREATE TABLE "web_analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"session_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"ts" text NOT NULL,
	"type" text NOT NULL,
	"name" text,
	"path" text,
	"props" text
);
--> statement-breakpoint
CREATE TABLE "web_analytics_sessions" (
	"site_id" text NOT NULL,
	"id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"started_at" text NOT NULL,
	"last_seen_at" text NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"pageviews" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"hostname" text,
	"entry_page" text,
	"exit_page" text,
	"referrer" text,
	"referrer_domain" text,
	"source" text NOT NULL,
	"channel" text NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"ref" text,
	"country" text,
	"region" text,
	"city" text,
	"browser" text,
	"os" text,
	"device" text
);
--> statement-breakpoint
CREATE TABLE "web_analytics_sites" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "web_analytics_events" ADD CONSTRAINT "web_analytics_events_site_id_web_analytics_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."web_analytics_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_analytics_sessions" ADD CONSTRAINT "web_analytics_sessions_site_id_web_analytics_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."web_analytics_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_analytics_sites" ADD CONSTRAINT "web_analytics_sites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_analytics_sites" ADD CONSTRAINT "web_analytics_sites_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_analytics_events_site_ts_idx" ON "web_analytics_events" USING btree ("site_id","ts");--> statement-breakpoint
CREATE INDEX "web_analytics_events_site_session_idx" ON "web_analytics_events" USING btree ("site_id","session_id");--> statement-breakpoint
CREATE INDEX "web_analytics_sessions_site_started_idx" ON "web_analytics_sessions" USING btree ("site_id","started_at");--> statement-breakpoint
CREATE INDEX "web_analytics_sessions_site_visitor_idx" ON "web_analytics_sessions" USING btree ("site_id","visitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "web_analytics_sites_project_idx" ON "web_analytics_sites" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "web_analytics_sites_organization_idx" ON "web_analytics_sites" USING btree ("organization_id");