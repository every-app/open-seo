CREATE TABLE "brand_lookup_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"query" text NOT NULL,
	"resolved_target" text NOT NULL,
	"scope" text,
	"competitors" text DEFAULT '[]' NOT NULL,
	"total_mentions" integer,
	"total_ai_search_volume" integer,
	"share_of_voice_percent" integer,
	"payload" text NOT NULL,
	"fetched_at" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_lookup_runs" ADD CONSTRAINT "brand_lookup_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_lookup_runs_project_created_idx" ON "brand_lookup_runs" USING btree ("project_id","created_at");