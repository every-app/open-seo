CREATE TABLE "ai_agent_settings" (
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"organization_id" text,
	"project_id" text,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_agent_settings" ADD CONSTRAINT "ai_agent_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_settings" ADD CONSTRAINT "ai_agent_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;