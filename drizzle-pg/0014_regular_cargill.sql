CREATE TABLE "indexing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"url" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"response_body" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexnow_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"host" text NOT NULL,
	"key" text NOT NULL,
	"key_location" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "indexing_events" ADD CONSTRAINT "indexing_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indexing_events" ADD CONSTRAINT "indexing_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indexnow_configs" ADD CONSTRAINT "indexnow_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indexnow_configs" ADD CONSTRAINT "indexnow_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indexing_events_project_created_idx" ON "indexing_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "indexing_events_organization_idx" ON "indexing_events" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "indexnow_configs_project_idx" ON "indexnow_configs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "indexnow_configs_organization_idx" ON "indexnow_configs" USING btree ("organization_id");