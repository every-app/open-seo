CREATE TABLE "backlink_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"domain" text NOT NULL,
	"rank" integer,
	"backlinks" integer,
	"referring_domains" integer,
	"broken_backlinks" integer,
	"new_backlinks" integer,
	"lost_backlinks" integer,
	"new_referring_domains" integer,
	"lost_referring_domains" integer,
	"captured_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_activation_state" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"first_mcp_authorized_at" text,
	"first_mcp_tool_call_at" text,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activation_state" (
	"project_id" text PRIMARY KEY NOT NULL,
	"competitor_step_clicked_at" text,
	"mcp_card_dismissed_at" text,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backlink_snapshots" ADD CONSTRAINT "backlink_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_activation_state" ADD CONSTRAINT "organization_activation_state_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activation_state" ADD CONSTRAINT "project_activation_state_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backlink_snapshots_project_captured_idx" ON "backlink_snapshots" USING btree ("project_id","captured_at");