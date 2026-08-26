CREATE TABLE "content_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"job_id" text NOT NULL,
	"url" text NOT NULL,
	"keyword" text NOT NULL,
	"region" text DEFAULT 'US' NOT NULL,
	"score" integer,
	"grade" text,
	"classify_job_id" text,
	"page_category" text,
	"report" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onpage_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"connected_at" text
);
--> statement-breakpoint
ALTER TABLE "content_scans" ADD CONSTRAINT "content_scans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_scans_job_unique" ON "content_scans" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "content_scans_project_created_idx" ON "content_scans" USING btree ("project_id","created_at");