CREATE TABLE "bing_ai_citation_days" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"date" text NOT NULL,
	"citations" integer NOT NULL,
	"cited_pages" integer NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bing_ai_citation_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"report_type" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"row_count" integer NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bing_ai_page_citations" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"project_id" text NOT NULL,
	"page" text NOT NULL,
	"citations" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bing_ai_query_citations" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"project_id" text NOT NULL,
	"query" text NOT NULL,
	"intent" text NOT NULL,
	"topic" text NOT NULL,
	"citations" integer NOT NULL,
	"citation_share_percent" real NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bing_ai_citation_days" ADD CONSTRAINT "bing_ai_citation_days_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bing_ai_citation_days" ADD CONSTRAINT "bing_ai_citation_days_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bing_ai_citation_snapshots" ADD CONSTRAINT "bing_ai_citation_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bing_ai_citation_snapshots" ADD CONSTRAINT "bing_ai_citation_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bing_ai_page_citations" ADD CONSTRAINT "bing_ai_page_citations_snapshot_id_bing_ai_citation_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."bing_ai_citation_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bing_ai_page_citations" ADD CONSTRAINT "bing_ai_page_citations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bing_ai_query_citations" ADD CONSTRAINT "bing_ai_query_citations_snapshot_id_bing_ai_citation_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."bing_ai_citation_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bing_ai_query_citations" ADD CONSTRAINT "bing_ai_query_citations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bing_ai_citation_days_project_date_idx" ON "bing_ai_citation_days" USING btree ("project_id","date");--> statement-breakpoint
CREATE INDEX "bing_ai_citation_days_organization_idx" ON "bing_ai_citation_days" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bing_ai_citation_snapshots_project_type_idx" ON "bing_ai_citation_snapshots" USING btree ("project_id","report_type");--> statement-breakpoint
CREATE INDEX "bing_ai_citation_snapshots_organization_idx" ON "bing_ai_citation_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bing_ai_page_citations_snapshot_idx" ON "bing_ai_page_citations" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "bing_ai_query_citations_snapshot_idx" ON "bing_ai_query_citations" USING btree ("snapshot_id");