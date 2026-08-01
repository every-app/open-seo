CREATE TABLE "billing_customer_status" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"is_paying" boolean DEFAULT false NOT NULL,
	"paid_plan_id" text,
	"paid_plan_status" text,
	"customer_json" text NOT NULL,
	"synced_at" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
DROP INDEX "projects_one_default_per_organization_idx";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "archived_at" text;--> statement-breakpoint
ALTER TABLE "billing_customer_status" ADD CONSTRAINT "billing_customer_status_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_one_default_per_organization_idx" ON "projects" USING btree ("organization_id") WHERE "projects"."name" = 'Default' AND "projects"."domain" IS NULL AND "projects"."archived_at" IS NULL;