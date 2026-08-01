CREATE TABLE "geo_grid_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"business_name" text NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"grid_size" integer DEFAULT 3 NOT NULL,
	"grid_spacing" real DEFAULT 1 NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"schedule_interval" text DEFAULT 'weekly' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_checked_at" text,
	"next_check_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_grid_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"keyword" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_grid_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"started_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "geo_grid_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"keyword_id" text NOT NULL,
	"keyword" text NOT NULL,
	"grid_x" integer NOT NULL,
	"grid_y" integer NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"position" integer,
	"checked_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geo_grid_configs" ADD CONSTRAINT "geo_grid_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_grid_keywords" ADD CONSTRAINT "geo_grid_keywords_config_id_geo_grid_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."geo_grid_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_grid_runs" ADD CONSTRAINT "geo_grid_runs_config_id_geo_grid_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."geo_grid_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_grid_runs" ADD CONSTRAINT "geo_grid_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_grid_snapshots" ADD CONSTRAINT "geo_grid_snapshots_run_id_geo_grid_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."geo_grid_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_grid_snapshots" ADD CONSTRAINT "geo_grid_snapshots_keyword_id_geo_grid_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."geo_grid_keywords"("id") ON DELETE cascade ON UPDATE no action;