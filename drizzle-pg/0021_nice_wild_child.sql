CREATE TABLE "project_ai_models" (
	"project_id" text NOT NULL,
	"provider" text NOT NULL,
	"model_name" text NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "project_ai_models_project_id_provider_pk" PRIMARY KEY("project_id","provider")
);
--> statement-breakpoint
ALTER TABLE "project_ai_models" ADD CONSTRAINT "project_ai_models_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;