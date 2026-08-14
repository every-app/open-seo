CREATE TABLE "competitor_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"keyword_key" text NOT NULL,
	"keywords_json" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"items_json" text NOT NULL,
	"fetched_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_snapshots" ADD CONSTRAINT "competitor_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competitor_snapshots_lookup_idx" ON "competitor_snapshots" USING btree ("project_id","keyword_key","location_code","language_code","fetched_at");