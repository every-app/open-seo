CREATE TABLE "paa_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"scan_id" text NOT NULL,
	"seed" text NOT NULL,
	"region" text DEFAULT 'US' NOT NULL,
	"question_count" integer,
	"report" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serper_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"connected_at" text
);
--> statement-breakpoint
ALTER TABLE "paa_scans" ADD CONSTRAINT "paa_scans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paa_scans_scan_unique" ON "paa_scans" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "paa_scans_project_created_idx" ON "paa_scans" USING btree ("project_id","created_at");