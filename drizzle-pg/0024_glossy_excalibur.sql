CREATE TABLE "rapidapi_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"captured_on" text NOT NULL,
	"active_subscribers" integer NOT NULL,
	"paying_subscribers" integer,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rapidapi_snapshots" ADD CONSTRAINT "rapidapi_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rapidapi_snapshots" ADD CONSTRAINT "rapidapi_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rapidapi_snapshots_project_day_idx" ON "rapidapi_snapshots" USING btree ("project_id","captured_on");--> statement-breakpoint
CREATE INDEX "rapidapi_snapshots_organization_idx" ON "rapidapi_snapshots" USING btree ("organization_id");