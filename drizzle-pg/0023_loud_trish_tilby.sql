CREATE TABLE "content_execution_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"target_url" text,
	"status" text DEFAULT 'ready_to_assign' NOT NULL,
	"owner" text,
	"due_date" text,
	"jira_issue_key" text,
	"jira_issue_url" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_execution_keyword_assignments" (
	"execution_item_id" text NOT NULL,
	"saved_keyword_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_execution_items" ADD CONSTRAINT "content_execution_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_execution_keyword_assignments" ADD CONSTRAINT "content_execution_keyword_assignments_execution_item_id_content_execution_items_id_fk" FOREIGN KEY ("execution_item_id") REFERENCES "public"."content_execution_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_execution_keyword_assignments" ADD CONSTRAINT "content_execution_keyword_assignments_saved_keyword_id_saved_keywords_id_fk" FOREIGN KEY ("saved_keyword_id") REFERENCES "public"."saved_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_execution_items_project_updated_idx" ON "content_execution_items" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_execution_keyword_assignment_pair_idx" ON "content_execution_keyword_assignments" USING btree ("execution_item_id","saved_keyword_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_execution_keyword_one_page_idx" ON "content_execution_keyword_assignments" USING btree ("saved_keyword_id");--> statement-breakpoint
CREATE INDEX "content_execution_keyword_item_idx" ON "content_execution_keyword_assignments" USING btree ("execution_item_id");