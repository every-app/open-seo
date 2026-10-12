CREATE TABLE "seo_history_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"period_start" text,
	"period_end" text,
	"source" text DEFAULT 'mcp' NOT NULL,
	"payload" text NOT NULL,
	"captured_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seo_history_snapshots" ADD CONSTRAINT "seo_history_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seo_history_snapshots_project_kind_captured_idx" ON "seo_history_snapshots" USING btree ("project_id","kind","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_history_snapshots_project_kind_period_idx" ON "seo_history_snapshots" USING btree ("project_id","kind","period_start") WHERE "seo_history_snapshots"."period_start" IS NOT NULL;