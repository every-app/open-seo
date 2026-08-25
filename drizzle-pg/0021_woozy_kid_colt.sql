CREATE TABLE "local_businesses" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"place_id" text,
	"cid" text,
	"feature_id" text,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"website" text,
	"primary_category" text,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"rating" real,
	"review_count" integer,
	"last_refreshed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_grid_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"center_latitude" real NOT NULL,
	"center_longitude" real NOT NULL,
	"grid_size" integer DEFAULT 7 NOT NULL,
	"radius_meters" integer DEFAULT 4828 NOT NULL,
	"distance_unit" text DEFAULT 'mi' NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"se_domain" text DEFAULT 'google.co.uk' NOT NULL,
	"search_depth" integer DEFAULT 20 NOT NULL,
	"search_places" boolean DEFAULT false NOT NULL,
	"schedule_interval" text DEFAULT 'weekly' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"next_scan_at" text,
	"archived_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_grid_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"keyword" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_grid_rankings" (
	"id" text PRIMARY KEY NOT NULL,
	"result_id" text NOT NULL,
	"rank" integer NOT NULL,
	"place_id" text,
	"cid" text,
	"feature_id" text,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"website" text,
	"primary_category" text,
	"latitude" real,
	"longitude" real,
	"rating" real,
	"review_count" integer
);
--> statement-breakpoint
CREATE TABLE "local_grid_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_point_id" text NOT NULL,
	"tracking_keyword_id" text NOT NULL,
	"keyword" text NOT NULL,
	"provider_task_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"target_rank" integer,
	"matched_by" text,
	"raw_response_key" text,
	"provider_cost_usd" real DEFAULT 0 NOT NULL,
	"error_message" text,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "local_grid_run_points" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"row_index" integer NOT NULL,
	"column_index" integer NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_grid_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"task_count" integer DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"provider_cost_usd" real DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
ALTER TABLE "local_businesses" ADD CONSTRAINT "local_businesses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_grid_configs" ADD CONSTRAINT "local_grid_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_grid_configs" ADD CONSTRAINT "local_grid_configs_business_id_local_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."local_businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_grid_keywords" ADD CONSTRAINT "local_grid_keywords_config_id_local_grid_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."local_grid_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_grid_rankings" ADD CONSTRAINT "local_grid_rankings_result_id_local_grid_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."local_grid_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_grid_results" ADD CONSTRAINT "local_grid_results_run_point_id_local_grid_run_points_id_fk" FOREIGN KEY ("run_point_id") REFERENCES "public"."local_grid_run_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_grid_run_points" ADD CONSTRAINT "local_grid_run_points_run_id_local_grid_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."local_grid_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_grid_runs" ADD CONSTRAINT "local_grid_runs_config_id_local_grid_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."local_grid_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_grid_runs" ADD CONSTRAINT "local_grid_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_businesses_project_created_idx" ON "local_businesses" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "local_businesses_project_place_id_idx" ON "local_businesses" USING btree ("project_id","place_id") WHERE "local_businesses"."place_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "local_businesses_project_cid_idx" ON "local_businesses" USING btree ("project_id","cid") WHERE "local_businesses"."cid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "local_grid_configs_project_active_created_idx" ON "local_grid_configs" USING btree ("project_id","is_active","created_at");--> statement-breakpoint
CREATE INDEX "local_grid_configs_business_idx" ON "local_grid_configs" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_grid_keywords_config_keyword_idx" ON "local_grid_keywords" USING btree ("config_id","keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "local_grid_rankings_result_rank_idx" ON "local_grid_rankings" USING btree ("result_id","rank");--> statement-breakpoint
CREATE INDEX "local_grid_rankings_place_id_idx" ON "local_grid_rankings" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "local_grid_rankings_cid_idx" ON "local_grid_rankings" USING btree ("cid");--> statement-breakpoint
CREATE UNIQUE INDEX "local_grid_results_point_keyword_idx" ON "local_grid_results" USING btree ("run_point_id","tracking_keyword_id");--> statement-breakpoint
CREATE INDEX "local_grid_results_provider_task_idx" ON "local_grid_results" USING btree ("provider_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_grid_run_points_run_cell_idx" ON "local_grid_run_points" USING btree ("run_id","row_index","column_index");--> statement-breakpoint
CREATE INDEX "local_grid_runs_config_started_idx" ON "local_grid_runs" USING btree ("config_id","started_at");--> statement-breakpoint
CREATE INDEX "local_grid_runs_project_started_idx" ON "local_grid_runs" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "local_grid_runs_one_active_per_config_idx" ON "local_grid_runs" USING btree ("config_id") WHERE "local_grid_runs"."status" IN ('pending', 'running');