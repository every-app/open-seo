CREATE TABLE "ps_platforms" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"domain" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"ai_verdict" text,
	"ai_can_profile" boolean,
	"ai_can_post" boolean,
	"ai_reason" text,
	"ai_classified_at" text,
	"example_keyword" text,
	"example_url" text,
	"example_title" text,
	"best_position" integer,
	"seen_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"last_seen_at" text,
	"classified_at" text
);
--> statement-breakpoint
CREATE TABLE "ps_serp_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"run_key" text NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"device" text NOT NULL,
	"position" integer NOT NULL,
	"domain" text NOT NULL,
	"result_key" text NOT NULL,
	"url" text,
	"title" text,
	"observed_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ps_platforms" ADD CONSTRAINT "ps_platforms_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_serp_observations" ADD CONSTRAINT "ps_serp_observations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_serp_observations" ADD CONSTRAINT "ps_serp_observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ps_platforms_org_domain_idx" ON "ps_platforms" USING btree ("organization_id","domain");--> statement-breakpoint
CREATE INDEX "ps_platforms_org_status_idx" ON "ps_platforms" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ps_serp_observations_run_result_idx" ON "ps_serp_observations" USING btree ("organization_id","run_key","result_key");--> statement-breakpoint
CREATE INDEX "ps_serp_observations_keyword_idx" ON "ps_serp_observations" USING btree ("organization_id","keyword","location_code","language_code","observed_at");