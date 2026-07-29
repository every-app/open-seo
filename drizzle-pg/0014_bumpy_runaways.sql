CREATE TABLE "brand_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"title" text,
	"url" text,
	"snippet" text,
	"published_at" text,
	"sentiment_score" real,
	"sentiment_label" text,
	"fetched_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_monitor_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"query" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_checked_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_mentions" ADD CONSTRAINT "brand_mentions_config_id_brand_monitor_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."brand_monitor_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_monitor_configs" ADD CONSTRAINT "brand_monitor_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_mentions_source_unique_idx" ON "brand_mentions" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "brand_mentions_config_published_idx" ON "brand_mentions" USING btree ("config_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_monitor_configs_project_query_idx" ON "brand_monitor_configs" USING btree ("project_id","query");--> statement-breakpoint
CREATE INDEX "brand_monitor_configs_project_active_idx" ON "brand_monitor_configs" USING btree ("project_id","is_active");