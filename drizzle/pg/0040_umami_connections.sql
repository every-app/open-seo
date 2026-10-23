CREATE TABLE "umami_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"website_id" text NOT NULL,
	"website_name" text NOT NULL,
	"website_domain" text,
	"time_zone" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "umami_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"base_url" text NOT NULL,
	"auth_type" text NOT NULL,
	"username" text,
	"encrypted_secret" text NOT NULL,
	"encrypted_headers" text,
	"saved_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "umami_connections" ADD CONSTRAINT "umami_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "umami_connections" ADD CONSTRAINT "umami_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "umami_connections" ADD CONSTRAINT "umami_connections_instance_id_umami_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."umami_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "umami_instances" ADD CONSTRAINT "umami_instances_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "umami_connections_project_idx" ON "umami_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "umami_connections_organization_idx" ON "umami_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "umami_connections_instance_idx" ON "umami_connections" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "umami_instances_organization_idx" ON "umami_instances" USING btree ("organization_id");