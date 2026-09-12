CREATE TABLE "seo_provider_settings" (
	"provider" text DEFAULT 'dataforseo' NOT NULL,
	"organization_id" text,
	"project_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"credentials" text,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seo_provider_settings" ADD CONSTRAINT "seo_provider_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_provider_settings" ADD CONSTRAINT "seo_provider_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seo_provider_settings_org_idx" ON "seo_provider_settings" USING btree ("provider","organization_id") WHERE "seo_provider_settings"."project_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "seo_provider_settings_project_idx" ON "seo_provider_settings" USING btree ("provider","project_id") WHERE "seo_provider_settings"."organization_id" is null;